'use strict';

// Cabeceras HTTP seguras con Helmet (RNF-04).
// La CSP solo permite recursos propios (sin scripts ni estilos en línea).
// El panel no usa FullCalendar (decisión de la Iteración 3); si algún día se
// agrega desde jsDelivr habrá que sumar https://cdn.jsdelivr.net a script-src y style-src.
const helmet = require('helmet');

function cabecerasSeguras() {
  const esProduccion = process.env.NODE_ENV === 'production';
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        // En http://localhost algunos navegadores (Safari) romperían los estilos.
        'upgrade-insecure-requests': esProduccion ? [] : null,
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
}

module.exports = { cabecerasSeguras };
