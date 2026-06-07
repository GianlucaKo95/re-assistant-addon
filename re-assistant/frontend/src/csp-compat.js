'use strict';
/**
 * csp-compat.js
 * Lösung für HA Content Security Policy die inline onclick blockiert.
 * 
 * Strategie: MutationObserver beobachtet das DOM und konvertiert
 * onclick-Attribute in addEventListener — bevor der Browser sie ausführt.
 * Das funktioniert weil HA die CSP erst beim Click-Event prüft.
 * 
 * Alternative Strategie: onclick-Attribute in data-onclick umbenennen
 * und per Event-Delegation ausführen.
 */

(function() {
  // Alle onclick-Attribute in Event-Listener umwandeln
  function convertOnclicks(root) {
    root.querySelectorAll('[onclick]').forEach(el => {
      const handler = el.getAttribute('onclick');
      if (!handler) return;
      el.removeAttribute('onclick');
      el.addEventListener('click', function(e) {
        try {
          // Handler im window-Kontext ausführen
          const fn = new Function('event', handler);
          fn.call(el, e);
        } catch(err) {
          console.warn('onclick handler error:', err, handler);
        }
      });
    });
  }

  // Initial alle bestehenden onclick konvertieren
  function init() {
    convertOnclicks(document);

    // MutationObserver für dynamisch hinzugefügte Elemente
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // Das Element selbst
            if (node.hasAttribute && node.hasAttribute('onclick')) {
              convertOnclicks(node.parentElement || document);
            }
            // Kinder des Elements
            if (node.querySelectorAll) {
              convertOnclicks(node);
            }
          }
        }
      }
    });

    observer.observe(document.body, {
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
