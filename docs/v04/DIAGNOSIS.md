# Diagnóstico previo V0.4

Inspección realizada **antes de cambiar el motor**. Referencia GitAscii fijada a commit `18476f2d794c5ea32276a866115c5a4b783189b8` (consulta de GitHub del 13-11-2026), no una comparación remota de imágenes ni una ejecución de su aplicación.

## Causas locales observadas

1. Se usa luminosidad para elegir la densidad del glifo **y además** ese glifo se pinta con RGB oscuro. La media sobre fondo negro multiplica intensidad de tinta por cobertura: doble atenuación. Un gris medio con glifo medio no reproduce un gris medio.
2. Se encaja la tinta más grande de la paleta con factor 0,76. Incluso `█` deja márgenes; no cubre toda su celda. Su área máxima efectiva se reduce aproximadamente con el cuadrado del factor y luego con el ajuste por hinting.
3. No se mide cobertura de tinta para seleccionar niveles: en Shading se suponen cinco niveles uniformes sin calibrar el raster real. El orden de la paleta es correcto, pero área y color no se compensan.
4. No hay gamma, niveles de histograma, bordes ni dithering convencional. Solo True Braille tiene umbral/difusión.
5. Un lienzo interno 2048 px se presenta en ~380 px CSS: 300 columnas son ~1,27 px/celda. La reducción elimina legibilidad de caracteres aunque el archivo exportado conserve los píxeles. No existe zoom.

## Comparación de comportamiento inspeccionado

| Tema | Carousel V0.3 | GitAscii inspeccionado |
| --- | --- | --- |
| Muestreo/escala | Conserva aspecto completo; fuente temporal≤2048; doble muestreo y media2×2 (Braille2×4) | Recorte cuadrado centrado; reducciones sucesivas a mitad y resize a cuadrícula |
| Filas | Medidas por fuente y aspecto; máximo2048 | Relación supuesta0,5, filas por defecto mitad de columnas, límites8–300 |
| RGB/intensidad | Coeficientes0,2126/0,7152/0,0722 directamente en sRGB codificado | Decodifica sRGB a lineal antes de ponderar; después potencia gamma |
| Gamma | Ausente | Predeterminado1,1 en convertidor; el control inspeccionado no envía gamma |
| Brillo/contraste | Contraste multiplicativo0,5–2 alrededor128, después brillo±80 | Brillo antes de contraste; contraste−80…80 convertido con curva racional, inicial10 |
| Caracteres | Índice lineal por luminosidad; paletas propias | Índice lineal, opción invertir secuencia; algunas paletas diferentes |
| Fuente y cobertura | Monospace/DejaVu; bbox medido pero no área; margen0,76 | SVG con cadena de fuentes encabezada por JetBrains Mono; avance aproximado0,58em, línea1,12em, sin calibración de área |
| Color | RGB después del ajuste por canal | Guarda RGB previo al procesamiento; el color de tinta no sigue brillo/contraste |
| Auto contraste | Ausente | Estiramiento mínimo/máximo de intensidades, activado por defecto |
| Bordes | Ausente | Diferencias centrales horizontal/vertical combinadas; **no es Sobel3×3**; controles lo activan por defecto |
| Dithering | Solo Braille | Floyd–Steinberg sobre intensidades, activado por defecto |
| Preview/export | Canvas raster compartido/GIF local, reducido por CSS | Render ASCII SVG escalado con viewBox; los archivos revisados no demuestran un carrusel GIF equivalente |

Los valores numéricos de controles **no son equivalentes**. No se atribuye la oscuridad únicamente a la fórmula de luminancia: gamma y niveles de la referencia también interactúan; linealizar sRGB por sí solo oscurecería intensidades medias.

Fuentes leídas, enlazadas sin incorporar sus implementaciones:

- [Conversión](https://github.com/Igorcbraz/GitAscii/blob/18476f2d794c5ea32276a866115c5a4b783189b8/src/engine/ascii/converter.ts)
- [Render SVG](https://github.com/Igorcbraz/GitAscii/blob/18476f2d794c5ea32276a866115c5a4b783189b8/src/features/widgets/renderers/AsciiArtRenderer.ts)
- [Controles](https://github.com/Igorcbraz/GitAscii/blob/18476f2d794c5ea32276a866115c5a4b783189b8/src/features/editor/components/Properties/AsciiArtControls.tsx)
- [Licencia declarada](https://github.com/Igorcbraz/GitAscii/blob/18476f2d794c5ea32276a866115c5a4b783189b8/package.json): GPL-3.0-or-later.

## Licencia y decisión

No se copiarán funciones, componentes ni estructuras de implementación de GitAscii. Se implementan algoritmos matemáticos estándar (histograma/percentiles, curva gamma, Sobel y difusión Floyd–Steinberg) y calibración propia. Reutilizar código GPL exigiría evaluar obra derivada, mantener avisos/licencia y proporcionar código fuente correspondiente al distribuir; esta tarea no incorpora ese código ni cambia la licencia del proyecto. No es asesoramiento jurídico.

## Referencia fija y aceptación

La ilustración propia `tests/fixtures/reference-v04.svg` contiene faro/costa reconocibles, contornos finos, gradientes y carta RGB. Se rasteriza localmente a `public/reference-v04.png`. No proviene de GitAscii ni se envía a su servidor. Captura previa: `before-v03.png` y `baseline.json`, a Shading/300/2048, contraste1,15, brillo0, tamaño1.

Se medirán luminancia y errores de color de regiones conocidas, conservación de contornos y diferencias al activar filtros. Se entregarán PNG antes/después y GIF decodificado. No se proclamará superioridad universal ni paridad visual comprobada con la aplicación GitAscii sin un benchmark directo equivalente.

Comprobación adicional al cerrar la validación: la [ruta de exportación inspeccionada](https://github.com/Igorcbraz/GitAscii/blob/18476f2d794c5ea32276a866115c5a4b783189b8/src/app/api/editor/export/route.ts) acepta SVG/JSON y usa render SVG. Esto no demuestra que no existan otros exportadores en el proyecto; no se ha ejecutado un pipeline GIF de referencia equivalente. En Carousel la oscuridad ya se observaba en Canvas, antes del códec. Las pruebas GIF decodificadas comprueban que el exportador local no introduce una segunda transformación de procesamiento.
