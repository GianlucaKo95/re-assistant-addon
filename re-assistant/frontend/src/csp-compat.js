'use strict';
/**
 * csp-compat.js
 * CSP-Kompatibilität für HA Ingress.
 * 
 * HA blockiert sowohl inline onclick als auch new Function()/eval.
 * Lösung: onclick-Attribute parsen und auf window-Funktionen mappen.
 */

(function() {

  // Einfache onclick-Handler parsen: "functionName('arg1','arg2')"
  function parseAndCall(handler, event) {
    handler = handler.trim();

    // Mehrere Statements (durch ; getrennt)
    const statements = handler.split(/;\s*(?=[a-zA-Z_$])/);
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      executeSingle(stmt.trim(), event);
    }
  }

  function executeSingle(stmt, event) {
    // Einfache Zuweisung: S.activeSystemId='...' oder $('...').value='...'
    if (stmt.startsWith("S.") || stmt.startsWith("$('") || stmt.startsWith('$("')) {
      // Direkte Prop-Zuweisung
      if (stmt.includes("S.activeSystemId=")) {
        const m = stmt.match(/S\.activeSystemId='([^']+)'/);
        if (m && window.S) window.S.activeSystemId = m[1];
        return;
      }
      if (stmt.includes(".value=")) {
        const m = stmt.match(/\$\(['"]([^'"]+)['"]\)\.value='([^']*)'/);
        if (m) { const el = document.getElementById(m[1]); if (el) el.value = m[2]; }
        return;
      }
    }

    // event.stopPropagation()
    if (stmt === 'event.stopPropagation()') {
      event && event.stopPropagation();
      return;
    }

    // Funktionsaufruf: fnName(arg1, arg2, ...)
    const match = stmt.match(/^([\w.]+)\s*\((.*)\)$/s);
    if (!match) return;

    const fnPath = match[1];
    const argsStr = match[2].trim();

    // Funktion aus window holen
    const fn = fnPath.split('.').reduce((obj, key) => obj?.[key], window);
    if (typeof fn !== 'function') {
      console.warn('csp-compat: Funktion nicht gefunden:', fnPath);
      return;
    }

    // Argumente parsen
    const args = parseArgs(argsStr);
    fn(...args);
  }

  function parseArgs(argsStr) {
    if (!argsStr) return [];
    const args = [];
    let current = '';
    let depth = 0;
    let inStr = false;
    let strChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if (inStr) {
        current += ch;
        if (ch === strChar && argsStr[i-1] !== '\\') inStr = false;
      } else if (ch === '"' || ch === "'") {
        inStr = true; strChar = ch; current += ch;
      } else if (ch === '(' || ch === '[' || ch === '{') {
        depth++; current += ch;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth--; current += ch;
      } else if (ch === ',' && depth === 0) {
        args.push(evalArg(current.trim()));
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) args.push(evalArg(current.trim()));
    return args;
  }

  function evalArg(arg) {
    if (!arg) return undefined;
    if (arg === 'null') return null;
    if (arg === 'undefined') return undefined;
    if (arg === 'true') return true;
    if (arg === 'false') return false;
    // String
    if ((arg.startsWith("'") && arg.endsWith("'")) ||
        (arg.startsWith('"') && arg.endsWith('"'))) {
      return arg.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    }
    // Zahl
    if (/^-?\d+(\.\d+)?$/.test(arg)) return Number(arg);
    // JSON
    if (arg.startsWith('{') || arg.startsWith('[')) {
      try { return JSON.parse(arg); } catch(e) {}
    }
    // window-Variable
    if (/^[\w.]+$/.test(arg)) {
      const val = arg.split('.').reduce((o, k) => o?.[k], window);
      if (val !== undefined) return val;
    }
    return arg;
  }

  function convertOnclicks(root) {
    const els = root.querySelectorAll ? root.querySelectorAll('[onclick]') : [];
    els.forEach(el => {
      const handler = el.getAttribute('onclick');
      if (!handler) return;
      el.removeAttribute('onclick');
      el.addEventListener('click', function(e) {
        parseAndCall(handler, e);
      });
    });
  }

  function init() {
    convertOnclicks(document);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.hasAttribute?.('onclick')) convertOnclicks(node.parentElement || document);
          if (node.querySelectorAll) convertOnclicks(node);
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
