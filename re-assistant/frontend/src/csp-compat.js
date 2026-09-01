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

  // Findet den Index eines Top-Level-Operators (z.B. '&&' oder '=') außerhalb
  // von Strings/Klammern, ohne Vergleichsoperatoren (==, !=, <=, >=, =>) zu treffen.
  function findTopLevelOp(str, op) {
    let depth = 0, inStr = false, strChar = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inStr) { if (ch === strChar && str[i-1] !== '\\') inStr = false; continue; }
      if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
      if ('([{'.includes(ch)) { depth++; continue; }
      if (')]}'.includes(ch)) { depth--; continue; }
      if (depth !== 0) continue;
      if (str.startsWith(op, i)) {
        if (op === '=') {
          const prev = str[i-1], next = str[i+1];
          if (prev === '=' || prev === '!' || prev === '<' || prev === '>' || next === '=' || next === '>') continue;
        }
        return i;
      }
    }
    return -1;
  }

  // Löst eine Objekt/Methoden-Kette auf, z.B. "document.getElementById('x').style"
  function resolveChain(expr) {
    const steps = [];
    let depth = 0, cur = '';
    for (const ch of expr) {
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      if (ch === '.' && depth === 0) { steps.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur) steps.push(cur);

    let obj = window;
    for (const step of steps) {
      const m = step.trim().match(/^([\w$]+)(?:\((.*)\))?$/s);
      if (!m) return undefined;
      const [, name, argsStr] = m;
      const val = obj?.[name];
      if (argsStr !== undefined) {
        if (typeof val !== 'function') return undefined;
        obj = val.apply(obj, parseArgs(argsStr));
      } else {
        obj = val;
      }
    }
    return obj;
  }

  function executeSingle(stmt, event) {
    if (stmt === 'event.stopPropagation()') {
      event && event.stopPropagation();
      return;
    }

    // Bedingtes Ausführen: "cond && call(...)"
    const andIdx = findTopLevelOp(stmt, '&&');
    if (andIdx !== -1) {
      const cond = resolveChain(stmt.slice(0, andIdx).trim());
      if (cond) executeSingle(stmt.slice(andIdx + 2).trim(), event);
      return;
    }

    // Zuweisung: "obj.chain.prop = wert" (deckt auch S.xxx = ... ab)
    const eqIdx = findTopLevelOp(stmt, '=');
    if (eqIdx !== -1) {
      const lhs = stmt.slice(0, eqIdx).trim();
      const rhs = stmt.slice(eqIdx + 1).trim();
      const lastDot = lhs.lastIndexOf('.');
      if (lastDot === -1) return; // Top-Level-Variablenzuweisung — nicht unterstützt
      const obj = resolveChain(lhs.slice(0, lastDot));
      if (obj == null) return;
      obj[lhs.slice(lastDot + 1)] = evalArg(rhs);
      return;
    }

    const match = stmt.match(/^([\w.$]+)\s*\((.*)\)$/s);
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
