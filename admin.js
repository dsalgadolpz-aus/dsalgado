// ══════════════════════════════════════════════════════════════════
// admin.js — acceso de administrador para dsalgado.
//
// No hay servidor: el "login" es un Personal Access Token de GitHub
// que David pega una sola vez. Se guarda SOLO en localStorage de su
// propio navegador — nunca viaja al repositorio ni al sitio publicado.
// Cualquier visitante sin ese token configurado en su propio navegador
// simplemente no puede usar las herramientas de administrador.
//
// El token debe ser "fine-grained" (github.com/settings/personal-access-tokens/new),
// limitado SOLO al repositorio dsalgado, con permiso "Contents: Read and write".
// ══════════════════════════════════════════════════════════════════

const GH_OWNER = 'dsalgadolpz-aus';
const GH_REPO = 'dsalgado';
const GH_BRANCH = 'main';

function getGhToken() {
  try { return localStorage.getItem('gh_admin_token') || ''; }
  catch (e) { return ''; }
}

function isAdmin() {
  return !!getGhToken();
}

// Llama a esto tras configurar/quitar el token si la página necesita
// refrescar su UI (mostrar/ocultar herramientas de admin).
function _adminChangeListeners() { return (window.__adminChangeListeners = window.__adminChangeListeners || []); }
function onAdminChange(fn) { _adminChangeListeners().push(fn); }
function _notifyAdminChange() { _adminChangeListeners().forEach(fn => { try { fn(isAdmin()); } catch (e) {} }); }

function configurarAdmin() {
  const actual = getGhToken();
  const nuevo = prompt(
    'Pega tu Personal Access Token de GitHub.\n\n' +
    'Debe ser un token "fine-grained" limitado SOLO al repositorio "' + GH_REPO + '", ' +
    'con permiso "Contents: Read and write".\n\n' +
    'Se guarda solo en este navegador, nunca en el sitio publicado. Déjalo en blanco y acepta para quitar el acceso de administrador.',
    actual
  );
  if (nuevo === null) return;
  try {
    if (nuevo.trim()) { localStorage.setItem('gh_admin_token', nuevo.trim()); alert('Token guardado. Ya tienes acceso de administrador en este navegador.'); }
    else { localStorage.removeItem('gh_admin_token'); alert('Token eliminado. Ya no tienes acceso de administrador en este navegador.'); }
  } catch (e) {}
  _notifyAdminChange();
}

// ── Llamadas a la API de GitHub ──
async function ghApi(path, opts) {
  const token = getGhToken();
  if (!token) throw new Error('No has configurado tu token de administrador.');
  opts = opts || {};
  const r = await fetch('https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + path, {
    method: opts.method || 'GET',
    body: opts.body,
    headers: Object.assign({
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }, opts.headers || {})
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((data && data.message) || ('Error de GitHub (' + r.status + ')'));
  return data;
}

// Lee un archivo del repo. Devuelve null si no existe (para saber si es "crear" o "actualizar").
async function ghGetFile(path) {
  try { return await ghApi('/contents/' + path + '?ref=' + GH_BRANCH); }
  catch (e) { if (/not found/i.test(e.message)) return null; throw e; }
}

// Lee y decodifica un archivo de texto del repo (UTF-8). Devuelve '' si no existe.
async function ghGetFileText(path) {
  const f = await ghGetFile(path);
  if (!f) return '';
  return decodeURIComponent(escape(atob(f.content.replace(/\n/g, ''))));
}

// Crea o actualiza un archivo. contentBase64 debe venir ya codificado en base64.
async function ghPutFile(path, contentBase64, message, sha) {
  const body = { message: message, content: contentBase64, branch: GH_BRANCH };
  if (sha) body.sha = sha;
  return ghApi('/contents/' + path, { method: 'PUT', body: JSON.stringify(body) });
}

async function ghDeleteFile(path, message, sha) {
  return ghApi('/contents/' + path, { method: 'DELETE', body: JSON.stringify({ message: message, sha: sha, branch: GH_BRANCH }) });
}

// Lista los archivos de una carpeta del repo (para el listado de minilibros, etc).
async function ghListDir(path) {
  try { const r = await ghApi('/contents/' + path + '?ref=' + GH_BRANCH); return Array.isArray(r) ? r : []; }
  catch (e) { if (/not found/i.test(e.message)) return []; throw e; }
}

// Texto (UTF-8) -> base64, apto para la API de contenidos de GitHub.
function textToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }

// File (de un <input type="file">) -> base64 puro (sin el prefijo data:...).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Convierte un título en un slug apto para nombres de archivo (sin espacios, acentos ni caracteres raros).
function slugify(texto) {
  return String(texto)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sin-titulo';
}
