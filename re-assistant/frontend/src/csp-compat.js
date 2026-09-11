'use strict';
/**
 * csp-compat.js
 * CSP-Kompatibilität für HA Ingress und externe Domains.
 * Konvertiert onclick-Attribute in addEventListener ohne eval/new Function.
 */

(function() {

  // Zerlegt den Handler an Top-Level-Semikola — also nur solchen außerhalb
  // von Strings und Klammern/Brackets. Ein naiver Split auf jedes ';'
  // (frühere Implementierung) zerschnitt eingebettete JSON-Nutzdaten
  // (z.B. Anforderungsbeschreibungen mit "…abgeben; alle…") mitten im
  // Text, wodurch der Aufruf lautlos verworfen wurde — kein Match in
  // executeSingle(), keine Fehlermeldung.
  function splitStatements(handler) {
    const statements = [];
    let depth = 0, inStr = false, strChar = '', start = 0;
    for (let i = 0; i < handler.length; i++) {
      const ch = handler[i];
      if (inStr) { if (ch === strChar && handler[i-1] !== '\\') inStr = false; continue; }
      if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
      if ('([{'.includes(ch)) { depth++; continue; }
      if (')]}'.includes(ch)) { depth--; continue; }
      if (depth === 0 && ch === ';') {
        statements.push(handler.slice(start, i));
        start = i + 1;
      }
    }
    statements.push(handler.slice(start));
    return statements;
  }

  function parseAndCall(handler, event, thisArg) {
    const statements = splitStatements(handler);
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      executeSingle(stmt.trim(), event, thisArg);
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

  // Zerlegt eine Objekt/Methoden-Kette in ihre Punkt-getrennten Schritte,
  // z.B. "document.getElementById('x').style" → ["document","getElementById('x')","style"].
  // Klammern werden tiefen-bewusst übersprungen, damit ein '.' INNERHALB
  // eines Funktionsaufrufs (z.B. in einem String-Argument) keinen neuen
  // Schritt erzeugt.
  function splitChainSteps(expr) {
    const steps = [];
    let depth = 0, cur = '';
    for (const ch of expr) {
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      if (ch === '.' && depth === 0) { steps.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur) steps.push(cur);
    return steps;
  }

  // Läuft eine Schritt-Liste ab und liefert den finalen Wert. Der erste
  // Schritt "this" löst zu thisArg auf (dem Element, auf dem der Klick
  // registriert wurde) — ohne das bricht z.B. "this.nextElementSibling…"
  // stillschweigend ab, weil es sonst als window.this gesucht würde.
  // Ein '?' am Ende eines Schritts (aus optionalem Chaining "a?.b") wird
  // ignoriert; obj?.[name] darunter liefert bei fehlendem Zwischenwert
  // ohnehin schon undefined statt zu werfen.
  function resolveSteps(steps, thisArg) {
    let obj = window;
    let isFirst = true;
    for (const rawStep of steps) {
      const m = rawStep.trim().replace(/\?$/, '').match(/^([\w$]+)(?:\((.*)\))?$/s);
      if (!m) return undefined;
      const [, name, argsStr] = m;
      const val = (isFirst && name === 'this') ? thisArg : obj?.[name];
      isFirst = false;
      if (argsStr !== undefined) {
        if (typeof val !== 'function') return undefined;
        obj = val.apply(obj, parseArgs(argsStr));
      } else {
        obj = val;
      }
    }
    return obj;
  }

  function resolveChain(expr, thisArg) {
    return resolveSteps(splitChainSteps(expr), thisArg);
  }

  function executeSingle(stmt, event, thisArg) {
    if (stmt === 'event.stopPropagation()') {
      event && event.stopPropagation();
      return;
    }

    // Bedingtes Ausführen: "cond && call(...)"
    const andIdx = findTopLevelOp(stmt, '&&');
    if (andIdx !== -1) {
      const cond = resolveChain(stmt.slice(0, andIdx).trim(), thisArg);
      if (cond) executeSingle(stmt.slice(andIdx + 2).trim(), event, thisArg);
      return;
    }

    // Zuweisung: "obj.chain.prop = wert" (deckt auch S.xxx = ... ab)
    const eqIdx = findTopLevelOp(stmt, '=');
    if (eqIdx !== -1) {
      const lhs = stmt.slice(0, eqIdx).trim();
      const rhs = stmt.slice(eqIdx + 1).trim();
      const lastDot = lhs.lastIndexOf('.');
      if (lastDot === -1) return; // Top-Level-Variablenzuweisung — nicht unterstützt
      const obj = resolveChain(lhs.slice(0, lastDot), thisArg);
      if (obj == null) return;
      obj[lhs.slice(lastDot + 1)] = evalArg(rhs);
      return;
    }

    // Funktionsaufruf, ggf. als Kette mit Zwischen-Aufrufen (z.B.
    // "this.closest('[id]').__pg?.goTo(1)" oder
    // "this.nextElementSibling.classList.toggle('open')"). Alles bis zum
    // letzten Schritt über resolveSteps auflösen und die letzte Methode
    // GEBUNDEN an ihr Objekt aufrufen — ein losgelöster Aufruf (wie es die
    // frühere Implementierung tat) wirft bei nativen Methoden wie
    // classList.toggle() eine "Illegal invocation".
    const steps = splitChainSteps(stmt);
    const lastStep = (steps[steps.length - 1] || '').trim().replace(/\?$/, '');
    const callMatch = lastStep.match(/^([\w$]+)\((.*)\)$/s);
    if (!callMatch) { console.warn('csp-compat: Statement nicht erkannt:', stmt); return; }
    const [, methodName, argsStr] = callMatch;
    const obj = steps.length > 1 ? resolveSteps(steps.slice(0, -1), thisArg) : window;
    if (obj == null) return; // optionale Kette (?.) lief ins Leere — kein Fehler
    const fn = obj[methodName];
    if (typeof fn !== 'function') {
      console.warn('csp-compat: nicht gefunden:', stmt);
      return;
    }
    fn.apply(obj, parseArgs(argsStr));
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
        parseAndCall(handler, e, this);
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
