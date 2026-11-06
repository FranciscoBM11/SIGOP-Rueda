// Aplica, antes de pintar la página, la preferencia guardada del menú lateral
// (escritorio: desplegado o encogido) para que no «salte» al cargar.
// Es un script clásico y pequeño a propósito (los módulos se ejecutan después).
// Sin localStorage (modo privado, bloqueado) el menú queda desplegado.
try {
  if (window.localStorage.getItem('sigop.menu') === 'encogido') {
    document.documentElement.setAttribute('data-menu', 'encogido');
  }
} catch (e) {
  // Sin almacenamiento: se usa el valor por defecto.
}

// Cascada de entrada del menú (CSS: [data-menu-cascada]) solo en la PRIMERA página de
// la sesión: el menú se ve en cada navegación y repetirla cansaría. Sin almacenamiento,
// no hay cascada (el menú simplemente está).
try {
  if (!window.sessionStorage.getItem('sigop.menu-visto')) {
    window.sessionStorage.setItem('sigop.menu-visto', '1');
    document.documentElement.setAttribute('data-menu-cascada', '');
  }
} catch (e) {
  // Sin almacenamiento de sesión: sin cascada.
}
