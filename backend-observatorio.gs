/**
 * OBSERVATORIO DEL TRABAJO — backend ligero (Google Apps Script)
 * ─────────────────────────────────────────────────────────────
 * Qué hace:
 *  1) accion "analizarUrl": recibe un link de noticia que pega un visitante,
 *     lee el contenido de la página, y le pide a Gemini que genere un
 *     resumen factual + una interpretación académica con la voz de David.
 *  2) accion "guardarNota": agrega esa nota (ya analizada) como una fila
 *     nueva en la pestaña "Notas_Comunidad" de este mismo Google Sheet
 *     (la crea automáticamente si no existe).
 *  3) accion "adminLogin": verifica el correo y contraseña de David y, si
 *     son correctos, le devuelve su token de GitHub — así el panel de
 *     administrador funciona con un login normal (correo + contraseña) en
 *     vez de tener que pegar el token a mano cada vez. El token real vive
 *     SOLO aquí, oculto, y solo se entrega tras un login correcto.
 *
 * La clave de Gemini y el token de GitHub NUNCA viajan al navegador de un
 * visitante ni quedan en el código público del sitio: viven únicamente
 * aquí, en las Propiedades del script (PropertiesService), del lado de
 * Google.
 *
 * ═══════════════════════════════════════════════════════════════
 * INSTALACIÓN (una sola vez, ~5 minutos) — hazlo TÚ, David:
 * ═══════════════════════════════════════════════════════════════
 *  1. Abre el Google Sheet del Observatorio (el mismo que ya usas para
 *     "Publicar en la web" como CSV — el que alimenta el historial).
 *  2. Menú Extensiones → Apps Script. Se abre un editor en una pestaña nueva.
 *  3. Borra lo que haya en "Code.gs" y pega TODO el contenido de este
 *     archivo (backend-observatorio.gs) ahí.
 *  4. Arriba, junto al botón ▶ Ejecutar, hay un menú desplegable de
 *     funciones — elige "configurar" y da clic en ▶ Ejecutar.
 *     - La primera vez te pedirá autorizar permisos: acepta (es tu propio
 *       script, actuando sobre tu propio Sheet — es seguro).
 *     - Te va a aparecer un cuadro para pegar tu clave de Gemini (la misma
 *       que ya usas en el sitio — gratis en aistudio.google.com/apikey).
 *       Pégala y da clic en Aceptar.
 *  5. En ese mismo menú desplegable de funciones, ahora elige
 *     "configurarAdminAcceso" y da clic en ▶ Ejecutar. Te va a pedir, en
 *     tres pasos:
 *       - El correo con el que vas a entrar al panel de administrador.
 *       - Una contraseña a tu elección (la que vas a usar de aquí en
 *         adelante para entrar al sitio — no tiene que ser el token, puede
 *         ser algo fácil de recordar).
 *       - Tu Personal Access Token de GitHub ("fine-grained", limitado al
 *         repositorio "dsalgado", permiso "Contents: Read and write" —
 *         se genera en github.com/settings/personal-access-tokens/new).
 *     Puedes volver a ejecutar esta función cuando quieras para cambiar tu
 *     correo, contraseña o token más adelante.
 *  6. Menú Implementar (arriba a la derecha) → Nueva implementación.
 *     - Tipo: selecciona "Aplicación web" (ícono de engrane si no aparece).
 *     - Ejecutar como: "Yo" (tu cuenta).
 *     - Quién tiene acceso: "Cualquier usuario".
 *     - Da clic en Implementar. Autoriza de nuevo si te lo pide.
 *  7. Te va a dar una URL terminada en "/exec" — cópiala completa.
 *  8. Pásame esa URL (o pégala tú mismo): en admin.js busca la línea que
 *     dice:
 *         const APPS_SCRIPT_URL = 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT';
 *     y reemplaza el texto entre comillas por tu URL real. Con eso quedan
 *     conectados, en todo el sitio, tanto "Comparte una noticia" como el
 *     login de administrador (correo + contraseña).
 *
 * Si en el futuro necesitas cambiar el código de este backend, edítalo
 * directo en Apps Script y vuelve a hacer "Implementar → Gestionar
 * implementaciones" → editar (lápiz) → Implementar — así la URL se
 * mantiene igual.
 */

var HOJA_COMUNIDAD = 'Notas_Comunidad';
var MODELO_GEMINI = 'gemini-3.6-flash';

function configurar() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Configurar Observatorio', 'Pega tu clave de Gemini (gratis en aistudio.google.com/apikey):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() == ui.Button.OK) {
    var clave = resp.getResponseText().trim();
    if (clave) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', clave);
      ui.alert('Clave guardada correctamente. Ya puedes implementar el backend como aplicación web (menú Implementar).');
    }
  }
}

// Configura el login del panel de administrador: un correo y una contraseña
// a elección de David, más su token real de GitHub. El token queda guardado
// aquí, oculto, y solo se entrega al navegador cuando el login es correcto
// (ver adminLogin más abajo). Puede volver a ejecutarse cuando quieras para
// cambiar cualquiera de los tres datos.
function configurarAdminAcceso() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var respEmail = ui.prompt('Acceso de administrador (1/3)', 'Correo con el que vas a iniciar sesión en el panel de administrador:', ui.ButtonSet.OK_CANCEL);
  if (respEmail.getSelectedButton() != ui.Button.OK) return;
  var email = respEmail.getResponseText().trim();
  if (!email) { ui.alert('Necesitas escribir un correo.'); return; }

  var respPass = ui.prompt('Acceso de administrador (2/3)', 'Elige una contraseña para entrar al panel (al menos 6 caracteres — puede ser algo fácil de recordar, no tiene que ser el token):', ui.ButtonSet.OK_CANCEL);
  if (respPass.getSelectedButton() != ui.Button.OK) return;
  var pass = respPass.getResponseText();
  if (!pass || pass.length < 6) { ui.alert('Usa una contraseña de al menos 6 caracteres.'); return; }

  var respToken = ui.prompt('Acceso de administrador (3/3)', 'Pega tu Personal Access Token de GitHub ("fine-grained", limitado al repositorio "dsalgado", permiso "Contents: Read and write"):', ui.ButtonSet.OK_CANCEL);
  if (respToken.getSelectedButton() != ui.Button.OK) return;
  var token = respToken.getResponseText().trim();
  if (!token) { ui.alert('Necesitas pegar tu token de GitHub.'); return; }

  props.setProperty('ADMIN_EMAIL', email.toLowerCase());
  props.setProperty('ADMIN_PASSWORD_HASH', sha256Hex_(pass));
  props.setProperty('GITHUB_TOKEN', token);
  props.setProperty('LOGIN_INTENTOS_FALLIDOS', '0');
  props.setProperty('LOGIN_BLOQUEADO_HASTA', '0');

  ui.alert('Listo. Ya puedes iniciar sesión en el sitio con ese correo y esa contraseña. El token de GitHub queda guardado aquí, oculto, y el sitio nunca lo muestra públicamente.');
}

function doPost(e) {
  var salida;
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var accion = body.accion;
    if (accion === 'analizarUrl') {
      salida = analizarUrl(body.url);
    } else if (accion === 'guardarNota') {
      salida = guardarNota(body);
    } else if (accion === 'adminLogin') {
      salida = adminLogin(body);
    } else {
      salida = { ok: false, error: 'Acción desconocida.' };
    }
  } catch (err) {
    salida = { ok: false, error: err.message || 'Error interno.' };
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

// Convierte texto a su hash SHA-256 en hexadecimal (para no guardar la
// contraseña de David en texto plano en las Propiedades del script).
function sha256Hex_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// Verifica correo + contraseña contra lo configurado en configurarAdminAcceso().
// Si son correctos, devuelve el token real de GitHub para que ese navegador
// quede como administrador — igual que si David hubiera pegado el token a
// mano, pero sin tener que manejarlo directamente. Incluye un bloqueo
// temporal tras varios intentos fallidos, para dificultar ataques automatizados.
function adminLogin(body) {
  var props = PropertiesService.getScriptProperties();
  var ahora = Date.now();
  var bloqueadoHasta = Number(props.getProperty('LOGIN_BLOQUEADO_HASTA') || 0);
  if (ahora < bloqueadoHasta) {
    var minutos = Math.ceil((bloqueadoHasta - ahora) / 60000);
    throw new Error('Demasiados intentos fallidos. Intenta de nuevo en ' + minutos + ' minuto(s).');
  }

  var emailGuardado = (props.getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
  var hashGuardado = props.getProperty('ADMIN_PASSWORD_HASH') || '';
  var tokenGuardado = props.getProperty('GITHUB_TOKEN') || '';

  if (!emailGuardado || !hashGuardado || !tokenGuardado) {
    throw new Error('El acceso de administrador todavía no está configurado en el backend. Ejecuta la función "configurarAdminAcceso" desde el editor de Apps Script.');
  }

  var emailRecibido = String(body.email || '').trim().toLowerCase();
  var hashRecibido = sha256Hex_(String(body.password || ''));
  var correcto = (emailRecibido === emailGuardado) && (hashRecibido === hashGuardado);

  if (!correcto) {
    var intentos = Number(props.getProperty('LOGIN_INTENTOS_FALLIDOS') || 0) + 1;
    props.setProperty('LOGIN_INTENTOS_FALLIDOS', String(intentos));
    if (intentos >= 5) {
      props.setProperty('LOGIN_BLOQUEADO_HASTA', String(ahora + 15 * 60000));
      props.setProperty('LOGIN_INTENTOS_FALLIDOS', '0');
    }
    Utilities.sleep(1200); // dificulta intentos automatizados en ráfaga
    throw new Error('Correo o contraseña incorrectos.');
  }

  props.setProperty('LOGIN_INTENTOS_FALLIDOS', '0');
  return { ok: true, token: tokenGuardado };
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, info: 'Backend del Observatorio del Trabajo — usa POST.' })).setMimeType(ContentService.MimeType.JSON);
}

function getGeminiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Falta configurar la clave de Gemini. Ejecuta la función "configurar" desde el editor de Apps Script.');
  return key;
}

function extraerTextoLegible_(html) {
  html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  var titulo = '';
  var og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
  var tt = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  titulo = og ? og[1] : (tt ? tt[1] : '');
  titulo = titulo.replace(/\s+/g, ' ').trim();
  var texto = html.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
  return { titulo: titulo, texto: texto.slice(0, 8000) };
}

function llamarGeminiUnaVez_(prompt) {
  var respuestaIA = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + MODELO_GEMINI + ':generateContent?key=' + encodeURIComponent(getGeminiKey_()),
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          // Se deja un margen amplio: los modelos "flash" recientes razonan
          // internamente antes de responder, y ese razonamiento consume el
          // mismo presupuesto de tokens de salida.
          maxOutputTokens: 4000,
          responseMimeType: 'application/json'
        }
      })
    }
  );
  var data = JSON.parse(respuestaIA.getContentText());
  if (data.error) throw new Error(data.error.message || 'Error de Gemini.');
  return data;
}

function llamarGeminiConReintento_(prompt) {
  try {
    return llamarGeminiUnaVez_(prompt);
  } catch (e) {
    // El modelo a veces está saturado por demanda alta — se reintenta
    // automáticamente una vez, con una breve pausa, antes de rendirse.
    if (/overloaded|high demand|unavailable|503|try again/i.test(e.message || '')) {
      Utilities.sleep(2000);
      try { return llamarGeminiUnaVez_(prompt); }
      catch (e2) { throw new Error('Gemini está saturado por demanda alta en este momento. Intenta de nuevo en unos segundos.'); }
    }
    throw e;
  }
}

function analizarUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Pega un link válido (debe empezar con http:// o https://).');
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() >= 400) throw new Error('No se pudo abrir ese link (código ' + resp.getResponseCode() + ').');
  var extraido = extraerTextoLegible_(resp.getContentText());
  var titulo = extraido.titulo, texto = extraido.texto;
  if (!texto || texto.length < 200) throw new Error('No se pudo leer contenido suficiente en esa página. Prueba con otro link.');

  var dominio = url.replace(/^https?:\/\//i, '').split('/')[0];
  var prompt = 'Eres David Salgado López, investigador de la ENAH, especializado en economía política del trabajo en México y América Latina. ' +
    'Analiza el siguiente artículo (dominio: ' + dominio + ', título aproximado: "' + titulo + '") sobre temas de trabajo, empleo o mercado laboral:\n\n' +
    texto.slice(0, 6000) + '\n\n' +
    'Responde SOLO con un objeto JSON válido, sin markdown, con esta forma exacta:\n' +
    '{"titulo":"título breve y claro de la noticia","pais":"país principal del que habla (o \\"Internacional\\")","fuente":"nombre de la fuente/medio","indicador":"uno de: Empleo formal, Desempleo, Salario mínimo, Informalidad, Trabajo digno, Brecha salarial, Trabajo infantil, Sindicatos, Precarización, Productividad, Automatización, Migración laboral","resumenFactual":"3 a 4 oraciones resumiendo los hallazgos concretos del artículo, en tono neutral","interpretacion":"1 a 2 párrafos con tu voz analítica característica — partes desde los trabajadores nunca desde los mercados, mezclas teoría (Geertz, De la Garza, Sennett, Marx, Arendt) con lenguaje cotidiano, sostienes contradicciones sin resolverlas, cierras abriendo preguntas"}';

  var data = llamarGeminiConReintento_(prompt);
  var candidato = data.candidates && data.candidates[0];
  if (!candidato) throw new Error('Gemini no devolvió resultados.' + (data.promptFeedback ? ' (' + JSON.stringify(data.promptFeedback) + ')' : ''));
  var partes = (candidato.content && candidato.content.parts) || [];
  var textoIA = partes.map(function (p) { return p.text || ''; }).join('\n').trim();
  if (!textoIA) throw new Error('Gemini devolvió una respuesta vacía (motivo: ' + (candidato.finishReason || 'desconocido') + ').');
  var limpio = textoIA.replace(/```json|```/g, '').trim();
  var analisis = null;
  try { analisis = JSON.parse(limpio); }
  catch (e1) {
    var m = limpio.match(/\{[\s\S]*\}/);
    if (m) { try { analisis = JSON.parse(m[0]); } catch (e2) {} }
  }
  if (!analisis) throw new Error('La IA no devolvió un formato válido. Respuesta recibida: ' + limpio.slice(0, 300));

  return {
    ok: true,
    nota: {
      url: url,
      titulo: analisis.titulo || titulo || 'Sin título',
      pais: analisis.pais || 'Internacional',
      fuente: analisis.fuente || dominio,
      indicador: analisis.indicador || 'Trabajo digno',
      resumenFactual: analisis.resumenFactual || '',
      interpretacion: analisis.interpretacion || ''
    }
  };
}

function guardarNota(body) {
  var n = body.nota || {};
  if (!n.url || !n.titulo) throw new Error('Falta información de la nota a guardar.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_COMUNIDAD);
  if (!hoja) {
    hoja = ss.insertSheet(HOJA_COMUNIDAD);
    hoja.appendRow(['Fecha', 'Título', 'URL', 'País', 'Fuente', 'Indicador', 'Resumen', 'Interpretación']);
  }
  // Evita duplicados: si ya se guardó ese mismo link, no lo repite.
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][2] === n.url) return { ok: true, duplicado: true };
  }
  hoja.appendRow([
    new Date(),
    String(n.titulo || '').slice(0, 300),
    n.url,
    n.pais || '',
    n.fuente || '',
    n.indicador || '',
    String(n.resumenFactual || '').slice(0, 3000),
    String(n.interpretacion || '').slice(0, 3000)
  ]);
  return { ok: true };
}
