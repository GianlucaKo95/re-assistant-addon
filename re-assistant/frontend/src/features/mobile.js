'use strict';
/**
 * features/mobile.js
 * Mobile-Hilfsfunktionen — Swipe, Touch-Events, Keyboard-Shortcuts.
 */

function toggleMobileReqPane() {
  const pane = $('bc-req-pane');
  if (!pane) return;
  pane.classList.toggle('mobile-open');
  const btn = $('bc-mobile-req-toggle');
  if (btn) btn.textContent = pane.classList.contains('mobile-open') ? '✕' : '📋';
}

let _touchStartX = 0;
document.addEventListener('touchstart', e => { _touchStartX = e.touches[0].clientX; }, { passive:true });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - _touchStartX;
  if (dx > 80) {
    const pane = $('bc-req-pane');
    if (pane?.classList.contains('mobile-open')) {
      pane.classList.remove('mobile-open');
      const btn = $('bc-mobile-req-toggle');
      if (btn) btn.textContent = '📋';
    }
  }
}, { passive:true });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('modal-overlay')?.style.display !== 'none') { closeModal(); return; }
    const pane = $('bc-req-pane');
    if (pane?.classList.contains('mobile-open')) { toggleMobileReqPane(); return; }
    if ($('notif-panel')?.classList.contains('open')) $('notif-panel').classList.remove('open');
  }
  if ((e.ctrlKey||e.metaKey) && e.key==='k') {
    e.preventDefault();
    const s = document.querySelector('.filter-bar input[type=text]');
    if (s) { s.focus(); s.select(); }
  }
});

window.toggleMobileReqPane = toggleMobileReqPane;
