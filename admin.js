// ══════════════════════════════════════════════════════════════════
// admin.js — acceso de administrador para dsalgado.
//
// El login es un correo + contraseña normales (configurados por David una
// sola vez en el backend de Apps Script — ver backend-observatorio.gs,
// función "configurarAdminAcceso"). Al iniciar sesión correctamente, el
// backend devuelve el Personal Access Token real de GitHub, que se guarda
// SOLO en localStorage de este navegador — nunca viaja al repositorio ni
// queda escrito en el código público del sitio. Cualquier visitante sin
// sesión iniciada en su propio navegador simplemente no puede usar las
// herramientas de administrador.
//
// Como respaldo (por ejemplo si el backend no está disponible), también se
// puede pegar el token de GitHub directamente — opción "avanzada" dentro
// del mismo cuadro de acceso. Debe ser un token "fine-grained"
// (github.com/settings/personal-access-tokens/new), limitado SOLO al
// repositorio dsalgado, con permiso "Contents: Read and write".
// ══════════════════════════════════════════════════════════════════

const GH_OWNER = 'dsalgadolpz-aus';
const GH_REPO = 'dsalgado';
const GH_BRANCH = 'main';

// URL del backend de Apps Script (ver backend-observatorio.gs) — la misma
// que usa "Comparte una noticia" en el Observatorio y el login de admin.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx8sG2DiEuReO24Gr7rxemi834G6Jy4bNv4C0B3_oP7i3JCof6MeO7wn02gDM64duLh/exec';

function getGhToken() {
  try { return localStorage.getItem('gh_admin_token') || ''; }
  catch (e) { return ''; }
}

function isAdmin() {
  return !!getGhToken();
}

// Llama a esto tras iniciar/cerrar sesión si la página necesita refrescar
// su UI (mostrar/ocultar herramientas de admin).
function _adminChangeListeners() { return (window.__adminChangeListeners = window.__adminChangeListeners || []); }
function onAdminChange(fn) { _adminChangeListeners().push(fn); }
function _notifyAdminChange() { _adminChangeListeners().forEach(fn => { try { fn(isAdmin()); } catch (e) {} }); }

function configurarAdmin() {
  if (isAdmin()) {
    if (confirm('Ya tienes acceso de administrador activo en este navegador.\n\n¿Quieres cerrar la sesión?')) {
      try { localStorage.removeItem('gh_admin_token'); } catch (e) {}
      _notifyAdminChange();
    }
    return;
  }
  _abrirModalLogin();
}

// ── Cuadro de inicio de sesión (correo + contraseña) ──
function _abrirModalLogin() {
  if (document.getElementById('adminLoginOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'adminLoginOverlay';
  overlay.innerHTML = `
    <style>
      #adminLoginOverlay{position:fixed;inset:0;background:rgba(24,24,27,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;animation:adminFadeIn .18s ease both;}
      @keyframes adminFadeIn{from{opacity:0;}to{opacity:1;}}
      @keyframes adminSlideUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
      #adminLoginBox{position:relative;background:#fff;border-radius:8px;max-width:380px;width:100%;padding:1.75rem;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:'Lato',sans-serif;animation:adminSlideUp .22s ease both;}
      #adminLoginBox h3{font-family:'Playfair Display',serif;font-size:1.25rem;font-weight:700;color:var(--ink,#18181B);margin-bottom:.3rem;}
      #adminLoginBox p.sub{font-size:.8rem;color:var(--soft,#52525B);margin-bottom:1.25rem;line-height:1.5;}
      #adminLoginBox label{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:#999;margin-bottom:.3rem;margin-top:.9rem;}
      #adminLoginBox label:first-of-type{margin-top:0;}
      #adminLoginBox input[type=email],#adminLoginBox input[type=password],#adminLoginBox input[type=text]{width:100%;padding:.6rem .75rem;border:1px solid var(--rule,#E4E4E7);border-radius:4px;font-family:'Lato',sans-serif;font-size:.9rem;color:var(--ink,#18181B);}
      #adminLoginBox .row-btns{display:flex;gap:.6rem;align-items:center;margin-top:1.4rem;}
      #adminLoginBox .btn-entrar{height:38px;padding:0 1.2rem;border-radius:4px;border:1px solid var(--p,#6D28D9);background:var(--p,#6D28D9);color:#fff;font-size:.85rem;cursor:pointer;}
      #adminLoginBox .btn-entrar:hover{background:var(--pm,#7C3AED);}
      #adminLoginBox .btn-entrar[disabled]{opacity:.6;cursor:default;}
      #adminLoginBox .btn-cancelar{height:38px;padding:0 1rem;border-radius:4px;border:1px solid var(--rule,#E4E4E7);background:#fff;color:var(--ink,#18181B);font-size:.85rem;cursor:pointer;}
      #adminLoginBox .msg{font-size:.78rem;margin-top:.9rem;min-height:1em;}
      #adminLoginBox .msg.err{color:var(--red,#8B2020);}
      #adminLoginBox .toggle-avanzado{font-size:.72rem;color:var(--p,#6D28D9);cursor:pointer;text-decoration:underline;margin-top:1.1rem;display:inline-block;}
      #adminLoginBox .avanzado-box{margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--rule,#E4E4E7);}
      #adminLoginBox .close-x{position:absolute;top:.9rem;right:1rem;background:none;border:none;font-size:1.1rem;color:#999;cursor:pointer;line-height:1;}
    </style>
    <div id="adminLoginBox">
      <button class="close-x" id="adminLoginClose" aria-label="Cerrar" type="button">✕</button>
      <h3>Acceso administrador</h3>
      <p class="sub">Entra con tu correo y contraseña para editar el sitio desde este navegador.</p>
      <div id="adminLoginNormal">
        <label>Correo</label>
        <input type="email" id="adminLoginEmail" autocomplete="username" placeholder="tucorreo@ejemplo.com">
        <label>Contraseña</label>
        <input type="password" id="adminLoginPass" autocomplete="current-password" placeholder="••••••••">
        <div class="row-btns">
          <button class="btn-entrar" id="adminLoginBtn" type="button">Entrar</button>
          <button class="btn-cancelar" id="adminLoginCancel" type="button">Cancelar</button>
        </div>
        <div class="msg" id="adminLoginMsg"></div>
        <span class="toggle-avanzado" id="adminLoginToggleAvanzado">¿Prefieres usar tu token de GitHub directamente?</span>
      </div>
      <div class="avanzado-box" id="adminLoginAvanzado" hidden>
        <label>Token de GitHub</label>
        <input type="text" id="adminLoginToken" placeholder="github_pat_...">
        <div class="row-btns">
          <button class="btn-entrar" id="adminLoginTokenBtn" type="button">Guardar token</button>
        </div>
        <div class="msg" id="adminLoginTokenMsg"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cerrar = () => overlay.remove();
  document.getElementById('adminLoginClose').onclick = cerrar;
  document.getElementById('adminLoginCancel').onclick = cerrar;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });

  document.getElementById('adminLoginToggleAvanzado').onclick = () => {
    document.getElementById('adminLoginAvanzado').hidden = !document.getElementById('adminLoginAvanzado').hidden;
  };

  document.getElementById('adminLoginTokenBtn').onclick = () => {
    const tok = document.getElementById('adminLoginToken').value.trim();
    const msg = document.getElementById('adminLoginTokenMsg');
    if (!tok) { msg.className = 'msg err'; msg.textContent = 'Pega tu token primero.'; return; }
    try { localStorage.setItem('gh_admin_token', tok); } catch (e) {}
    _notifyAdminChange();
    cerrar();
  };

  const intentar = () => _intentarLoginModal();
  document.getElementById('adminLoginBtn').onclick = intentar;
  document.getElementById('adminLoginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') intentar(); });
  document.getElementById('adminLoginEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('adminLoginPass').focus(); });
  document.getElementById('adminLoginEmail').focus();
}

async function _intentarLoginModal() {
  const email = document.getElementById('adminLoginEmail').value.trim();
  const pass = document.getElementById('adminLoginPass').value;
  const msg = document.getElementById('adminLoginMsg');
  const btn = document.getElementById('adminLoginBtn');
  msg.className = 'msg'; msg.textContent = '';
  if (!email || !pass) { msg.className = 'msg err'; msg.textContent = 'Completa correo y contraseña.'; return; }
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PEGA_AQUI') === 0) {
    msg.className = 'msg err'; msg.textContent = 'El acceso por correo aún no está conectado en este sitio. Usa la opción de token de GitHub, abajo.';
    return;
  }
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    // Sin header Content-Type explícito: así el navegador usa 'text/plain'
    // por defecto y se evita el preflight CORS que Apps Script no responde.
    const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ accion: 'adminLogin', email: email, password: pass }) });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Correo o contraseña incorrectos.');
    try { localStorage.setItem('gh_admin_token', data.token); } catch (e) {}
    _notifyAdminChange();
    const overlay = document.getElementById('adminLoginOverlay');
    if (overlay) overlay.remove();
  } catch (e) {
    msg.className = 'msg err'; msg.textContent = e.message || 'No se pudo iniciar sesión.';
  }
  btn.disabled = false; btn.textContent = 'Entrar';
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
