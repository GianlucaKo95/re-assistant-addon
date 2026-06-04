'use strict';
/**
 * dna.js — Anforderungs-DNA Engine
 * Berechnet semantische Fingerabdrücke, erkennt Drift,
 * baut den Genealogie-Graph und das Ähnlichkeitsnetzwerk.
 */
const { query, queryOne, queryAll, withTransaction } = require('./db');

// ── Konfiguration ─────────────────────────────────────────────
const DNA_VECTOR_DIM   = 256;  // Erhöhte Dimensionalität gegenüber RAG
const DRIFT_THRESHOLD  = 0.25; // Ab hier gilt es als Drift
const SIMILARITY_MIN   = 0.65; // Minimum für Ähnlichkeits-Cache
const BATCH_SIZE       = 20;   // DNA-Berechnungen pro Job-Runde

// ── Vektor-Berechnung ─────────────────────────────────────────
/**
 * Berechnet den semantischen DNA-Vektor einer Anforderung.
 * Kombiniert: TF-IDF-Hashing + strukturelle Features + Qualitäts-Features
 */
function computeDNAVector(req) {
  const vec = new Float32Array(DNA_VECTOR_DIM).fill(0);

  // ── Textuelle Komponente (erste 128 Dimensionen) ───────────
  const text = `${req.title} ${req.description || ''} ${req.rationale || ''}`;
  const words = tokenize(text);
  for (const word of words) {
    const h = hash(word);
    // Doppelte Gewichtung für Titel-Wörter
    const titleBoost = req.title.toLowerCase().includes(word) ? 2 : 1;
    vec[Math.abs(h) % 128] += titleBoost;
    // Bi-gram Hashing in zweiten 32 Dims
    if (words.indexOf(word) < words.length - 1) {
      const bigram = word + '_' + words[words.indexOf(word) + 1];
      vec[128 + Math.abs(hash(bigram)) % 32] += 0.5;
    }
  }

  // ── Strukturelle Komponente (Dims 160-191) ─────────────────
  const structOffset = 160;
  vec[structOffset + 0]  = categoryVector(req.category);
  vec[structOffset + 1]  = priorityVector(req.priority);
  vec[structOffset + 2]  = Math.min((req.acceptanceCriteria?.length || 0) / 10, 1);
  vec[structOffset + 3]  = Math.min((req.comments?.length || 0) / 20, 1);
  vec[structOffset + 4]  = (req.qualityScore || 0) / 10;
  vec[structOffset + 5]  = req.reviewStatus === 'approved' ? 1 : req.reviewStatus === 'in_review' ? 0.5 : 0;
  vec[structOffset + 6]  = req.assignedTo ? 1 : 0;
  vec[structOffset + 7]  = Math.min((req.tags?.length || 0) / 5, 1);
  vec[structOffset + 8]  = statusVector(req.status);
  vec[structOffset + 9]  = (req.description?.length || 0) / 2000;  // Vollständigkeit
  vec[structOffset + 10] = (req.title?.length || 0) / 200;
  vec[structOffset + 11] = req.decomposed ? 1 : 0;

  // ── Qualitäts-DNA (Dims 192-223) ──────────────────────────
  const qOffset = 192;
  const ambiguityScore  = detectAmbiguity(text);
  const specificityScore = detectSpecificity(text);
  const completenessScore = computeCompleteness(req);
  vec[qOffset + 0] = ambiguityScore;
  vec[qOffset + 1] = specificityScore;
  vec[qOffset + 2] = completenessScore;
  vec[qOffset + 3] = detectPassiveVoice(text);
  vec[qOffset + 4] = detectMeasurability(text);

  // ── Normalisieren ─────────────────────────────────────────
  const mag = Math.sqrt(Array.from(vec).reduce((s, v) => s + v * v, 0)) || 1;
  return Array.from(vec).map(v => v / mag);
}

/**
 * Berechnet strukturelle Features als lesbares Objekt.
 */
function computeFeatures(req) {
  const text = `${req.title} ${req.description || ''}`;
  return {
    wordCount:        tokenize(text).length,
    sentenceCount:    (text.match(/[.!?]+/g) || []).length,
    hasMetrics:       detectMeasurability(text) > 0.5,
    hasAmbiguity:     detectAmbiguity(text) > 0.5,
    acCount:          req.acceptanceCriteria?.length || 0,
    tagCount:         req.tags?.length || 0,
    hasRationale:     (req.rationale?.length || 0) > 20,
    category:         req.category,
    priority:         req.priority,
    reviewStatus:     req.reviewStatus,
    qualityScore:     req.qualityScore,
  };
}

/**
 * Erstellt eine kompakte Signatur (Hash) des Vektors.
 */
function vectorSignature(vec) {
  // SimHash: stabile, vergleichbare Signatur
  const bits = vec.map(v => v > 0 ? '1' : '0').join('');
  return bits.substring(0, 64);
}

// ── Drift-Erkennung ───────────────────────────────────────────
/**
 * Vergleicht zwei Vektoren und klassifiziert den Drift-Typ.
 */
function analyzeDrift(prevVector, newVector, prevReq, newReq) {
  if (!prevVector?.length || !newVector?.length) return { score: 0, type: 'none' };

  const similarity = cosineSimilarity(prevVector, newVector);
  const driftScore = 1 - similarity;

  if (driftScore < 0.1) return { score: driftScore, type: 'none' };

  // Struktureller vs. inhaltlicher Drift
  const textSim = cosineSimilarity(
    prevVector.slice(0, 128),
    newVector.slice(0, 128)
  );
  const structSim = cosineSimilarity(
    prevVector.slice(160, 192),
    newVector.slice(160, 192)
  );

  let type = 'none';
  if (driftScore < DRIFT_THRESHOLD) {
    type = 'refinement';     // Kleine Verbesserung
  } else if (textSim < 0.3) {
    type = 'rewrite';        // Komplett neu geschrieben
  } else if (structSim < 0.5) {
    type = 'scope_change';   // Scope hat sich geändert
  } else {
    type = 'refinement';
  }

  // Spezialfall: Messbarkeit verbessert
  const prevMeasurable = prevVector[160 + 4] || 0;
  const newMeasurable  = newVector[160 + 4]  || 0;
  if (newMeasurable > prevMeasurable + 0.3) type = 'refinement';

  return { score: parseFloat(driftScore.toFixed(4)), type };
}

// ── Genealogie-Erkennung ──────────────────────────────────────
/**
 * Findet automatisch Eltern-Kind-Beziehungen zwischen Anforderungen.
 */
async function detectGenealogy(req, allReqs) {
  const relations = [];
  const reqVec = computeDNAVector(req);

  for (const other of allReqs) {
    if (other.id === req.id) continue;
    const otherVec = computeDNAVector(other);
    const sim = cosineSimilarity(reqVec, otherVec);
    if (sim < SIMILARITY_MIN) continue;

    let relationType = null;
    let confidence   = sim;

    // Dekompositions-Erkennung
    if (other.tags?.includes(`aus:${req.id}`) ||
        other.rationale?.includes(req.id)) {
      relationType = 'derives_from';
      confidence   = 0.95;
    }
    // Semantisches Duplikat
    else if (sim > 0.90 && other.systemId !== req.systemId) {
      relationType = 'duplicates';
      confidence   = sim;
    }
    // Cross-System Ähnlichkeit
    else if (sim > 0.75 && other.systemId !== req.systemId) {
      relationType = 'relates_to';
      confidence   = sim;
    }
    // Gleiche System-Verfeinerung
    else if (sim > 0.70 && other.systemId === req.systemId) {
      relationType = 'relates_to';
      confidence   = sim;
    }

    if (relationType) {
      relations.push({
        targetId:     other.id,
        relationType,
        confidence:   parseFloat(confidence.toFixed(3)),
        autoDetected: true,
      });
    }
  }
  return relations;
}

// ── DNA Background-Job ────────────────────────────────────────
let _jobRunning = false;

/**
 * Verarbeitet die DNA-Queue — läuft alle 30 Sekunden.
 */
async function processDNAQueue() {
  if (_jobRunning) return;
  _jobRunning = true;
  try {
    const queued = await queryAll(
      'SELECT req_id FROM dna_queue WHERE started_at IS NULL ORDER BY priority ASC, queued_at ASC LIMIT $1',
      [BATCH_SIZE]
    );
    if (!queued.length) return;

    // Als "gestartet" markieren
    const ids = queued.map(q => q.req_id);
    await query(`UPDATE dna_queue SET started_at=NOW() WHERE req_id=ANY($1)`, [ids]);

    for (const { req_id } of queued) {
      try {
        await computeAndStoreDNA(req_id);
        await query('DELETE FROM dna_queue WHERE req_id=$1', [req_id]);
      } catch(e) {
        await query('UPDATE dna_queue SET error=$1, started_at=NULL WHERE req_id=$2', [e.message, req_id]);
        console.error(`[DNA] Fehler für ${req_id}:`, e.message);
      }
    }
  } finally {
    _jobRunning = false;
  }
}

/**
 * Berechnet und speichert DNA für eine Anforderung.
 */
async function computeAndStoreDNA(reqId) {
  const row = await queryOne('SELECT * FROM requirements WHERE id=$1', [reqId]);
  if (!row) return;

  const req = {
    id: row.id, systemId: row.system_id, title: row.title,
    description: row.description, rationale: row.rationale,
    category: row.category, priority: row.priority, status: row.status,
    qualityScore: row.quality_score ? parseFloat(row.quality_score) : null,
    reviewStatus: row.review_status, assignedTo: row.assigned_to,
    acceptanceCriteria: row.acceptance_criteria || [],
    comments: row.comments || [], tags: row.tags || [],
    decomposed: row.decomposed,
  };

  const newVector  = computeDNAVector(req);
  const features   = computeFeatures(req);
  const signature  = vectorSignature(newVector);
  const qualityDNA = {
    ambiguity:    detectAmbiguity(`${req.title} ${req.description||''}`),
    specificity:  detectSpecificity(`${req.title} ${req.description||''}`),
    completeness: computeCompleteness(req),
    measurability:detectMeasurability(`${req.title} ${req.description||''}`),
  };

  // Vorherigen Vektor laden für Drift-Analyse
  const existing = await queryOne('SELECT vector FROM requirement_dna WHERE req_id=$1', [reqId]);
  let driftScore = 0, driftType = 'none', driftDetectedAt = null;

  if (existing?.vector?.length) {
    const drift = analyzeDrift(existing.vector, newVector, null, req);
    driftScore = drift.score;
    driftType  = drift.type;
    if (drift.score >= DRIFT_THRESHOLD) driftDetectedAt = new Date();
  }

  await withTransaction(async (client) => {
    await client.query(`
      INSERT INTO requirement_dna
        (req_id, vector, signature, features, prev_vector, drift_score, drift_type, drift_detected_at, quality_dna, computed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (req_id) DO UPDATE SET
        prev_vector       = requirement_dna.vector,
        vector            = EXCLUDED.vector,
        signature         = EXCLUDED.signature,
        features          = EXCLUDED.features,
        drift_score       = EXCLUDED.drift_score,
        drift_type        = EXCLUDED.drift_type,
        drift_detected_at = COALESCE(EXCLUDED.drift_detected_at, requirement_dna.drift_detected_at),
        quality_dna       = EXCLUDED.quality_dna,
        computed_at       = NOW()`,
      [reqId, JSON.stringify(newVector), signature, JSON.stringify(features),
       existing?.vector ? JSON.stringify(existing.vector) : null,
       driftScore, driftType, driftDetectedAt, JSON.stringify(qualityDNA)]
    );

    // Ähnlichkeiten zu anderen Anforderungen im selben System berechnen
    const siblings = await client.query(
      `SELECT d.req_id, d.vector FROM requirement_dna d
       JOIN requirements r ON r.id = d.req_id
       WHERE r.system_id = (SELECT system_id FROM requirements WHERE id=$1)
         AND d.req_id != $1
         AND d.computed_at > NOW() - INTERVAL '30 days'
       LIMIT 100`,
      [reqId]
    );

    for (const sibling of siblings.rows) {
      if (!sibling.vector) continue;
      const sim = cosineSimilarity(newVector, sibling.vector);
      if (sim < SIMILARITY_MIN) continue;

      const [a, b] = [reqId, sibling.req_id].sort();
      await client.query(`
        INSERT INTO req_similarities (req_id_a, req_id_b, similarity, cross_system, computed_at)
        VALUES ($1, $2, $3, FALSE, NOW())
        ON CONFLICT (req_id_a, req_id_b) DO UPDATE SET similarity=EXCLUDED.similarity, computed_at=NOW()`,
        [a, b, parseFloat(sim.toFixed(4))]
      );
    }

    // Cross-System Ähnlichkeiten (top 20 ähnlichste aus anderen Systemen)
    const crossSystem = await client.query(
      `SELECT d.req_id, d.vector FROM requirement_dna d
       JOIN requirements r ON r.id = d.req_id
       WHERE r.system_id != (SELECT system_id FROM requirements WHERE id=$1)
         AND d.req_id != $1
         AND d.computed_at > NOW() - INTERVAL '7 days'
       LIMIT 200`,
      [reqId]
    );

    const crossScored = crossSystem.rows
      .map(r => ({ reqId: r.req_id, sim: cosineSimilarity(newVector, r.vector || []) }))
      .filter(r => r.sim >= SIMILARITY_MIN + 0.05)  // Höherer Threshold cross-system
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 20);

    for (const { reqId: otherId, sim } of crossScored) {
      const [a, b] = [reqId, otherId].sort();
      await client.query(`
        INSERT INTO req_similarities (req_id_a, req_id_b, similarity, cross_system, computed_at)
        VALUES ($1, $2, $3, TRUE, NOW())
        ON CONFLICT (req_id_a, req_id_b) DO UPDATE SET similarity=EXCLUDED.similarity, computed_at=NOW()`,
        [a, b, parseFloat(sim.toFixed(4))]
      );
    }
  });
}

/**
 * Anforderung in DNA-Queue einreihen.
 */
async function enqueueDNA(reqId, priority = 5) {
  await query(
    'INSERT INTO dna_queue (req_id, priority) VALUES ($1,$2) ON CONFLICT (req_id) DO UPDATE SET priority=LEAST(dna_queue.priority,$2), started_at=NULL',
    [reqId, priority]
  );
}

/**
 * Alle Anforderungen eines Systems neu berechnen.
 */
async function recomputeSystemDNA(systemId) {
  const reqs = await queryAll(
    'SELECT id FROM requirements WHERE system_id=$1 AND (archived IS FALSE OR archived IS NULL)',
    [systemId]
  );
  for (const { id } of reqs) await enqueueDNA(id, 8);
  return reqs.length;
}

// ── Hilfsfunktionen ───────────────────────────────────────────
function tokenize(text) {
  const stopWords = new Set(['das','die','der','ein','eine','einen','einem','und','oder','aber','ist',
    'sind','wird','werden','soll','muss','kann','the','a','an','and','or','is','are','will','shall']);
  return (text || '').toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return h;
}

function categoryVector(cat) {
  const map = { 'Funktional':0.9, 'Nicht-funktional':0.7, 'Sicherheit':0.8, 'Performance':0.6,
    'UI/UX':0.5, 'Daten':0.4, 'Integration':0.3, 'Wartbarkeit':0.2 };
  return map[cat] || 0.5;
}
function priorityVector(p) { return { high:1, medium:0.5, low:0.1 }[p] || 0.5; }
function statusVector(s)   { return { open:0.2, assigned:0.5, 'in-progress':0.7, done:1 }[s] || 0.3; }

function detectAmbiguity(text) {
  const ambiguous = ['schnell','einfach','benutzerfreundlich','modern','gut','nahtlos','intuitiv',
    'schnellstmöglich','zeitnah','angemessen','flexible','robust','efficient','user-friendly','easy'];
  const words = text.toLowerCase().split(/\s+/);
  return Math.min(ambiguous.filter(a => words.includes(a)).length / 3, 1);
}

function detectSpecificity(text) {
  const specific = /\d+\s*(ms|sekunden?|minuten?|stunden?|mb|gb|%|requests?|nutzer|user)/gi;
  const matches  = (text.match(specific) || []).length;
  return Math.min(matches / 3, 1);
}

function detectMeasurability(text) {
  const measurable = /\b(\d+(\.\d+)?\s*(ms|s|min|h|mb|gb|kb|%|req|user|nutzer|mal))\b/gi;
  return Math.min((text.match(measurable) || []).length / 2, 1);
}

function detectPassiveVoice(text) {
  const passive = /\b(wird|werden|wurde|wurden|worden)\b/gi;
  return Math.min((text.match(passive) || []).length / 5, 1);
}

function computeCompleteness(req) {
  let score = 0;
  if (req.title?.length > 10)              score += 0.2;
  if (req.description?.length > 50)        score += 0.2;
  if (req.rationale?.length > 20)          score += 0.15;
  if ((req.acceptanceCriteria?.length||0) > 0) score += 0.25;
  if ((req.tags?.length||0) > 0)           score += 0.1;
  if (req.qualityScore > 7)                score += 0.1;
  return parseFloat(score.toFixed(2));
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; ma += a[i]*a[i]; mb += b[i]*b[i]; }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb) || 1);
}

// ── Job-Timer starten ─────────────────────────────────────────
function startDNAWorker(intervalMs = 30000) {
  console.log('[DNA] Worker gestartet — Intervall:', intervalMs / 1000 + 's');
  setInterval(processDNAQueue, intervalMs);
  // Sofort einmal laufen lassen
  setTimeout(processDNAQueue, 3000);
}

module.exports = {
  computeDNAVector, computeFeatures, vectorSignature,
  analyzeDrift, detectGenealogy,
  enqueueDNA, processDNAQueue, computeAndStoreDNA,
  recomputeSystemDNA, startDNAWorker,
  cosineSimilarity, DRIFT_THRESHOLD, SIMILARITY_MIN,
};
