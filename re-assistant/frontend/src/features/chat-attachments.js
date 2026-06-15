'use strict';
/**
 * chat-attachments.js
 * Datei- und Bild-Anhänge für Business-Chat und PM-Chat.
 * Unterstützt: Bilder (Vision), Text-Dateien, PDFs (als Text), Code-Dateien.
 * Provider-agnostisch: Anthropic (Vision native), Grok/Groq (Text-Extraktion).
 */

// Aktuell ausgewählte Anhänge pro Chat
window._bcAttachments  = []; // { name, type, data, preview, text }
window._pmcAttachments = [];

// ── Initialisierung ────────────────────────────────────────────
function initChatAttachments() {
  // Business Chat
  const bcInput = document.getElementById('bc-file-input');
  if (bcInput) {
    bcInput.addEventListener('change', e => handleFileSelect(e, 'bc'));
  }
  // PM Chat
  const pmcInput = document.getElementById('pmc-file-input');
  if (pmcInput) {
    pmcInput.addEventListener('change', e => handleFileSelect(e, 'pmc'));
  }
}

// ── Dateien verarbeiten ────────────────────────────────────────
async function handleFileSelect(event, chatId) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const attachments = chatId === 'bc' ? window._bcAttachments : window._pmcAttachments;

  for (const file of files) {
    if (attachments.length >= 5) { toast('⚠ Max. 5 Anhänge pro Nachricht'); break; }
    if (file.size > 10 * 1024 * 1024) { toast(`⚠ ${file.name}: max. 10 MB`); continue; }

    try {
      const attachment = await processFile(file);
      attachments.push(attachment);
    } catch(e) {
      toast(`❌ ${file.name}: ${e.message}`);
    }
  }

  renderAttachmentPreviews(chatId);
  event.target.value = ''; // Reset file input
}

async function processFile(file) {
  const isImage = file.type.startsWith('image/');
  const isText  = isTextFile(file.name, file.type);

  if (isImage) {
    // Bild → Base64 für Vision
    const base64 = await fileToBase64(file);
    const preview = URL.createObjectURL(file);
    return {
      name:    file.name,
      type:    'image',
      mime:    file.type,
      data:    base64,
      preview,
      size:    file.size,
    };
  }

  if (isText) {
    // Text-Datei → direkt lesen
    const text = await fileToText(file);
    return {
      name:    file.name,
      type:    'text',
      mime:    file.type || 'text/plain',
      data:    null,
      text:    text.substring(0, 50000), // max 50k Zeichen
      size:    file.size,
      preview: null,
    };
  }

  throw new Error('Dateityp nicht unterstützt');
}

function isTextFile(name, mime) {
  const textExts = ['.txt','.md','.js','.ts','.jsx','.tsx','.py','.java','.cs',
    '.go','.rs','.cpp','.c','.h','.json','.yaml','.yml','.xml','.html','.css',
    '.scss','.sql','.sh','.bash','.env','.gitignore','.dockerfile','.vue',
    '.svelte','.php','.rb','.swift','.kt','.r','.m','.csv'];
  const ext = '.' + name.split('.').pop().toLowerCase();
  return textExts.includes(ext) || (mime && mime.startsWith('text/'));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      // Entferne den "data:image/...;base64," Prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Lesefehler'));
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Lesefehler'));
    reader.readAsText(file, 'UTF-8');
  });
}

// ── Vorschau rendern ───────────────────────────────────────────
function renderAttachmentPreviews(chatId) {
  const attachments = chatId === 'bc' ? window._bcAttachments : window._pmcAttachments;
  const container   = document.getElementById(`${chatId}-attachments`);
  if (!container) return;

  if (!attachments.length) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = attachments.map((a, i) => `
    <div style="position:relative;display:flex;align-items:center;gap:6px;
      background:var(--s2);border:1px solid var(--b1);border-radius:8px;
      padding:5px 8px;font-size:11px;max-width:180px">
      ${a.type === 'image' && a.preview
        ? `<img src="${a.preview}" style="width:28px;height:28px;object-fit:cover;border-radius:4px"/>`
        : `<span style="font-size:16px">${fileIcon(a.name)}</span>`}
      <div style="flex:1;min-width:0;overflow:hidden">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">
          ${esc(a.name)}
        </div>
        <div style="font-size:9px;color:var(--t3)">${formatSize(a.size)}</div>
      </div>
      <button onclick="removeAttachment('${chatId}', ${i})"
        style="background:transparent;border:none;color:var(--t3);cursor:pointer;
          font-size:13px;line-height:1;padding:0 0 0 4px">✕</button>
    </div>`).join('');
}

function removeAttachment(chatId, index) {
  const attachments = chatId === 'bc' ? window._bcAttachments : window._pmcAttachments;
  // Revoke Object URL falls Bild
  if (attachments[index]?.preview) {
    URL.revokeObjectURL(attachments[index].preview);
  }
  attachments.splice(index, 1);
  renderAttachmentPreviews(chatId);
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    js:'📜', ts:'📜', jsx:'⚛️', tsx:'⚛️', py:'🐍', java:'☕',
    json:'📋', yaml:'📋', yml:'📋', xml:'📋', sql:'🗄️',
    md:'📝', txt:'📝', html:'🌐', css:'🎨', pdf:'📄',
  };
  return icons[ext] || '📄';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

// ── Anhänge für API-Call aufbereiten ─────────────────────────
// Gibt den aufbereiteten Content-Block für den /api/ai/chat Endpunkt zurück
function buildAttachmentContent(attachments, userText) {
  if (!attachments.length) return null; // Kein Attachment → normaler Text

  const contentParts = [];

  // Text-Anhänge als Text-Blöcke
  const textAttachments = attachments.filter(a => a.type === 'text');
  if (textAttachments.length) {
    const textBlock = textAttachments.map(a => {
      const lang = getLang(a.name);
      return `## Anhang: ${a.name}\n\`\`\`${lang}\n${a.text}\n\`\`\``;
    }).join('\n\n');
    contentParts.push({ type: 'text', text: textBlock });
  }

  // Bild-Anhänge
  const imageAttachments = attachments.filter(a => a.type === 'image');
  for (const img of imageAttachments) {
    contentParts.push({
      type:   'image',
      mime:   img.mime,
      data:   img.data,
      name:   img.name,
    });
  }

  // User-Text
  if (userText) {
    contentParts.push({ type: 'text', text: userText });
  }

  return contentParts;
}

function getLang(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const langs = {
    js:'javascript', ts:'typescript', jsx:'jsx', tsx:'tsx',
    py:'python', java:'java', cs:'csharp', go:'go', rs:'rust',
    cpp:'cpp', c:'c', h:'c', json:'json', yaml:'yaml', yml:'yaml',
    xml:'xml', html:'html', css:'css', sql:'sql', sh:'bash', md:'markdown',
  };
  return langs[ext] || '';
}

// Anhänge nach dem Senden leeren
function clearAttachments(chatId) {
  const attachments = chatId === 'bc' ? window._bcAttachments : window._pmcAttachments;
  attachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
  attachments.length = 0;
  renderAttachmentPreviews(chatId);
}

window.initChatAttachments   = initChatAttachments;
window.removeAttachment      = removeAttachment;
window.buildAttachmentContent = buildAttachmentContent;
window.clearAttachments      = clearAttachments;
