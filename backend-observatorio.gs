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
 *
 * La clave de Gemini NUNCA viaja al navegador del visitante ni queda en el
 * código público del sitio: vive únicamente aquí, en las Propiedades del
 * script (PropertiesService), del lado de Google.
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
 *  5. Menú Implementar (arriba a la derecha) → Nueva implementación.
 *     - Tipo: selecciona "Aplicación web" (ícono de engrane si no aparece).
 *     - Ejecutar como: "Yo" (tu cuenta).
 *     - Quién tiene acceso: "Cualquier usuario".
 *     - Da clic en Implementar. Autoriza de nuevo si te lo pide.
 *  6. Te va a dar una URL terminada en "/exec" — cópiala completa.
 *  7. Pásame esa URL (o pégala tú mismo): en observatorio.html busca la
 *     línea que dice:
 *         const APPS_SCRIPT_URL = 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT';
 *     y reemplaza el texto entre comillas por tu URL real.
 *
 * Si en el futuro necesitas cambiar el código de este backend, edítalo
 * directo en Apps Script y vuelve a hacer "Implementar → Nueva
 * implementación" (o "Gestionar implementaciones" → editar) — la URL
 * puede mantenerse igual si eliges "editar" en vez de crear una nueva.
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

function doPost(e) {
  var salida;
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var accion = body.accion;
    if (accion === 'analizarUrl') {
      salida = analizarUrl(body.url);
    } else if (accion === 'guardarNota') {
      salida = guardarNota(body);
    } else {
      salida = { ok: false, error: 'Acción desconocida.' };
    }
  } catch (err) {
    salida = { ok: false, error: err.message || 'Error interno.' };
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
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
