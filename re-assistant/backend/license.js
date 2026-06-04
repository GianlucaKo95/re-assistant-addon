'use strict';
/**
 * license.js — License key validation for on-premise deployments.
 *
 * Key format: RE-<base64url(payload)>.<hmac16>
 * Payload: { fingerprint, customer, seats, expiresAt, issued }
 *
 * The HMAC secret is embedded here. Generate a matching key via the
 * companion keygen tool (not shipped with the add-on).
 */

const crypto  = require('crypto');
const os      = require('os');

// Embedded secret — must match the key generator.
const LICENSE_SECRET = 're-assistant-lic-v1-9f2a8c4d';
const GRACE_MS       = 72 * 60 * 60 * 1000; // 72 hours

// ── Hardware Fingerprint ──────────────────────────────────────

function getFingerprint() {
  const ifaces = os.networkInterfaces();
  const macs   = [];
  for (const list of Object.values(ifaces)) {
    for (const addr of list) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00')
        macs.push(addr.mac.toLowerCase());
    }
  }
  macs.sort();
  const raw = `${os.hostname()}|${os.platform()}|${macs.join(',')}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ── Key parsing & signature verification ─────────────────────

function parseKey(keyStr) {
  const clean = (keyStr || '').trim().replace(/^RE-/, '');
  const dot   = clean.lastIndexOf('.');
  if (dot < 1) return { valid: false, error: 'Ungültiges Schlüsselformat' };

  const b64 = clean.slice(0, dot);
  const sig  = clean.slice(dot + 1);

  const expected = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(b64)
    .digest('hex')
    .slice(0, 16);

  // Pad to same length for timingSafeEqual
  const pad = (s, len) => s.padEnd(len, '0');
  const len = Math.max(expected.length, sig.length);
  if (!crypto.timingSafeEqual(Buffer.from(pad(sig, len)), Buffer.from(pad(expected, len))))
    return { valid: false, error: 'Ungültige Signatur' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'Payload nicht lesbar' };
  }

  return { valid: true, payload };
}

// ── Main validation logic ─────────────────────────────────────

/**
 * Validate a key string against the current hardware.
 * Returns { ok, status, customer, seats, expiresAt, error }
 */
function validateKey(keyStr) {
  const { valid, error, payload } = parseKey(keyStr);
  if (!valid) return { ok: false, status: 'invalid', error };

  const now = Date.now();

  if (payload.expiresAt && now > payload.expiresAt)
    return { ok: false, status: 'expired', error: 'Lizenz abgelaufen',
      customer: payload.customer, expiresAt: payload.expiresAt };

  const fp = getFingerprint();
  if (payload.fingerprint && payload.fingerprint !== fp)
    return { ok: false, status: 'hardware_mismatch', error: 'Hardware-Fingerprint stimmt nicht überein',
      customer: payload.customer, expiresAt: payload.expiresAt };

  return {
    ok:        true,
    status:    'valid',
    customer:  payload.customer  || 'Unbekannt',
    seats:     payload.seats     || 1,
    expiresAt: payload.expiresAt || null,
    issued:    payload.issued    || null,
  };
}

// ── DB-backed status (with grace period) ─────────────────────

/**
 * Read current license status from DB, applying grace period logic.
 * Returns the license_info row enriched with { graceDaysLeft }.
 */
async function getStatus(queryOne) {
  const row = await queryOne('SELECT * FROM license_info WHERE id=$1', ['singleton']);
  if (!row) return { status: 'unlicensed' };

  const now = Date.now();
  let graceDaysLeft = null;

  if (row.status === 'grace' && row.grace_until) {
    const remaining = new Date(row.grace_until).getTime() - now;
    if (remaining <= 0) {
      // Grace expired — lock
      await queryOne(
        "UPDATE license_info SET status='locked', updated_at=NOW() WHERE id='singleton'"
      );
      row.status = 'locked';
    } else {
      graceDaysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000));
    }
  }

  return {
    status:       row.status,
    customer:     row.customer,
    fingerprint:  row.fingerprint,
    expiresAt:    row.expires_at ? new Date(row.expires_at).getTime() : null,
    seats:        row.seats,
    graceUntil:   row.grace_until ? new Date(row.grace_until).getTime() : null,
    graceDaysLeft,
    lastChecked:  row.last_checked ? new Date(row.last_checked).getTime() : null,
  };
}

/**
 * Activate a license key. Writes to DB.
 * Returns { ok, status, error? }
 */
async function activate(keyStr, query, queryOne) {
  const result = validateKey(keyStr);

  if (!result.ok) {
    // On hardware mismatch: enter grace period if we had a valid key before
    if (result.status === 'hardware_mismatch') {
      const existing = await queryOne('SELECT status FROM license_info WHERE id=$1', ['singleton']);
      if (existing?.status === 'valid') {
        const graceUntil = new Date(Date.now() + GRACE_MS);
        await query(
          `UPDATE license_info SET status='grace', grace_until=$1, updated_at=NOW() WHERE id='singleton'`,
          [graceUntil]
        );
        return { ok: false, status: 'grace', error: result.error, graceUntil: graceUntil.getTime() };
      }
    }
    return { ok: false, status: result.status, error: result.error };
  }

  const fp = getFingerprint();
  await query(
    `UPDATE license_info
     SET license_key=$1, customer=$2, fingerprint=$3, expires_at=$4, seats=$5,
         status='valid', grace_until=NULL, last_checked=NOW(), updated_at=NOW()
     WHERE id='singleton'`,
    [
      keyStr,
      result.customer,
      fp,
      result.expiresAt ? new Date(result.expiresAt) : null,
      result.seats,
    ]
  );

  return { ok: true, status: 'valid', customer: result.customer, seats: result.seats, expiresAt: result.expiresAt };
}

/**
 * Re-validate the stored key on startup. Logs the result.
 * If invalid/expired/locked and SKIP_LICENSE_CHECK is not set, exits.
 */
async function checkOnStartup(query, queryOne, log) {
  if (process.env.SKIP_LICENSE_CHECK === 'true') {
    log('warning', 'Lizenz-Prüfung übersprungen (SKIP_LICENSE_CHECK=true)');
    return;
  }

  const row = await queryOne('SELECT * FROM license_info WHERE id=$1', ['singleton']);
  if (!row) return;

  if (row.status === 'unlicensed') {
    log('warning', 'Keine Lizenz aktiviert — Bitte Lizenzschlüssel im Admin-Bereich eingeben.');
    return;
  }

  if (!row.license_key) {
    log('warning', 'Kein Lizenzschlüssel hinterlegt.');
    return;
  }

  const result = validateKey(row.license_key);

  if (result.ok) {
    // Update fingerprint + last_checked
    await query(
      "UPDATE license_info SET fingerprint=$1, last_checked=NOW(), status='valid', updated_at=NOW() WHERE id='singleton'",
      [getFingerprint()]
    );
    const exp = result.expiresAt ? new Date(result.expiresAt).toLocaleDateString('de-DE') : 'unbegrenzt';
    log('info', `Lizenz OK — Kunde: ${result.customer}, gültig bis: ${exp}, Seats: ${result.seats}`);
    return;
  }

  if (result.status === 'hardware_mismatch') {
    const now        = Date.now();
    const existing   = row.grace_until ? new Date(row.grace_until).getTime() : 0;
    const graceUntil = existing > now ? existing : now + GRACE_MS;

    await query(
      "UPDATE license_info SET status='grace', grace_until=$1, updated_at=NOW() WHERE id='singleton'",
      [new Date(graceUntil)]
    );
    const days = Math.ceil((graceUntil - now) / (24 * 60 * 60 * 1000));
    log('warning', `Lizenz: Hardware-Fingerprint geändert — Kulanzzeitraum: ${days} Tage verbleibend.`);
    return;
  }

  if (result.status === 'expired') {
    await query("UPDATE license_info SET status='expired', updated_at=NOW() WHERE id='singleton'");
    log('error', `Lizenz abgelaufen (${result.customer}). Bitte erneuern.`);
    return;
  }

  // Invalid signature etc.
  await query("UPDATE license_info SET status='invalid', updated_at=NOW() WHERE id='singleton'");
  log('error', `Lizenz ungültig: ${result.error}`);
}

module.exports = { getFingerprint, validateKey, getStatus, activate, checkOnStartup };
