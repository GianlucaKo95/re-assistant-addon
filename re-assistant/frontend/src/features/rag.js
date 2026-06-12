'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/rag.js
 * RAG (Retrieval-Augmented Generation) — Frontend
 * Dokumente chunken, Embeddings speichern, semantische Suche für KI-Chats.
 */

// ── Chunking ──────────────────────────────────────────────────
function chunkDocument(text, docName, chunkSize = 800, overlap = 100) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks    = [];
  let current     = '';
  let charCount   = 0;

  for (const sentence of sentences) {
    if (charCount + sentence.length > chunkSize && current.length > 0) {
      chunks.push({ text: current.trim(), docName });
      // Overlap: letzte 100 Zeichen in nächsten Chunk übernehmen
      const overlapText = current.slice(-overlap);
      current   = overlapText + ' ' + sentence;
      charCount = current.length;
    } else {
      current   += (current ? ' ' : '') + sentence;
      charCount += sentence.length;
    }
  }
  if (current.trim()) chunks.push({ text: current.trim(), docName });
  return chunks;
}

// ── Dokument indexieren ───────────────────────────────────────
async function indexDocument(systemId, doc) {
  if (!doc?.content || doc.content.length < 50) return;
  const chunks = chunkDocument(doc.content, doc.name);
  if (!chunks.length) return;

  try {
    const res = await fetch('api/embeddings/store', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemId, docId: doc.id, docName: doc.name, chunks })
    });
    const data = await res.json();
    if (data.ok) log_rag(`✓ Indexiert: ${doc.name} (${chunks.length} Chunks)`);
    return data;
  } catch(e) {
    log_rag(`✗ Indexierung fehlgeschlagen: ${doc.name} — ${e.message}`);
  }
}

// ── System-Dokumente alle indexieren ─────────────────────────
async function indexSystemDocs(systemId, onProgress) {
  const sys = S.systems.find(s => s.id === systemId);
  if (!sys?.docs?.length) return { indexed: 0 };

  let indexed = 0;
  for (const doc of sys.docs) {
    if (onProgress) onProgress(doc.name, indexed, sys.docs.length);
    await indexDocument(systemId, doc);
    indexed++;
  }
  return { indexed };
}

// ── Semantische Suche ─────────────────────────────────────────
async function semanticSearch(systemId, query, topK = 5) {
  try {
    const res = await fetch('api/embeddings/search', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemId, query, topK })
    });
    const data = await res.json();
    return data.results || [];
  } catch(e) {
    return [];
  }
}

// ── RAG-angereicherten Kontext für KI-Chats bauen ────────────
// Gecachten Kontext laden
async function getCachedContext(systemId) {
  try {
    const res  = await fetch(`api/systems/${systemId}/context-cache`, { credentials:'include' });
    const data = await res.json();

    if (!data.hasCache) {
      // Cache existiert nicht — im Hintergrund anstoßen für nächstes Mal
      if (data.status !== 'building') {
        fetch(`api/systems/${systemId}/rebuild-cache`, { method:'POST', credentials:'include' }).catch(()=>{});
      }
      return null;
    }

    // Vollständige Zusammenfassung laden
    const full = await fetch(`api/embeddings/summary?systemId=${systemId}`, { credentials:'include' });
    if (!full.ok) return null;
    const summary = await full.json();
    return summary.summary || null;
  } catch(e) { return null; }
}

async function buildRAGContext(systemId, userQuery) {
  if (!systemId) return '';
  const q = (userQuery || '').toLowerCase();

  // 1. Überblick-Fragen → gecachte Zusammenfassung nutzen
  const isOverviewQuery = /überblick|übersicht|zusammenfassung|alles|komplett|gesamt|alle funk|was kann|was macht|erklär|beschreib|zeig mir|worum geht|vorstell/i.test(q);

  if (isOverviewQuery) {
    const cached = await getCachedContext(systemId);
    if (cached) {
      return `Systemzusammenfassung (KI-analysiert):\n\n${cached}`;
    }
    return await buildFullContext(systemId, 12000);
  }

  // 2. Spezifische Fragen → semantische Suche + Kontext-Cache als Basis
  const [results, cached] = await Promise.all([
    semanticSearch(systemId, userQuery, 8),
    getCachedContext(systemId),
  ]);

  const parts = [];

  // Gecachte Zusammenfassung als Basis (gekürzt)
  if (cached) {
    parts.push(`Systemüberblick:\n${cached.substring(0, 2000)}\n…`);
  }

  // Spezifische Chunks obendrauf
  const relevant = results.filter(r => r.score > 0.05);
  if (relevant.length) {
    const byDoc = {};
    for (const r of relevant) {
      if (!byDoc[r.docName]) byDoc[r.docName] = [];
      byDoc[r.docName].push(r.text);
    }
    const specific = Object.entries(byDoc)
      .map(([name, texts]) => `[${name}]\n${texts.slice(0,2).join(' … ')}`)
      .join('\n\n---\n\n');
    parts.push(`Relevante Details:\n\n${specific}`);
  }

  if (!parts.length) return await buildFullContext(systemId, 8000);
  return parts.join('\n\n════════\n\n');
}

// Vollständiger Kontext aller Dokumente (für Überblick-Fragen)
async function buildFullContext(systemId, maxChars = 10000) {
  try {
    const res  = await fetch('api/embeddings/search', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemId, query: 'system funktionen überblick', topK: 20 })
    });
    const data = await res.json();
    const chunks = data.results || [];

    if (!chunks.length) return '';

    // Alle Dokumente einmal vertreten
    const byDoc = {};
    for (const c of chunks) {
      if (!byDoc[c.docName]) byDoc[c.docName] = c.text;
    }

    let context = Object.entries(byDoc)
      .map(([name, text]) => `[${name}]\n${text}`)
      .join('\n\n---\n\n');

    // Auf maxChars kürzen
    if (context.length > maxChars) {
      context = context.substring(0, maxChars) + '\n... (weiterer Kontext verfügbar)';
    }

    return context ? `Systemdokumentation (Überblick):\n\n${context}` : '';
  } catch(e) {
    return '';
  }
}

// ── RAG-Status für ein System anzeigen ───────────────────────
async function showRAGStatus(systemId) {
  const sys = S.systems.find(s => s.id === systemId);
  if (!sys) return;

  try {
    // Neue Status-Route nutzen
    const statusRes = await fetch(`api/systems/${systemId}/rag-status`, { credentials: 'include' });
    const status    = statusRes.ok ? await statusRes.json() : {};
    const hasEmbeddings = status.ready || false;
    const docCount      = sys.docs?.length || 0;
    const indexedDocs   = status.indexedDocs || 0;
    const totalChunks   = status.totalChunks || 0;

    openModal(`📚 Wissens-Index: ${sys.name}`, `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--s2);border-radius:10px">
          <span style="font-size:24px">${hasEmbeddings ? '✅' : '⚠'}</span>
          <div>
            <div style="font-size:13px;font-weight:600">
              ${hasEmbeddings ? 'Semantische Suche aktiv' : 'Nur Textsuche (keine Embeddings)'}
            </div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">
              ${docCount} Dokument(e) · ${indexedDocs} indexiert · ${totalChunks} Chunks
            </div>
          </div>
        </div>
      </div>

      <div style="font-size:12px;color:var(--t2);margin-bottom:14px">
        ${hasEmbeddings
          ? 'Die KI nutzt semantische Ähnlichkeit um relevante Passagen zu finden — auch wenn die exakten Wörter nicht übereinstimmen.'
          : 'Indexieren Sie die Dokumente damit die KI präziser auf Ihren Dokumentationsinhalt eingehen kann.'}
      </div>

      ${docCount ? `
        <div style="max-height:160px;overflow-y:auto;border:1px solid var(--b1);border-radius:8px;margin-bottom:14px">
          ${(sys.docs||[]).map(d => `
            <div style="padding:8px 12px;border-bottom:1px solid var(--b1);display:flex;justify-content:space-between;font-size:12px">
              <span>${esc(d.name)}</span>
              <span style="color:var(--t3)">${((d.size||0)/1024).toFixed(1)} KB</span>
            </div>`).join('')}
        </div>` : '<p style="font-size:12px;color:var(--t3)">Keine Dokumente hochgeladen.</p>'}

      <div style="display:flex;gap:8px">
        ${docCount ? `
          <button class="btn-primary" style="flex:1" onclick="closeModal();runIndexing('${systemId}')">
            ⚡ Jetzt indexieren
          </button>` : ''}
        <button class="btn-secondary" style="flex:1" onclick="closeModal()">Schließen</button>
      </div>`);
  } catch(e) {
    toast('❌ Status-Abfrage fehlgeschlagen');
  }
}

async function runIndexing(systemId) {
  const sys = S.systems.find(s => s.id === systemId);
  if (!sys?.docs?.length) { toast('ℹ Keine Dokumente vorhanden'); return; }

  // Progress-Toast
  const toastEl = document.getElementById('toast');
  if (toastEl) { toastEl.innerHTML = `⚡ Indexiere ${sys.docs.length} Dokument(e) …`; toastEl.classList.add('show'); }

  const result = await indexSystemDocs(systemId, (name, done, total) => {
    if (toastEl) toastEl.innerHTML = `⚡ ${done+1}/${total}: ${name}`;
  });

  setTimeout(() => toastEl?.classList.remove('show'), 3000);
  toast(`✅ ${result.indexed} Dokument(e) indexiert — Semantische Suche aktiv`);

  if (typeof addNotif === 'function')
    addNotif('📚', 'Wissens-Index aktualisiert', `${result.indexed} Dokumente für "${sys.name}"`, () => {});
}

function log_rag(msg) {
  console.log(`[RAG] ${msg}`);
}

// ── Patch: Chat-Funktionen mit RAG-Kontext anreichern ─────────
// Wird aufgerufen wenn ein System Dokumente hat und Embeddings vorhanden sind
window.buildRAGContext   = buildRAGContext;
window.buildFullContext  = buildFullContext;
window.semanticSearch    = semanticSearch;
window.indexDocument     = indexDocument;
window.indexSystemDocs   = indexSystemDocs;
window.showRAGStatus     = showRAGStatus;
window.runIndexing       = runIndexing;
window.chunkDocument     = chunkDocument;
