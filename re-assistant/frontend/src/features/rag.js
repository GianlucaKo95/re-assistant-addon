'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
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
    const res = await fetch('/api/embeddings/store', {
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
    const res = await fetch('/api/embeddings/search', {
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
async function buildRAGContext(systemId, userQuery) {
  if (!systemId) return '';

  // Parallel: semantische Suche + normale Dokumente
  const results = await semanticSearch(systemId, userQuery, 5);

  if (!results.length) {
    // Fallback: normale Dokument-Chunks
    const sys = S.systems.find(s => s.id === systemId);
    return getCtx(sys, 20000);
  }

  const ragContext = results
    .filter(r => r.score > 0.1)  // Relevanz-Schwelle
    .map(r => `[${r.docName}]\n${r.text}`)
    .join('\n\n---\n\n');

  return ragContext
    ? `Relevante Dokumentation:\n\n${ragContext}`
    : '';
}

// ── RAG-Status für ein System anzeigen ───────────────────────
async function showRAGStatus(systemId) {
  const sys = S.systems.find(s => s.id === systemId);
  if (!sys) return;

  try {
    const res = await fetch(`/api/embeddings/search`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemId, query: 'test', topK: 1 })
    });
    const data = await res.json();
    const hasEmbeddings = !data.fallback && data.results?.length > 0;
    const docCount      = sys.docs?.length || 0;

    openModal(`📚 Wissens-Index: ${sys.name}`, `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--s2);border-radius:10px">
          <span style="font-size:24px">${hasEmbeddings ? '✅' : '⚠'}</span>
          <div>
            <div style="font-size:13px;font-weight:600">
              ${hasEmbeddings ? 'Semantische Suche aktiv' : 'Nur Textsuche (keine Embeddings)'}
            </div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">
              ${docCount} Dokument(e) · ${hasEmbeddings ? 'Voll indiziert' : 'Noch nicht indiziert'}
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
window.semanticSearch    = semanticSearch;
window.indexDocument     = indexDocument;
window.indexSystemDocs   = indexSystemDocs;
window.showRAGStatus     = showRAGStatus;
window.runIndexing       = runIndexing;
window.chunkDocument     = chunkDocument;
