// Servicio preseleccionado desde la portada: agendar.html?servicio=<id>.
// El valor de la URL no es de confianza: solo se acepta un entero positivo que
// exista en el catálogo recibido de GET /servicios. Cualquier otro valor se ignora
// (la paciente elige el servicio como siempre). No se envía nada a la API.

/**
 * @param {string} busqueda  location.search (p. ej. '?servicio=3')
 * @param {{ id: number }[]} servicios  catálogo de GET /servicios
 * @returns {object|null} el servicio del catálogo, o null si el parámetro no es válido
 */
export function servicioDeLaUrl(busqueda, servicios) {
  let valor;
  try {
    valor = new URLSearchParams(busqueda).get('servicio');
  } catch {
    return null;
  }
  if (typeof valor !== 'string' || !/^[1-9]\d{0,8}$/.test(valor)) return null;
  const id = Number(valor);
  return (Array.isArray(servicios) && servicios.find((s) => s.id === id)) || null;
}
