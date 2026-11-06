# Imágenes del portal

| Archivo | Dónde se ve | Estado |
|---|---|---|
| `clinica-portada.jpg` | Hero de la portada (sin recortar) | Portada oficial, 1024 × 1024, 100 KB |
| `logo.png` | Emblema sobre fondos claros: barra móvil, pie, favicon | Oficial, 367 × 512, transparente |
| `logo-claro.png` | Emblema sobre fondos oscuros: menú lateral, hero, panel del personal | Oficial, 367 × 512, transparente |
| `doctora.jpg` | «Sobre la doctora» (recorte 4:5 centrado en la doctora) | Oficial, 1400 × 1045, 62 KB |
| `clinica-recepcion.jpg` | «Sobre la clínica» (carga diferida) | Oficial, 1600 × 1200, 287 KB |

## Imagen del hero
El nombre del archivo está en **un solo lugar**: la variable `--hero-imagen` en
`public/css/tailwind.css`. Hoy es una portada cuadrada con texto propio («Ama tu cuerpo»), así que se
muestra completo (`background-size: contain`), sin recortar ni texto encima.

Para cambiarla por una foto **sin texto** a pantalla completa con degradado oscuro:
1. Copiar la foto (horizontal, ≥ 1920 px de ancho, WebP ≤ 300 KB) a esta carpeta.
2. Cambiar la URL de `--hero-imagen`.
3. Agregar la clase `hero--foto` a la `<section>` del hero en `index.html`.
4. Actualizar el `aria-label` del hero y ejecutar `npm run css`.

## Antes de subir fotos
- WebP (calidad 75–80), máximo 200 KB por foto; el logo, menos de 20 KB.
- Quitar los datos EXIF/GPS. No mostrar rostros de pacientes sin su autorización.
- Herramienta gratuita en el navegador: https://squoosh.app
- Si cambia la proporción, actualizar `width` y `height` del `<img>`.
- Actualizar el texto alternativo y quitar «[POR COMPLETAR]».
