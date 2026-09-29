// ══════════════════════════════════════════════════════════════════
// oficios.js — pestaña "Oficios" del sitio público + utilidades
// compartidas con el panel de administrador (administrador.html).
//
// Los datos viven en el repositorio, en data/oficios.json. El panel de
// administrador escribe ese archivo vía la API de GitHub (admin.js) y el
// sitio público solo lo lee. En la página pública aparecen ÚNICAMENTE los
// oficios con estado "publicado" cuya fecha de publicación ya llegó; los
// borradores, archivados y programados a futuro no se muestran.
// ══════════════════════════════════════════════════════════════════

(function () {
  const DATA_PATH = 'data/oficios.json';

  // Paleta de portadas (cuando el oficio no tiene imagen propia).
  const TONOS = {
    t1: 'linear-gradient(135deg,#18181B 55%,#3B0764)',
    t2: 'linear-gradient(135deg,#3730A3,#6D28D9)',
    t3: 'linear-gradient(135deg,#7C2D12,#C45F00)',
    t4: 'linear-gradient(135deg,#1E3A5F,#4C1D95)',
    t5: 'linear-gradient(135deg,#14532D,#3F6212)',
    t6: 'linear-gradient(135deg,#581C87,#9D174D)'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Video: detecta el tipo a partir de la URL o ruta ──
  function parseVideo(v) {
    if (!v) return null;
    const url = String(v.url || v.path || '').trim();
    if (!url) return null;
    let m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/))) {
      return { tipo: 'youtube', id: m[1], embed: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0',
               thumb: 'https://img.youtube.com/vi/' + m[1] + '/hqdefault.jpg' };
    }
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
      return { tipo: 'vimeo', id: m[1], embed: 'https://player.vimeo.com/video/' + m[1] };
    }
    if ((m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/))) {
      return { tipo: 'drive', id: m[1], embed: 'https://drive.google.com/file/d/' + m[1] + '/preview' };
    }
    // Archivo directo (subido al repo o URL a .mp4/.webm/.mov)
    return { tipo: 'archivo', src: url };
  }

  function videoHTML(v) {
    const p = parseVideo(v);
    if (!p) return '<div class="of-video-vacio">Video no disponible</div>';
    if (p.tipo === 'archivo') {
      return '<video controls playsinline preload="metadata" src="' + esc(p.src) + '"></video>';
    }
    return '<iframe src="' + esc(p.embed) + '" title="Video" frameborder="0" ' +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>';
  }

  function portadaURL(o) {
    if (o.portada) return o.portada;
    const p = parseVideo(o.video);
    return p && p.thumb ? p.thumb : '';
  }

  // ── Estado efectivo: publicado / programado / borrador / archivado ──
  function estadoEfectivo(o, ahora) {
    ahora = ahora || new Date();
    if (o.estado === 'publicado') {
      const f = o.fechaPublicacion ? new Date(o.fechaPublicacion) : null;
      if (f && !isNaN(f) && f > ahora) return 'programado';
      return 'publicado';
    }
    return o.estado || 'borrador';
  }

  function esVisible(o, ahora) { return estadoEfectivo(o, ahora) === 'publicado'; }

  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function fechaLarga(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }

  async function cargarDatosPublicos() {
    const r = await fetch(DATA_PATH + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return { items: [] };
    const d = await r.json();
    return d && Array.isArray(d.items) ? d : { items: [] };
  }

  // Exponer utilidades para el panel de administrador
  window.OficiosLib = { DATA_PATH, TONOS, esc, parseVideo, videoHTML, portadaURL, estadoEfectivo, esVisible, fechaLarga };

  // ══════════════════════════════════════════════════════════════
  // Render de la pestaña pública (solo si existe #of-grid en la página)
  // ══════════════════════════════════════════════════════════════
  let publicados = [];
  let filtroActual = 'Todos';
  let cargado = false;

  function renderFiltros() {
    const cont = document.getElementById('of-filtros');
    if (!cont) return;
    const cats = Array.from(new Set(publicados.map(o => o.categoria).filter(Boolean))).sort();
    if (cats.length < 2) { cont.innerHTML = ''; return; }
    cont.innerHTML = ['Todos'].concat(cats).map(c =>
      '<button class="of-filtro' + (c === filtroActual ? ' active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'
    ).join('');
    cont.querySelectorAll('.of-filtro').forEach(b => b.onclick = () => { filtroActual = b.dataset.cat; renderFiltros(); renderGrid(); });
  }

  function tarjetaHTML(o, i) {
    const img = portadaURL(o);
    const tono = TONOS[o.tono] || TONOS.t1;
    const nuevo = (Date.now() - new Date(o.fechaPublicacion || 0)) < 14 * 864e5;
    return '' +
      '<article class="of-card reveal" data-idx="' + i + '" tabindex="0" role="button" aria-label="Ver documental: ' + esc(o.oficio) + '">' +
        '<div class="of-cover" style="background:' + tono + ';">' +
          (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()"/>' : '') +
          '<span class="of-catno">' + esc(o.id) + '</span>' +
          (nuevo ? '<span class="of-nuevo">Nuevo</span>' : '') +
          '<span class="of-play" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="of-body">' +
          '<span class="of-kicker">' + esc(o.categoria || 'Oficio') + '</span>' +
          '<h3 class="of-title">' + esc(o.oficio) + '</h3>' +
          '<span class="of-loc">' + esc(o.ubicacion || '') + '</span>' +
          '<p class="of-desc">' + esc(o.resumen || '') + '</p>' +
          '<div class="of-foot"><span class="of-ver">Ver documental →</span><span class="of-fecha">' + esc(fechaLarga(o.fechaPublicacion)) + '</span></div>' +
        '</div>' +
      '</article>';
  }

  function renderGrid() {
    const grid = document.getElementById('of-grid');
    const vacio = document.getElementById('of-vacio');
    if (!grid) return;
    const lista = publicados.filter(o => filtroActual === 'Todos' || o.categoria === filtroActual);
    if (!publicados.length) {
      grid.innerHTML = '';
      if (vacio) vacio.style.display = '';
      return;
    }
    if (vacio) vacio.style.display = 'none';
    grid.innerHTML = lista.map(o => tarjetaHTML(o, publicados.indexOf(o))).join('');
    grid.querySelectorAll('.of-card').forEach((c, k) => {
      const abrir = () => abrirDetalle(publicados[+c.dataset.idx]);
      c.onclick = abrir;
      c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
      setTimeout(() => c.classList.add('in'), 80 * k);
    });
  }

  function campo(lbl, txt, full) {
    if (!txt) return '';
    return '<div class="of-campo' + (full ? ' full' : '') + '"><span class="of-kicker">' + esc(lbl) + '</span><p>' + esc(txt).replace(/\n/g, '<br>') + '</p></div>';
  }

  function abrirDetalle(o) {
    const m = document.getElementById('ofModal');
    if (!m || !o) return;
    document.getElementById('ofModalBody').innerHTML = '' +
      '<div class="of-det-head">' +
        '<span class="of-kicker">' + esc(o.id) + ' · ' + esc(o.categoria || 'Oficio') + '</span>' +
        '<h2 class="of-det-title">' + esc(o.oficio) + '</h2>' +
        '<span class="of-loc">' + esc([o.persona, o.ubicacion].filter(Boolean).join(' · ')) + '</span>' +
      '</div>' +
      '<div class="of-video">' + videoHTML(o.video) + '</div>' +
      '<div class="of-det-grid">' +
        campo('Historia del oficio', o.historia, true) +
        campo('Técnica', o.tecnica) +
        campo('Materiales', o.materiales) +
        campo('Quién lo ejerce', o.bio, true) +
      '</div>' +
      '<div class="of-det-foot">Publicado el ' + esc(fechaLarga(o.fechaPublicacion)) + (o.duracion ? ' · ' + esc(o.duracion) : '') + '</div>';
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    try { history.replaceState(null, '', '#oficios/' + encodeURIComponent(o.id)); } catch (e) {}
  }

  function cerrarDetalle() {
    const m = document.getElementById('ofModal');
    if (!m || !m.classList.contains('open')) return;
    m.classList.remove('open');
    document.getElementById('ofModalBody').innerHTML = ''; // detiene el video
    document.body.style.overflow = '';
    try { history.replaceState(null, '', '#oficios'); } catch (e) {}
  }

  async function cargarOficios() {
    if (!document.getElementById('of-grid')) return;
    if (cargado) return;
    const loading = document.getElementById('of-loading');
    try {
      const data = await cargarDatosPublicos();
      const ahora = new Date();
      publicados = data.items.filter(o => esVisible(o, ahora))
        .sort((a, b) => String(b.fechaPublicacion || '').localeCompare(String(a.fechaPublicacion || '')));
      cargado = true;
    } catch (e) {
      console.warn('No se pudieron cargar los oficios.', e);
      publicados = [];
    }
    if (loading) loading.style.display = 'none';
    renderFiltros();
    renderGrid();
    const cnt = document.getElementById('of-count');
    if (cnt) cnt.textContent = publicados.length ? publicados.length + (publicados.length === 1 ? ' oficio documentado' : ' oficios documentados') : '';
    // Enlace directo a un oficio: index.html#oficios/OF-03
    const h = decodeURIComponent((location.hash || '').replace('#', ''));
    if (h.indexOf('oficios/') === 0) abrirDetalle(publicados.find(o => o.id === h.split('/')[1]));
  }

  window.cargarOficios = cargarOficios;
  window.cerrarOficio = cerrarDetalle;

  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarDetalle(); });
  document.addEventListener('DOMContentLoaded', () => {
    const m = document.getElementById('ofModal');
    if (m) m.addEventListener('click', e => { if (e.target === m) cerrarDetalle(); });
  });
})();
