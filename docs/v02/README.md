# V0.2 — resolución y densidad

## Cambios respecto a V0.1

- Misma estructura React / motor puro / Canvas / worker. Sin rediseñar ni sustituir los controles existentes.
- Densidad 16–300, paso de una, inicial 96, presets 16 / 48 / 96 / 160 / 300.
- Columnas sobre la imagen real, filas según proporción y métricas de la fuente monoespaciada. Se miden avance, línea y tinta de toda la rampa; un segundo ajuste al tamaño final evita desbordamientos por hinting.
- Fuentes originales referenciadas como `File` y miniaturas de 80 px; no se prerreducen a 320. Decodificación temporal hasta 2048 px, muestreo doble y promedio explícito 2×2, ponderado por alpha.
- Exportación 320 / 640 / 1024 o automática hasta 2048. Un tamaño común para todo el lote, teniendo en cuenta el retrato más exigente. Advertencia por debajo de 5 px horizontales por carácter; automático busca 6 px, dentro del límite.
- Preview a resolución interna completa, reducida solo por CSS. Usa exactamente el renderizador de exportación.
- Debounce 160 ms y render cooperativo en bloques de unos 8 ms. Caché LRU con presupuesto 16 MiB. Las fuentes decodificadas y las muestras no se guardan para veinte imágenes a la vez.
- Worker con protocolo secuencial y confirmación por fotograma, progreso, cancelación mediante AbortController/terminate y timeout de inactividad de 120 s.
- `modern-gif` retiene RGBA hasta `flush`. Por eso se codifica una imagen a la vez con esa biblioteca (no se sustituye su cuantizador ni LZW) y se ensambla el contenedor GIF con paletas locales. Sigue siendo GIF89a infinito, sin JavaScript ni servicios externos, y se fusionan duplicados consecutivos exactos.
- Límite de salida comprimida 32 MiB. Puede haber variaciones de color entre fotogramas por las paletas locales.

## Presupuesto de memoria (no confundir con memoria total)

Con salida de 2048 × 2048:

| Recurso explícito | Presupuesto |
| --- | --- |
| RGBA del worker: pendiente + entrante | 32 MiB, en vez de 320 MiB para 20 frames |
| Caché de renders | 16 MiB |
| Canvas visible de preview | 16 MiB de backing store |
| Canvas del render en construcción | Hasta 16 MiB; puede coexistir con el render anterior de la caché |
| Canvas de muestreo 2× | Hasta 9,375 MiB con 300 columnas y el límite de 2048 filas |
| Bitmap de trabajo, lado mayor ≤2048 | Hasta 16 MiB |
| GIF comprimido | Hasta 32 MiB; el ensamblado final puede duplicar temporalmente esos bytes |
| Miniaturas | 20 × 80 × 80, serializadas como PNG local |

Estos límites **no son una garantía de RAM total**: excluyen estructuras internas de cuantización, muestras, fuentes comprimidas, texturas, copias transitorias y memoria del navegador. La decodificación de un original de hasta 16 MP puede necesitar más memoria antes del resize/validación. Canvas/bitmap y worker no aparecen en el heap JS del hilo principal. Un retrato extremo limita filas a 2048 para evitar cuadrículas de millones de celdas; el rectángulo mantiene su proporción, pero puede perder detalle vertical.

## Evidencia reproducible

```sh
npm test
npm run build
npm run test:e2e
npm run demo
```

Los E2E comparan muestras de píxeles del primer frame GIF decodificado con el Canvas interno, permitiendo un error medio por canal inferior a 5/255 por cuantización. También verifican métricas de tinta a tamaño máximo, márgenes, bandas finas, retratos, resoluciones, debounce y recuperación tras cancelar. Los JSON de comparación se adjuntan en `test-results/`.

Para regenerar el informe de estrés en PowerShell, con Node 22 activo:

```powershell
$env:GENERATE_V02_REPORT='1'
npm run test:e2e -- tests/resolution.spec.ts -g '20 imágenes a 300'
Remove-Item Env:GENERATE_V02_REPORT
```

El escenario importa **20 archivos de 1600 × 1200**, con tres patrones sintéticos alternados, y exporta a 300 columnas / 2048 × 2048. `performance.json` incluye tiempo observado, bytes del GIF, pico de buffers RGBA contabilizados por el worker, presupuesto de caché, heap JS principal muestreado por CDP y latido del hilo principal. No representa un benchmark de fotografías arbitrarias ni la memoria total del navegador; los valores dependen del equipo y de la concurrencia de las pruebas.

Última comprobación: Node 22.23.5 y Chromium 158.0.8127.18, Windows, build de producción:

| Comprobación | Resultado observado |
| --- | --- |
| Vitest | 50/50 |
| Build TypeScript + Vite | Correcto |
| E2E desarrollo / producción | 17/17 en cada modalidad |
| Exportación de 20 imágenes, 300 columnas, 2048 px | 14,37 s; 2.837.347 bytes (2,71 MiB); 20 frames |
| RGBA retenido por el worker | Pico contabilizado 32 MiB |
| Heap JS principal, muestreado por CDP | Pico 23,93 MiB; **no RAM total** |
| Latido de interfaz durante exportación | 880 ticks; mayor separación observada 40,7 ms |

El escenario de cancelación espera que se haya enviado al menos un fotograma y comprueba que se puede exportar nuevamente. La regresión de debounce congela el reloj y comprueba que solo termina dibujándose la última densidad. Los errores encontrados durante desarrollo (hinting y sincronización de pruebas con el render ahora asíncrono) se corrigieron antes de estas comprobaciones finales.

Esta sección conserva la comprobación histórica en Chromium. La validación multi-motor posterior está en la [matriz de compatibilidad](../compatibility.md); Safari/iOS y las builds de marca siguen pendientes de validación manual.

## Demostración de alta densidad

- [GIF a 300 columnas / 2048 px](./ascii-300.gif)
- [Canvas interno PNG sin reducción CSS](./preview-300.png)
- [Captura del editor, sin rediseño](./editor.png)

Se generan en la prueba del preset 300, con tres figuras y cinco segundos por imagen. Para regenerarlos, configura `GENERATE_V02_DEMO=1` y ejecuta `npm run test:e2e -- tests/resolution.spec.ts -g '300 columnas: proporciones'`; después elimina esa variable. La preview del editor se ve reducida, pero el GIF y el PNG enlazados conservan los 2048 px.
