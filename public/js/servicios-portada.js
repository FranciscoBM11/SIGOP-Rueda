// Portada: tarjetas de servicios que abren un panel con la explicación, la
// preparación (las mismas indicaciones del paso «Servicio» de agendar.html,
// GET /servicios), la duración del turno (GET /turnos) y «Agendar este servicio».
//
// Comportamiento:
// - Mouse: se abre al pasar el cursor y se cierra al salir de la tarjeta y del panel.
// - Táctil: un toque abre y otro cierra; tocar fuera cierra.
// - Teclado: Enter/Espacio abre o cierra (es un <button>); Esc cierra y devuelve el foco.
// Solo lee la API pública existente; no guarda nada.
import { api, hoyManagua, sumarDias } from './api.js';

const ESPERA_ABRIR_MS = 120;
const ESPERA_CERRAR_MS = 220;
const DIAS_PARA_DURACION = 14;

const items = [...document.querySelectorAll('.servicio[data-servicio]')].map((li) => ({
  li,
  nombre: li.dataset.servicio,
  boton: li.querySelector('.servicio-boton'),
  panel: li.querySelector('.servicio-panel'),
  origen: null, // 'cursor' | 'clic'
  temporizador: null,
}));

// ---- Datos (se piden una sola vez, al abrir el primer panel) ----
let datos = null;

function minutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function duracionDelTurno(servicioId) {
  const desde = hoyManagua();
  const params = new URLSearchParams({ servicioId, desde, hasta: sumarDias(desde, DIAS_PARA_DURACION - 1) });
  const turnos = await api(`/turnos?${params}`);
  const t = turnos.find((x) => x.horaInicio && x.horaFin);
  return t ? minutos(t.horaFin) - minutos(t.horaInicio) : null;
}

function cargarDatos() {
  datos ??= (async () => {
    let servicios = [];
    try {
      servicios = await api('/servicios');
    } catch {
      // Sin conexión: el panel muestra el texto alternativo.
    }
    let duracion = null;
    try {
      if (servicios.length > 0) duracion = await duracionDelTurno(servicios[0].id);
    } catch {
      duracion = null;
    }
    for (const it of items) {
      const s = servicios.find((x) => x.nombre === it.nombre);
      it.panel.querySelector('[data-preparacion]').textContent = s
        ? s.indicaciones || 'No requiere preparación especial.'
        : 'Te la indicamos al agendar tu cita.';
      it.panel.querySelector('[data-duracion]').textContent =
        duracion && duracion > 0 ? `${duracion} minutos aproximadamente.` : 'La duración se confirma al agendar.';
      if (s) it.panel.querySelector('[data-agendar]').href = `/agendar.html?servicio=${encodeURIComponent(s.id)}`;
    }
  })();
  return datos;
}

// ---- Abrir y cerrar ----
const estaAbierto = (it) => it.boton.getAttribute('aria-expanded') === 'true';

function abrir(it, origen) {
  clearTimeout(it.temporizador);
  for (const otro of items) if (otro !== it) cerrar(otro);
  it.origen = origen;
  if (estaAbierto(it)) return;
  it.boton.setAttribute('aria-expanded', 'true');
  it.panel.hidden = false;
  cargarDatos();
}

function cerrar(it, { devolverFoco = false } = {}) {
  clearTimeout(it.temporizador);
  if (!estaAbierto(it)) return;
  it.boton.setAttribute('aria-expanded', 'false');
  it.panel.hidden = true;
  it.origen = null;
  if (devolverFoco) it.boton.focus();
}

for (const it of items) {
  // Mouse: abrir al entrar, cerrar al salir (con una pequeña espera para no parpadear).
  it.li.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(it.temporizador);
    if (!estaAbierto(it)) it.temporizador = setTimeout(() => abrir(it, 'cursor'), ESPERA_ABRIR_MS);
  });
  it.li.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(it.temporizador);
    // Si se abrió con clic o teclado y el foco sigue dentro, no se cierra al salir el cursor.
    if (it.origen === 'clic' && it.li.contains(document.activeElement)) return;
    it.temporizador = setTimeout(() => cerrar(it), ESPERA_CERRAR_MS);
  });

  // Toque, clic y teclado (Enter/Espacio disparan «click» en un <button>).
  it.boton.addEventListener('click', () => {
    // Con mouse, si el cursor ya lo abrió, el clic no lo cierra (evita el abre-cierra).
    if (estaAbierto(it) && it.origen === 'cursor') {
      it.origen = 'clic';
      return;
    }
    if (estaAbierto(it)) cerrar(it);
    else abrir(it, 'clic');
  });

  // Si el foco del teclado sale de la tarjeta y del panel, se cierra.
  it.li.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !it.li.contains(e.relatedTarget) && it.origen === 'clic') cerrar(it);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const abierto = items.find(estaAbierto);
  if (abierto) cerrar(abierto, { devolverFoco: abierto.li.contains(document.activeElement) || abierto.origen === 'clic' });
});

// Tocar fuera cierra el panel abierto.
document.addEventListener('pointerdown', (e) => {
  for (const it of items) if (estaAbierto(it) && !it.li.contains(e.target)) cerrar(it);
});
