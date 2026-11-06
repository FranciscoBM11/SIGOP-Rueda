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
