'use strict';
/**
 * csp-compat.js
 * CSP-Kompatibilität für HA Ingress und externe Domains.
 * Konvertiert onclick-Attribute in addEventListener ohne eval/new Function.
 */

(function() {

  function parseAndCall(handler, event) {
    const statements = handler.split(/;\s*(?=[a-zA-Z_$])/);
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      executeSingle(stmt.trim(), event);
    }
  }

  function executeSingle(stmt, event) {
    if (stmt === 'event.stopPropagation()') {
      event && event.stopPropagation();
      return;
    }
    if (stmt.startsWith("S.") && stmt.includes("=")) {
      const m = stmt.match(/S\.(\w+)\s*=\s*['"]?([^'"]+)['"]?/);
      if (m && window.S) window.S[m[1]] = m[2];
      return;
    }
    const match = stmt.match(/^([\w.]+)\s*\((.*)\)$/s);
    if (!match) return;
    const fnPath = match[1];
    const argsStr = match[2].trim();
    const fn = fnPath.split('.').reduce((obj, key) => obj?.[key], window);
    if (typeof fn !== 'function') {
      console.warn('csp-compat: nicht gefunden:', fnPath);
      return;
    }
    fn(...parseArgs(argsStr));
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
      } else if ('([{'.includes(ch)) { depth++; current += ch; }
      else if (')]}'.includes(ch)) { depth--; current += ch; }
      else if (ch === ',' && depth === 0) {
        args.push(evalArg(current.trim())); current = '';
      } else { current += ch; }
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
    if ((arg.startsWith("'") && arg.endsWith("'")) ||
        (arg.startsWith('"') && arg.endsWith('"')))
      return arg.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (/^-?\d+(\.\d+)?$/.test(arg)) return Number(arg);
    if (arg.startsWith('{') || arg.startsWith('[')) {
      try { return JSON.parse(arg); } catch(e) {}
    }
    const val = arg.split('.').reduce((o, k) => o?.[k], window);
    if (val !== undefined) return val;
    return arg;
  }

  function convertOnclicks(root) {
    const els = (root.querySelectorAll ? root.querySelectorAll('[onclick]') : []);
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

    // MutationObserver für dynamisch hinzugefügte Elemente
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

    // Zusätzlicher periodischer Scan als Fallback
    // für Elemente die der MutationObserver verpasst
    setInterval(() => convertOnclicks(document), 500);
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
