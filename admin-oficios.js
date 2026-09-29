// ══════════════════════════════════════════════════════════════════
// admin-oficios.js — sección "Oficios" del panel de administrador.
//
// Depende de admin.js (API de GitHub + token) y oficios.js (utilidades).
// Todo se guarda en el repositorio:
//   data/oficios.json        → fichas, estado y fecha de publicación
//   oficios/videos/…         → videos subidos directamente (opcional)
//   oficios/portadas/…       → imágenes de portada (opcional)
// GitHub Pages tarda 1–2 minutos en reflejar cada cambio en el sitio.
// ══════════════════════════════════════════════════════════════════

(function () {
  const L = window.OficiosLib;
  const esc = L.esc;
  const MAX_VIDEO_MB = 25;      // arriba de esto conviene YouTube/Vimeo/Drive
  const MAX_IMG_MB = 5;

  let items = [];
  let editandoId = null;        // null = nuevo
  let filtroEstado = 'todos';
  let busqueda = '';

  // ── Estado de conexión con GitHub ──
  function pintarConexion() {
    const el = document.getElementById('of-gh-estado');
    if (!el) return;
    const ok = isAdmin();
    el.innerHTML = ok
      ? '<span class="badge b-ok">GitHub conectado</span> <span class="of-adm-mini">Puedes crear, editar y publicar oficios desde este navegador.</span> <button class="btn btn-sec" style="padding:.35rem .7rem;font-size:.56rem;" onclick="configurarAdmin()">Desconectar</button>'
      : '<span class="badge b-pend">Sin conexión a GitHub</span> <span class="of-adm-mini">Solo lectura. Conecta tu token para guardar cambios.</span> <button class="btn btn-pri" style="padding:.35rem .7rem;font-size:.56rem;" onclick="configurarAdmin()">Conectar GitHub</button>';
    document.querySelectorAll('.of-req-gh').forEach(b => b.disabled = !ok);
  }
  if (typeof onAdminChange === 'function') onAdminChange(() => { pintarConexion(); cargarOficiosAdmin(); });

  // ── Lectura ──
  async function leerDatos() {
    if (isAdmin()) {
      const f = await ghGetFile(L.DATA_PATH);
      if (!f) return { sha: null, data: { items: [] } };
      const txt = decodeURIComponent(escape(atob(f.content.replace(/\n/g, ''))));
      const data = JSON.parse(txt || '{"items":[]}');
      if (!Array.isArray(data.items)) data.items = [];
      return { sha: f.sha, data };
    }
    const r = await fetch(L.DATA_PATH + '?v=' + Date.now(), { cache: 'no-store' });
    return { sha: null, data: r.ok ? await r.json() : { items: [] } };
  }

  async function cargarOficiosAdmin() {
    pintarConexion();
    const el = document.getElementById('of-lista');
    if (!el) return;
    el.innerHTML = '<p class="of-adm-mini">Cargando oficios…</p>';
    try {
      const { data } = await leerDatos();
      items = data.items || [];
      pintarStats();
      pintarLista();
      llenarCategorias();
    } catch (e) {
      el.innerHTML = '<p style="font-size:.82rem;color:var(--red);">Error al cargar: ' + esc(e.message) + '</p>';
    }
  }

  function pintarStats() {
    const c = { publicado: 0, programado: 0, borrador: 0, archivado: 0 };
    const ahora = new Date();
    items.forEach(o => { c[L.estadoEfectivo(o, ahora)] = (c[L.estadoEfectivo(o, ahora)] || 0) + 1; });
    ['publicado', 'programado', 'borrador', 'archivado'].forEach(k => {
      const n = document.getElementById('of-st-' + k); if (n) n.textContent = c[k] || 0;
    });
  }

  const ETIQ = { publicado: ['Publicado', 'b-ok'], programado: ['Programado', 'b-cat'], borrador: ['Borrador', 'b-pend'], archivado: ['Archivado', 'b-exp'] };

  function fechaCorta(iso) {
    const d = new Date(iso); if (!iso || isNaN(d)) return 'Sin fecha';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  function pintarLista() {
    const el = document.getElementById('of-lista');
    const ahora = new Date();
    const q = busqueda.toLowerCase();
    const lista = items
      .filter(o => filtroEstado === 'todos' || L.estadoEfectivo(o, ahora) === filtroEstado)
      .filter(o => !q || [o.id, o.oficio, o.persona, o.ubicacion, o.categoria].join(' ').toLowerCase().includes(q))
      .sort((a, b) => String(b.fechaPublicacion || b.creado || '').localeCompare(String(a.fechaPublicacion || a.creado || '')));
    document.querySelectorAll('#s-oficios .of-ftab').forEach(t => t.classList.toggle('active', t.dataset.f === filtroEstado));
    if (!items.length) {
      el.innerHTML = '<div class="alert alert-info">Aún no hay oficios. Crea el primero con "+ Nuevo oficio". Mientras no haya ninguno publicado, la pestaña pública muestra un aviso de "Próximamente".</div>';
      return;
    }
    if (!lista.length) { el.innerHTML = '<p class="of-adm-mini">Ningún oficio coincide con el filtro.</p>'; return; }
    el.innerHTML = lista.map(o => {
      const est = L.estadoEfectivo(o, ahora);
      const [lbl, cls] = ETIQ[est] || ETIQ.borrador;
      const img = L.portadaURL(o);
      const tono = L.TONOS[o.tono] || L.TONOS.t1;
      const vid = L.parseVideo(o.video);
      const acciones = [];
      acciones.push('<button class="btn btn-sec of-mini-btn" onclick="ofAdm.editar(\'' + esc(o.id) + '\')">Editar</button>');
      if (est === 'borrador' || est === 'archivado' || est === 'programado')
        acciones.push('<button class="btn btn-green of-mini-btn of-req-gh" onclick="ofAdm.publicarAhora(\'' + esc(o.id) + '\')">Publicar ahora</button>');
      if (est === 'publicado' || est === 'programado')
        acciones.push('<button class="btn btn-sec of-mini-btn of-req-gh" onclick="ofAdm.cambiarEstado(\'' + esc(o.id) + '\',\'borrador\')">Despublicar</button>');
      if (est !== 'archivado')
        acciones.push('<button class="btn btn-sec of-mini-btn of-req-gh" onclick="ofAdm.cambiarEstado(\'' + esc(o.id) + '\',\'archivado\')">Archivar</button>');
      acciones.push('<button class="btn btn-danger of-mini-btn of-req-gh" onclick="ofAdm.eliminar(\'' + esc(o.id) + '\')">Eliminar</button>');
      return '' +
        '<div class="of-adm-item">' +
          '<div class="of-adm-thumb" style="background:' + tono + ';">' + (img ? '<img src="' + esc(img) + '" alt="" onerror="this.remove()">' : '') + '<span>' + esc(o.id) + '</span></div>' +
          '<div class="of-adm-info">' +
            '<strong>' + esc(o.oficio || '(sin título)') + '</strong>' +
            '<span>' + esc([o.persona, o.ubicacion].filter(Boolean).join(' · ')) + '</span>' +
            '<div class="of-adm-meta"><span class="badge ' + cls + '">' + lbl + '</span>' +
              (o.categoria ? '<span class="badge b-cat">' + esc(o.categoria) + '</span>' : '') +
              '<span class="of-adm-fecha">' + (est === 'programado' ? 'Sale el ' : '') + esc(fechaCorta(o.fechaPublicacion)) + '</span>' +
              (vid ? '<span class="of-adm-fecha">▶ ' + esc(vid.tipo === 'archivo' ? 'archivo' : vid.tipo) + '</span>' : '<span class="of-adm-fecha" style="color:var(--red);">Sin video</span>') +
            '</div>' +
          '</div>' +
          '<div class="of-adm-acts">' + acciones.join('') + '</div>' +
        '</div>';
    }).join('');
    pintarConexion();
  }

  function llenarCategorias() {
    const dl = document.getElementById('of-cat-list'); if (!dl) return;
    const base = ['Alimentos', 'Textil', 'Metal', 'Madera', 'Cuero', 'Barro y cerámica', 'Música', 'Servicios'];
    const cats = Array.from(new Set(base.concat(items.map(o => o.categoria).filter(Boolean))));
    dl.innerHTML = cats.map(c => '<option value="' + esc(c) + '">').join('');
  }

  // ── Modal ──
  const CAMPOS = ['oficio', 'categoria', 'persona', 'ubicacion', 'resumen', 'historia', 'tecnica', 'materiales', 'bio', 'duracion'];

  function aLocalInput(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function abrirEditor(o) {
    editandoId = o ? o.id : null;
    document.getElementById('modal-of-title').textContent = o ? 'Editar ' + o.id : 'Nuevo oficio';
    CAMPOS.forEach(k => { document.getElementById('of-' + k).value = (o && o[k]) || ''; });
    const v = (o && o.video) || {};
    const esArchivo = v.path && !/^https?:/i.test(v.path);
    document.querySelector('input[name="of-vsrc"][value="' + (esArchivo ? 'archivo' : 'enlace') + '"]').checked = true;
    document.getElementById('of-video-url').value = esArchivo ? '' : (v.url || '');
    document.getElementById('of-video-actual').textContent = esArchivo ? 'Archivo actual: ' + v.path : '';
    document.getElementById('of-video-file').value = '';
    document.getElementById('of-portada-url').value = (o && o.portada && /^https?:/i.test(o.portada)) ? o.portada : '';
    document.getElementById('of-portada-actual').textContent = (o && o.portada && !/^https?:/i.test(o.portada)) ? 'Portada actual: ' + o.portada : '';
    document.getElementById('of-portada-file').value = '';
    document.getElementById('of-quitar-portada').checked = false;
    setTono((o && o.tono) || 't1');
    document.getElementById('of-estado').value = (o && o.estado) || 'borrador';
    document.getElementById('of-fecha').value = aLocalInput(o && o.fechaPublicacion);
    document.getElementById('of-preview').innerHTML = '';
    document.getElementById('of-log').innerHTML = '';
    document.getElementById('of-log').style.display = 'none';
    cambiarFuenteVideo();
    ayudaFecha();
    contarResumen();
    abrirModal('modal-of');
  }

  function setTono(t) {
    document.querySelectorAll('.of-tono').forEach(b => b.classList.toggle('active', b.dataset.t === t));
    document.getElementById('of-tono').value = t;
  }

  function cambiarFuenteVideo() {
    const src = document.querySelector('input[name="of-vsrc"]:checked').value;
    document.getElementById('of-vsrc-enlace').style.display = src === 'enlace' ? '' : 'none';
    document.getElementById('of-vsrc-archivo').style.display = src === 'archivo' ? '' : 'none';
  }

  function ayudaFecha() {
    const est = document.getElementById('of-estado').value;
    const f = new Date(document.getElementById('of-fecha').value);
    const h = document.getElementById('of-fecha-ayuda');
    if (est === 'borrador') h.textContent = 'No se muestra en el sitio. La fecha solo queda guardada.';
    else if (est === 'archivado') h.textContent = 'Oculto del sitio, conservado en el panel.';
    else if (!isNaN(f) && f > new Date()) h.textContent = 'Programado: aparecerá automáticamente en la pestaña Oficios en esa fecha y hora.';
    else h.textContent = 'Se mostrará en la pestaña Oficios en cuanto GitHub Pages se actualice (1–2 min).';
  }

  function contarResumen() {
    const n = document.getElementById('of-resumen').value.length;
    document.getElementById('of-resumen-n').textContent = n + ' / 180';
  }

  function probarVideo() {
    const src = document.querySelector('input[name="of-vsrc"]:checked').value;
    const box = document.getElementById('of-preview');
    if (src === 'archivo') {
      const f = document.getElementById('of-video-file').files[0];
      if (!f) { box.innerHTML = '<p class="of-adm-mini">Selecciona un archivo primero.</p>'; return; }
      box.innerHTML = '<div class="of-prev-frame"><video controls src="' + URL.createObjectURL(f) + '"></video></div>';
      return;
    }
    const url = document.getElementById('of-video-url').value.trim();
    if (!url) { box.innerHTML = '<p class="of-adm-mini">Pega un enlace primero.</p>'; return; }
    box.innerHTML = '<div class="of-prev-frame">' + L.videoHTML({ url }) + '</div>';
  }

  function log(msg, cls) {
    const el = document.getElementById('of-log');
    el.style.display = 'block';
    el.innerHTML += '<div class="log-line ' + (cls || 'linf') + '">' + esc(msg) + '</div>';
    el.scrollTop = el.scrollHeight;
  }

  function extension(nombre, def) {
    const m = String(nombre).toLowerCase().match(/\.([a-z0-9]{2,5})$/);
    return m ? m[1] : def;
  }

  // Escribe data/oficios.json aplicando "mutar" sobre la versión más reciente.
  async function guardarDatos(mutar, mensaje) {
    for (let intento = 0; intento < 2; intento++) {
      const { sha, data } = await leerDatos();
      mutar(data);
      data.actualizado = new Date().toISOString();
      try {
        await ghPutFile(L.DATA_PATH, textToBase64(JSON.stringify(data, null, 2) + '\n'), mensaje, sha || undefined);
        items = data.items;
        return;
      } catch (e) {
        if (intento === 0 && /sha|conflict|does not match/i.test(e.message)) continue;
        throw e;
      }
    }
  }

  function siguienteId(lista) {
    const max = lista.reduce((m, o) => Math.max(m, parseInt(String(o.id).replace(/\D/g, ''), 10) || 0), 0);
    return 'OF-' + String(max + 1).padStart(2, '0');
  }

  async function guardar() {
    if (!isAdmin()) { toast('Conecta GitHub antes de guardar.'); return; }
    const f = {};
    CAMPOS.forEach(k => { f[k] = document.getElementById('of-' + k).value.trim(); });
    if (!f.oficio) { toast('El nombre del oficio es obligatorio.'); return; }
    const estado = document.getElementById('of-estado').value;
    const fechaVal = document.getElementById('of-fecha').value;
    const fecha = fechaVal ? new Date(fechaVal) : new Date();
    if (isNaN(fecha)) { toast('La fecha de publicación no es válida.'); return; }

    const src = document.querySelector('input[name="of-vsrc"]:checked').value;
    const vFile = document.getElementById('of-video-file').files[0];
    const vUrl = document.getElementById('of-video-url').value.trim();
    const previo = editandoId ? items.find(o => o.id === editandoId) : null;
    let video = previo ? previo.video : null;

    if (src === 'enlace') {
      video = vUrl ? { url: vUrl } : null;
    } else if (vFile) {
      if (vFile.size > MAX_VIDEO_MB * 1048576) {
        toast('El video pesa más de ' + MAX_VIDEO_MB + ' MB. Súbelo a YouTube (no listado), Vimeo o Drive y pega el enlace.');
        return;
      }
    } else if (!video || !video.path) {
      video = null;
    }
    if (estado === 'publicado' && !video && !(src === 'archivo' && vFile)) {
      if (!confirm('Este oficio no tiene video. ¿Publicarlo de todos modos?')) return;
    }

    const pFile = document.getElementById('of-portada-file').files[0];
    if (pFile && pFile.size > MAX_IMG_MB * 1048576) { toast('La portada pesa más de ' + MAX_IMG_MB + ' MB.'); return; }

    const btn = document.getElementById('of-guardar');
    btn.disabled = true;
    document.getElementById('of-log').innerHTML = '';
    try {
      const slug = slugify(f.oficio);
      const stamp = Date.now();
      if (src === 'archivo' && vFile) {
        log('Subiendo video (' + (vFile.size / 1048576).toFixed(1) + ' MB)… puede tardar.');
        const path = 'oficios/videos/' + slug + '-' + stamp + '.' + extension(vFile.name, 'mp4');
        await ghPutFile(path, await fileToBase64(vFile), 'Oficios: video de ' + f.oficio);
        video = { path };
        log('Video subido: ' + path, 'lok');
      }
      let portada = previo ? previo.portada || '' : '';
      const pUrl = document.getElementById('of-portada-url').value.trim();
      if (document.getElementById('of-quitar-portada').checked) portada = '';
      if (pUrl) portada = pUrl;
      if (pFile) {
        log('Subiendo portada…');
        const path = 'oficios/portadas/' + slug + '-' + stamp + '.' + extension(pFile.name, 'jpg');
        await ghPutFile(path, await fileToBase64(pFile), 'Oficios: portada de ' + f.oficio);
        portada = path;
        log('Portada subida: ' + path, 'lok');
      }

      log('Guardando ficha…');
      let idFinal = editandoId;
      await guardarDatos(data => {
        const ahora = new Date().toISOString();
        let o = editandoId ? data.items.find(x => x.id === editandoId) : null;
        if (!o) {
          o = { id: siguienteId(data.items), creado: ahora };
          data.items.push(o);
        }
        idFinal = o.id;
        Object.assign(o, f, {
          video, portada,
          tono: document.getElementById('of-tono').value,
          estado,
          fechaPublicacion: fecha.toISOString(),
          actualizado: ahora
        });
      }, (editandoId ? 'Oficios: edita ' : 'Oficios: nuevo ') + f.oficio);
      log('Listo: ' + idFinal + ' guardado. El sitio se actualiza en 1–2 minutos.', 'lok');
      toast(idFinal + ' guardado.');
      setTimeout(() => cerrarModal('modal-of'), 700);
      pintarStats(); pintarLista(); llenarCategorias();
    } catch (e) {
      log('Error: ' + e.message, 'lerr');
      toast('No se pudo guardar.');
    }
    btn.disabled = false;
  }

  async function cambiarEstado(id, estado, fechaAhora) {
    if (!isAdmin()) { toast('Conecta GitHub primero.'); return; }
    try {
      await guardarDatos(data => {
        const o = data.items.find(x => x.id === id); if (!o) throw new Error('No se encontró ' + id);
        o.estado = estado;
        if (fechaAhora) o.fechaPublicacion = new Date().toISOString();
        o.actualizado = new Date().toISOString();
      }, 'Oficios: ' + id + ' → ' + estado);
      toast(id + (estado === 'publicado' ? ' publicado.' : estado === 'archivado' ? ' archivado.' : ' pasó a borrador.'));
      pintarStats(); pintarLista();
    } catch (e) { toast('Error: ' + e.message); }
  }

  async function eliminar(id) {
    const o = items.find(x => x.id === id);
    if (!o || !isAdmin()) return;
    if (!confirm('¿Eliminar ' + id + ' — ' + o.oficio + '? Esta acción no se puede deshacer.\n\nSi solo quieres ocultarlo, usa "Archivar".')) return;
    const locales = [o.video && o.video.path, o.portada].filter(p => p && /^oficios\//.test(p));
    const borrarArchivos = locales.length && confirm('¿Borrar también del repositorio los archivos subidos?\n\n' + locales.join('\n'));
    try {
      await guardarDatos(data => { data.items = data.items.filter(x => x.id !== id); }, 'Oficios: elimina ' + id);
      if (borrarArchivos) {
        for (const p of locales) {
          const f = await ghGetFile(p);
          if (f) await ghDeleteFile(p, 'Oficios: borra archivo de ' + id, f.sha);
        }
      }
      toast(id + ' eliminado.');
      pintarStats(); pintarLista();
    } catch (e) { toast('Error: ' + e.message); }
  }

  window.cargarOficiosAdmin = cargarOficiosAdmin;
  window.ofAdm = {
    nuevo: () => abrirEditor(null),
    editar: id => abrirEditor(items.find(o => o.id === id)),
    guardar, probarVideo, setTono, cambiarFuenteVideo, ayudaFecha, contarResumen,
    cambiarEstado: (id, e) => cambiarEstado(id, e),
    publicarAhora: id => { if (confirm('¿Publicar ' + id + ' ahora? La fecha de publicación se cambiará a este momento.')) cambiarEstado(id, 'publicado', true); },
    eliminar,
    filtrar: f => { filtroEstado = f; pintarLista(); },
    buscar: q => { busqueda = q; pintarLista(); }
  };
})();
