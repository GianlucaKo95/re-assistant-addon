'use strict';
/**
 * features/theme.js
 * Dark/Light-Mode Toggle — gespeichert in localStorage, sofort angewendet.
 */

const THEME_KEY  = 're-theme';
const DARK_MODE  = 'dark';
const LIGHT_MODE = 'light';

// ── Theme initialisieren (vor App-Render aufrufen) ────────────
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || DARK_MODE;
  applyTheme(saved, false);
}

function applyTheme(theme, animate = true) {
  const root = document.documentElement;

  if (animate) {
    // Kurzer Fade-Übergang
    root.style.transition = 'background .25s, color .25s';
    setTimeout(() => root.style.transition = '', 300);
  }

  if (theme === LIGHT_MODE) {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }

  localStorage.setItem(THEME_KEY, theme);
  updateThemeButton(theme);
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || DARK_MODE;
  applyTheme(current === DARK_MODE ? LIGHT_MODE : DARK_MODE);
}

function updateThemeButton(theme) {
  const darkIcon  = $('theme-icon-dark');
  const lightIcon = $('theme-icon-light');
  const btn       = $('btn-theme');
  if (!darkIcon || !lightIcon) return;

  if (theme === LIGHT_MODE) {
    darkIcon.style.display  = 'none';
    lightIcon.style.display = '';
    if (btn) btn.title = 'Dark-Mode aktivieren';
  } else {
    darkIcon.style.display  = '';
    lightIcon.style.display = 'none';
    if (btn) btn.title = 'Light-Mode aktivieren';
  }
}

function getCurrentTheme() {
  return localStorage.getItem(THEME_KEY) || DARK_MODE;
}

// Sofort beim Laden ausführen (vor DOMContentLoaded)
// damit kein "Flash of Dark Content" entsteht
initTheme();

window.initTheme        = initTheme;
window.toggleTheme      = toggleTheme;
window.applyTheme       = applyTheme;
window.getCurrentTheme  = getCurrentTheme;
