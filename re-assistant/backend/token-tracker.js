'use strict';
/**
 * token-tracker.js — Token-Verbrauch tracken + Feature-Budgets enforzen
 * Wird vom AI-Proxy in server.js aufgerufen.
 */
const { query, queryOne, queryAll } = require('./db');

// Anthropic Preise (USD per 1M Tokens) — Stand 2025
const MODEL_PRICING = {
  'claude-opus-4-8':          { input: 15.00,  output: 75.00  },
  'claude-opus-4-7':          { input: 15.00,  output: 75.00  },
  'claude-opus-4-6':          { input: 15.00,  output: 75.00  },
  'claude-sonnet-4-6':        { input: 3.00,   output: 15.00  },
  'claude-haiku-4-5-20251001':{ input: 0.80,   output: 4.00   },
  'default':                  { input: 3.00,   output: 15.00  },
};

function calcCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;
  return (inputTokens / 1_000_000 * pricing.input) +
         (outputTokens / 1_000_000 * pricing.output);
}

// ── Token-Verbrauch speichern ─────────────────────────────────
async function trackUsage({ userId, systemId, feature, model, inputTokens, outputTokens }) {
  const cost = calcCost(model, inputTokens, outputTokens);
  try {
    await query(
      `INSERT INTO token_usage (user_id, system_id, feature, model, input_tokens, output_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId||null, systemId||null, feature||'other', model||'default', inputTokens||0, outputTokens||0, cost]
    );
  } catch(e) {
    console.error('[TOKEN] Tracking-Fehler:', e.message);
  }
  return cost;
}

// ── Feature-Budget prüfen ─────────────────────────────────────
async function checkBudget(feature) {
  try {
    const budget = await queryOne('SELECT * FROM feature_budgets WHERE feature=$1', [feature]);
    if (!budget) return { allowed: true };
    if (!budget.enabled) return { allowed: false, reason: `Feature "${feature}" ist deaktiviert` };
    if (!budget.monthly_limit_usd) return { allowed: true };

    // Monatsverbrauch
    const spent = await queryOne(
      `SELECT COALESCE(SUM(cost_usd), 0) as total
       FROM token_usage
       WHERE feature=$1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
      [feature]
    );
    const spentUsd = parseFloat(spent?.total || 0);
    const limitUsd = parseFloat(budget.monthly_limit_usd);

    if (spentUsd >= limitUsd) {
      return {
        allowed: false,
        reason:  `Monatliches Budget für "${feature}" ausgeschöpft ($${spentUsd.toFixed(2)} / $${limitUsd.toFixed(2)})`,
        spent:   spentUsd,
        limit:   limitUsd,
      };
    }

    // Warnung wenn Schwellwert überschritten
    const pct = spentUsd / limitUsd;
    return {
      allowed:  true,
      warning:  pct >= budget.alert_threshold ? `Budget zu ${Math.round(pct*100)}% verbraucht` : null,
      spent:    spentUsd,
      limit:    limitUsd,
      pct,
    };
  } catch(e) {
    console.error('[TOKEN] Budget-Check-Fehler:', e.message);
    return { allowed: true }; // Im Fehlerfall nicht blockieren
  }
}

// ── Usage-Statistiken ─────────────────────────────────────────
async function getUsageStats({ months = 3, userId, systemId, feature } = {}) {
  const conditions = [`created_at >= NOW() - INTERVAL '${parseInt(months)} months'`];
  const params     = [];
  const addP = (v) => { params.push(v); return `$${params.length}`; };

  if (userId)   conditions.push(`user_id=${addP(userId)}`);
  if (systemId) conditions.push(`system_id=${addP(systemId)}`);
  if (feature)  conditions.push(`feature=${addP(feature)}`);

  const where = conditions.join(' AND ');

  const [
    totalRow,
    byFeature,
    byDay,
    byUser,
    byModel,
    currentMonth,
    budgets,
  ] = await Promise.all([
    // Gesamt
    queryOne(`SELECT
      SUM(input_tokens) as input, SUM(output_tokens) as output,
      SUM(cost_usd) as cost, COUNT(*) as requests
      FROM token_usage WHERE ${where}`, params),
    // Nach Feature
    queryAll(`SELECT feature,
      SUM(input_tokens) as input, SUM(output_tokens) as output,
      SUM(cost_usd) as cost, COUNT(*) as requests
      FROM token_usage WHERE ${where}
      GROUP BY feature ORDER BY cost DESC`, params),
    // Täglich (letzte 30 Tage)
    queryAll(`SELECT
      DATE_TRUNC('day', created_at) as day,
      SUM(cost_usd) as cost,
      SUM(input_tokens+output_tokens) as tokens
      FROM token_usage WHERE created_at >= NOW() - INTERVAL '30 days'
      ${userId?`AND user_id=${addP(userId)}`:''}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day ASC`, params.slice(0, userId ? params.length : params.length)),
    // Nach User (Top 10)
    queryAll(`SELECT u.name, u.email, u.role,
      SUM(t.input_tokens) as input, SUM(t.output_tokens) as output,
      SUM(t.cost_usd) as cost, COUNT(*) as requests
      FROM token_usage t LEFT JOIN users u ON u.id=t.user_id
      WHERE ${where}
      GROUP BY u.name, u.email, u.role ORDER BY cost DESC LIMIT 10`, params),
    // Nach Modell
    queryAll(`SELECT model, SUM(cost_usd) as cost, COUNT(*) as requests
      FROM token_usage WHERE ${where}
      GROUP BY model ORDER BY cost DESC`, params),
    // Aktueller Monat Gesamt
    queryOne(`SELECT SUM(cost_usd) as cost, SUM(input_tokens+output_tokens) as tokens
      FROM token_usage WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      ${userId?`AND user_id='${userId}'`:''}`, []),
    // Budgets mit aktuellem Verbrauch
    queryAll(`SELECT fb.*,
      COALESCE((SELECT SUM(cost_usd) FROM token_usage t
        WHERE t.feature=fb.feature
          AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', NOW())), 0) as spent_this_month
      FROM feature_budgets fb ORDER BY feature`, []),
  ]);

  return {
    total: {
      inputTokens:  parseInt(totalRow?.input  || 0),
      outputTokens: parseInt(totalRow?.output || 0),
      totalTokens:  parseInt((totalRow?.input||0)) + parseInt((totalRow?.output||0)),
      costUsd:      parseFloat(totalRow?.cost || 0),
      requests:     parseInt(totalRow?.requests || 0),
    },
    currentMonth: {
      costUsd: parseFloat(currentMonth?.cost || 0),
      tokens:  parseInt(currentMonth?.tokens || 0),
    },
    byFeature: byFeature.map(r => ({
      feature:  r.feature,
      input:    parseInt(r.input  || 0),
      output:   parseInt(r.output || 0),
      costUsd:  parseFloat(r.cost || 0),
      requests: parseInt(r.requests || 0),
    })),
    byDay: byDay.map(r => ({
      day:     r.day,
      costUsd: parseFloat(r.cost || 0),
      tokens:  parseInt(r.tokens || 0),
    })),
    byUser: byUser.map(r => ({
      name:    r.name || '(unbekannt)',
      email:   r.email,
      role:    r.role,
      costUsd: parseFloat(r.cost || 0),
      requests:parseInt(r.requests || 0),
    })),
    byModel: byModel.map(r => ({
      model:   r.model,
      costUsd: parseFloat(r.cost || 0),
      requests:parseInt(r.requests || 0),
    })),
    budgets: budgets.map(b => ({
      feature:        b.feature,
      enabled:        b.enabled,
      monthlyLimit:   b.monthly_limit_usd ? parseFloat(b.monthly_limit_usd) : null,
      alertThreshold: parseFloat(b.alert_threshold),
      description:    b.description,
      spentThisMonth: parseFloat(b.spent_this_month || 0),
      pct:            b.monthly_limit_usd
        ? parseFloat(b.spent_this_month || 0) / parseFloat(b.monthly_limit_usd)
        : null,
    })),
  };
}

// ── Feature-Budget speichern ──────────────────────────────────
async function saveBudget({ feature, enabled, monthlyLimitUsd, alertThreshold }) {
  await query(`
    INSERT INTO feature_budgets (feature, enabled, monthly_limit_usd, alert_threshold, updated_at)
    VALUES ($1,$2,$3,$4,NOW())
    ON CONFLICT (feature) DO UPDATE SET
      enabled=$2, monthly_limit_usd=$3, alert_threshold=$4, updated_at=NOW()`,
    [feature, enabled, monthlyLimitUsd||null, alertThreshold||0.80]
  );
}

module.exports = { trackUsage, checkBudget, getUsageStats, saveBudget, calcCost, MODEL_PRICING };
