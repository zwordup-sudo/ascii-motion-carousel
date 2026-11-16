# DEVING OS - Reglas de revision GGA para ASCII Motion Carousel

Estas reglas se versionan en Git para que cualquier colaborador pueda ejecutar GGA sin depender de AGENTS.md o MEMORY.md locales (ambos estan ignorados en este repositorio).

## Evaluar el cambio staged, no solo el archivo aislado

1. Identificar el objetivo y el alcance exacto de los cambios staged. No aprobar modificaciones fuera de alcance ni la inclusion de archivos sensibles o generados.
2. No introducir servicios remotos, telemetria, subidas de imagen, cookies de seguimiento ni dependencias de servidor sin una decision de producto explicita. La app procesa imagenes localmente.
3. Mantener coherentes preview, render, cache, worker y exportacion GIF. No alterar formatos, semantica de densidad, paletas, rampas Braille o decisiones de color sin pruebas acordes.
4. Proteger rutas de error y cancelacion: respuestas invalidas del worker, timeout, AbortError, recursos liberados, archivos corruptos, imagenes grandes y cambios rapidos de ajustes.
5. Evitar duplicar reglas de identidad del render, limites de memoria o redimensionado. Toda modificacion a contratos compartidos debe actualizar consumidores y tests.
6. Verificar tipado estricto y preservacion de accesibilidad: teclado, foco, etiquetas y mensajes de error accionables.
7. Si el cambio altera logica, exigir prueba unitaria relevante; si afecta interfaz, flujo de exportacion o navegadores, exigir prueba E2E relevante. Si no hay evidencia, informar VALIDACION PENDIENTE, no inventar resultados.
8. No reportar como ejecutados npm test, npm run build, npm run test:e2e ni validaciones fisicas si solo se inspecciono codigo.
9. Rechazar cambios que expongan secretos, dependan de recursos externos imprevistos, pierdan datos de usuario o no respeten licencias.
10. Clasificar hallazgos de forma concreta con archivo, evidencia, severidad y propuesta de correccion. Diferenciar fallos confirmados, riesgos e hipotesis.


## Separacion de responsabilidades de revision

- GGA evalua el contenido staged que sus `FILE_PATTERNS` incluyen. No debe afirmar que inspecciono otros archivos, el diff completo, ni los resultados de ejecucion, si no estaban en el material recibido.
- `.gga` y `.deving/evidence/.gitignore` pueden quedar fuera del prompt de GGA por sus nombres. Su existencia y condiciones minimas se verifican deterministamente en CI; su contenido y el alcance exacto de staging se inspeccionan localmente antes del commit.
- La ausencia de logs de ejecucion en el prompt no demuestra un fallo: reportar **PENDIENTE DE PRUEBA** de manera expresa. La revision estatica no reemplaza los Quality Gates de CI.
- Mantener `STATUS: FAILED` para una infraccion demostrada y bloqueante dentro del material recibido. No usar `STATUS: PASSED` para afirmar que el producto esta validado, ni desactivar `STRICT_MODE` para superar una revision.

## Resultado

- **BLOQUEANTE**: seguridad/privacidad, perdida de datos, incompatibilidades demostrables, fallas de contrato o pruebas obligatorias fallidas.
- **PENDIENTE DE PRUEBA**: incertidumbre material que requiere ejecutar un control antes de aprobar.
- **ADVERTENCIA**: deuda de mantenimiento con mitigacion y sin defecto probado.

El veredicto de GGA no sustituye las pruebas automaticas de GitHub Actions ni autoriza despliegues.
