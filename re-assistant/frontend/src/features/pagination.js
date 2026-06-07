'use strict';
/**
 * features/pagination.js
 * Serverseitige Pagination für die Req-Liste.
 * Unterstützt: Seiten-Buttons, Infinite Scroll, Sortierung, Filterung.
 */

const PAGE_SIZE = 50; // Anforderungen pro Seite

// ── Paginierter API-Client ────────────────────────────────────
async function fetchReqsPage({ systemId, page = 0, limit = PAGE_SIZE, sort = 'created_at',
                                dir = 'asc', q = '', priority = '', category = '', status = '' } = {}) {
  const params = new URLSearchParams();
  if (systemId) params.set('systemId', systemId);
  params.set('page',  String(page));
  params.set('limit', String(limit));
  params.set('sort',  sort);
  params.set('dir',   dir);
  if (q)        params.set('q',        q);
  if (priority) params.set('priority', priority);
  if (category) params.set('category', category);
  if (status)   params.set('status',   status);

  const res  = await fetch(`/api/requirements?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Abwärtskompatibilität: falls Array → in Paginations-Format wrappen
  if (Array.isArray(data)) return { data, total: data.length, page: 0, pages: 1, limit: data.length };
  return data;
}

// ── Paginierungs-Controller ───────────────────────────────────
class PaginationController {
  constructor(opts = {}) {
    this.containerId = opts.containerId || 'req-list-paged';
    this.systemId    = opts.systemId    || null;
    this.pageSize    = opts.pageSize    || PAGE_SIZE;
    this.renderItem  = opts.renderItem  || (r => `<div>${r.title}</div>`);
    this.onLoaded    = opts.onLoaded    || null;
    this.infiniteScroll = opts.infiniteScroll ?? true;

    this._page     = 0;
    this._total    = 0;
    this._pages    = 0;
    this._loading  = false;
    this._filters  = { q:'', priority:'', category:'', status:'', sort:'created_at', dir:'asc' };
    this._observer = null;
  }

  setFilter(key, value) {
    this._filters[key] = value;
    this._page = 0;
    this.load(true);
  }

  setSystem(systemId) {
    this.systemId = systemId;
    this._page = 0;
    this.load(true);
  }

  async load(reset = false) {
    if (this._loading) return;
    this._loading = true;

    const container = document.getElementById(this.containerId);
    if (!container) { this._loading = false; return; }

    if (reset) {
      this._page = 0;
      container.innerHTML = '<div class="pg-loading"><div class="spin"></div><span>Lade …</span></div>';
    } else {
      this._appendLoader(container);
    }

    try {
      const result = await fetchReqsPage({
        systemId: this.systemId,
        page:     this._page,
        limit:    this.pageSize,
        ...this._filters,
      });

      this._total = result.total;
      this._pages = result.pages;

      if (reset) container.innerHTML = '';
      else container.querySelector('.pg-loader-sentinel')?.remove();

      if (reset && !result.data.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="es-icon">📋</div>
            <h3>Keine Anforderungen</h3>
            <p>${this._filters.q ? `Keine Treffer für "${this._filters.q}"` : 'Noch keine Anforderungen vorhanden.'}</p>
          </div>`;
        this._renderPagination(container);
        this._loading = false;
        return;
      }

      // Items rendern
      const frag = document.createDocumentFragment();
      for (const item of result.data) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this.renderItem(item);
        frag.appendChild(wrapper.firstElementChild || wrapper);
      }
      container.appendChild(frag);

      // Pagination-Footer
      this._renderPagination(container);

      // Infinite Scroll Sentinel
      if (this.infiniteScroll && this._page < this._pages - 1) {
        this._attachScrollSentinel(container);
      }

      this._page++;
      if (this.onLoaded) this.onLoaded(result);
    } catch(e) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'color:var(--red);padding:12px 16px;font-size:13px;text-align:center';
      errDiv.textContent = '❌ Fehler beim Laden: ' + e.message;
      container.appendChild(errDiv);
    }
    this._loading = false;
  }

  _renderPagination(container) {
    container.querySelector('.pg-footer')?.remove();
    if (this._total <= this.pageSize) return;

    const footer = document.createElement('div');
    footer.className = 'pg-footer';
    footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--b1);margin-top:8px;font-size:12px;color:var(--t2)';
    const currentPage = Math.max(0, this._page - 1);
    footer.innerHTML = `
      <span>${currentPage * this.pageSize + 1}–${Math.min((currentPage + 1) * this.pageSize, this._total)} von ${this._total}</span>
      <div style="display:flex;gap:4px">
        <button class="pg-btn" ${currentPage === 0 ? 'disabled' : ''} onclick="this.closest('[id]').__pg?.goTo(${currentPage - 1})">←</button>
        <span style="padding:3px 8px;background:var(--s2);border-radius:var(--r)">${currentPage + 1} / ${this._pages}</span>
        <button class="pg-btn" ${currentPage >= this._pages - 1 ? 'disabled' : ''} onclick="this.closest('[id]').__pg?.goTo(${currentPage + 1})">→</button>
      </div>`;
    container.appendChild(footer);

    // Referenz für onclick
    const cont = document.getElementById(this.containerId);
    if (cont) cont.__pg = this;
  }

  goTo(page) {
    if (page < 0 || page >= this._pages) return;
    this._page = page;
    this.load(true);
    document.getElementById(this.containerId)?.scrollIntoView({ behavior: 'smooth' });
  }

  _appendLoader(container) {
    if (!container.querySelector('.pg-loader-sentinel')) {
      const loader = document.createElement('div');
      loader.className = 'pg-loader-sentinel pg-loading';
      loader.innerHTML = '<div class="spin"></div>';
      loader.style.cssText = 'display:flex;justify-content:center;padding:12px';
      container.appendChild(loader);
    }
  }

  _attachScrollSentinel(container) {
    this._observer?.disconnect();
    const sentinel = document.createElement('div');
    sentinel.className = 'pg-scroll-sentinel';
    sentinel.style.height = '1px';
    container.appendChild(sentinel);

    this._observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this._loading && this._page < this._pages) {
        this.load(false);
      }
    }, { rootMargin: '200px' });
    this._observer.observe(sentinel);
  }

  destroy() {
    this._observer?.disconnect();
  }
}

// ── Toolbar mit Filter + Sort + Seitenanzeige ────────────────
function createPaginationToolbar(pgCtrl, containerId) {
  const toolbar = document.createElement('div');
  toolbar.className = 'pg-toolbar';
  toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 0;flex-wrap:wrap';
  toolbar.innerHTML = `
    <input type="text" class="pg-search" placeholder="Suchen …"
      style="flex:1;min-width:140px;font-size:12px;padding:5px 9px"
      oninput="clearTimeout(this._t);this._t=setTimeout(()=>window.__pg_${containerId}?.setFilter('q',this.value),300)"/>
    <select class="filter-select pg-filter-pri" style="font-size:12px;padding:5px 8px"
      onchange="window.__pg_${containerId}?.setFilter('priority',this.value)">
      <option value="">Alle Prioritäten</option>
      <option value="high">Hoch</option>
      <option value="medium">Mittel</option>
      <option value="low">Niedrig</option>
    </select>
    <select class="filter-select pg-filter-cat" style="font-size:12px;padding:5px 8px"
      onchange="window.__pg_${containerId}?.setFilter('category',this.value)">
      <option value="">Alle Kategorien</option>
      ${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit']
        .map(c=>`<option value="${c}">${c}</option>`).join('')}
    </select>
    <select class="filter-select pg-sort" style="font-size:12px;padding:5px 8px"
      onchange="const[s,d]=this.value.split(':');window.__pg_${containerId}?.setFilter('sort',s)||window.__pg_${containerId}?.setFilter('dir',d)">
      <option value="created_at:asc">Älteste zuerst</option>
      <option value="created_at:desc">Neueste zuerst</option>
      <option value="updated_at:desc">Zuletzt geändert</option>
      <option value="priority:desc">Priorität ↓</option>
      <option value="quality_score:asc">QS-Score ↑</option>
      <option value="title:asc">Titel A–Z</option>
    </select>
    <span class="pg-count" style="font-size:11px;color:var(--t3);white-space:nowrap"></span>`;
  return toolbar;
}

// CSS
const pgStyle = document.createElement('style');
pgStyle.textContent = `
  .pg-loading{display:flex;align-items:center;gap:8px;padding:12px 0;color:var(--t3);font-size:12px}
  .pg-btn{padding:3px 9px;background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
    color:var(--t1);font-size:12px;cursor:pointer;transition:background .15s}
  .pg-btn:hover:not(:disabled){background:var(--s3)}
  .pg-btn:disabled{opacity:.4;cursor:default}`;
document.head.appendChild(pgStyle);

window.PaginationController  = PaginationController;
window.fetchReqsPage         = fetchReqsPage;
window.createPaginationToolbar = createPaginationToolbar;
window.PAGE_SIZE             = PAGE_SIZE;
