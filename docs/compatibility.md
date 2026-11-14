# Compatibilidad de navegadores

Validación automatizada con **Node.js 22.23.5**, **Playwright 1.65.0** y **Windows** el 13 de noviembre de 2026. Los navegadores son los builds de Playwright, no instalaciones de marca: WebKit no equivale a Safari y Firefox automatizado no reproduce todas las condiciones de una instalación de escritorio.

## Matriz

| Motor | Versión probada | Suite dev | Suite producción | Estado |
| --- | --- | --- | --- | --- |
| Chromium | 158.0.8127.18 | 42/42 correctos, 1 omitido | 42/42 correctos, 1 omitido | Validado |
| Firefox | 159.0 | 42/42 correctos, 1 omitido | 42/42 correctos, 1 omitido | Validado con límites de automatización |
| WebKit | 27.2 | 42/42 correctos, 1 omitido | 42/42 correctos, 1 omitido | Validado con límites de automatización |

La suite completa suma **129 pruebas**: 126 correctas y 3 omitidas. La omisión es la captura histórica V0.3, que exige `CAPTURE_V03_BASELINE=1` y no debe ejecutarse en la suite normal. Desarrollo y producción (`E2E_PREVIEW=1`) obtuvieron el mismo resultado. Las pruebas unitarias son independientes del motor: 110/110.

La matriz cubre importación de archivos, carrusel y reproducción, doce estilos, True Braille, referencia fija, filtros reversibles, zoom, resoluciones 16–300 columnas, GIF decodificado, comparación antes/después, importación de carpetas, veinte imágenes a 300 columnas, una imagen de 3000×2000 y cuatro anchos de ventana (1440, 1024, 768 y 390 px), además de liberación de object URLs y terminación del worker.

## Diferencias observadas

| Medida | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| MAE RGB de seis regiones (V0.4) | 3,65 | 7,86 | 5,63 |
| MAE de gradientes (V0.4) | 1,56 | 5,04 | 6,28 |
| Comparación con `before-v03.png` | ≈0 | ≈12,6 | ≈13,0 |
| GIF de 20 imágenes (desarrollo) | 8.618.532 B | 5.387.372 B | 3.191.535 B |

- El antialiasing y la rasterización de glifos cambian entre motores. El color sigue mejorando respecto a V0.3 en los tres, pero los umbrales de fidelidad no son idénticos. En Chromium la comparación histórica exige MAE `< 0,01`; en Firefox/WebKit se acota a `< 20` porque el PNG histórico se generó en Chromium.
- El mismo contenido produce GIF de distinto tamaño por la cuantización y compresión de cada motor. Los fotogramas, dimensiones, retardos y bucle se validan por separado.
- El heap principal solo puede medirse con CDP en Chromium. Firefox y WebKit validan el presupuesto RGBA del worker, el tamaño del GIF, la respuesta del hilo principal y la liberación de recursos, no una cifra de memoria total.
- La presión de memoria y los tiempos varían con la concurrencia y el equipo. No son un benchmark absoluto.

## Límites de la automatización

- **Carpeta:** la aplicación configura `webkitdirectory`. Chromium automatizado expande la carpeta recursiva; los protocolos BiDi de Firefox y DOM de WebKit usados por Playwright no lo hacen. En esos motores la prueba valida el selector múltiple equivalente y deja una anotación `browser-limitation`. El selector real del navegador sí admite carpetas, pero no se verificó con el diálogo nativo.
- **Firefox y `toHaveJSProperty`:** el matcher de Playwright sobre el canvas de comparación provoca un crash de página en Firefox. No ocurre al leer el mismo canvas con `evaluate`; el test usa esa vía. Es un límite del arnés, no un fallo de la aplicación.
- **WebKit:** no es Safari. No se probaron Safari de escritorio, iOS/iPadOS, builds de marca de Firefox, Android ni entornos gestionados con restricciones de Canvas, Web Workers o `createImageBitmap`.
- **Fuentes:** los estilos clásicos dependen de la fuente monospace del sistema y los glifos Custom pueden depender de fuentes de respaldo. La apariencia exacta puede variar fuera de los entornos probados.

## Reproducción

```sh
npm ci
npx playwright install chromium firefox webkit
npm test
npm run build
npm run test:e2e
```

Para ejecutar un solo motor:

```sh
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

Para validar el build de producción en PowerShell:

```powershell
$env:E2E_PREVIEW='1'
npm run test:e2e
Remove-Item Env:E2E_PREVIEW
```

Los resultados detallados se guardan en `test-results/`; las pruebas de fidelidad y estrés adjuntan JSON con versión de navegador, métricas y tamaños observados.
