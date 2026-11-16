# DEVING OS — Quality Gates v0.3

> Proyecto piloto: ASCII Motion Carousel. Este protocolo **no altera** las decisiones existentes en `AGENTS.md` o `MEMORY.md`. Las instrucciones del usuario y el alcance aprobado prevalecen.

## Principios no negociables

1. No confundir un análisis estático con una prueba ejecutada.
2. No presentar un proyecto como validado si faltan controles obligatorios.
3. No aprobar despliegues, publicación, commits, pushes, migraciones o instalaciones automáticamente.
4. No confiar únicamente en la narración de un agente: consultar el reporte generado por el motor y, cuando haga falta, los logs originales.
5. Preservar cambios existentes, la configuración de agentes, modelos, Gentle AI, Engram y GGA.
6. Los tres E2E omitidos de la captura V0.3 están justificados exclusivamente en los proyectos y perfiles que lo documenten. Si el número supera el máximo autorizado, el control falla.

## Requisitos de entorno para este piloto

- Node.js `>=22.12.0 <23`, según `package.json`/`.nvmrc`.
- npm y dependencias ya instaladas. El motor **no** instala herramientas, paquetes ni navegadores.
- El repositorio debe ser confiable: los scripts npm del propio proyecto son código ejecutable.
- Antes de correr pruebas, el sistema genera una instantánea del estado de Git. Un árbol ya modificado no impide probar, pero los cambios preexistentes no se eliminan ni se atribuyen al motor.

## Controles obligatorios — desarrollo

| ID | Comando | Condición mínima | Duración máxima |
|---|---|---|---|
| `unit` | `npm run test` | Exit 0 | 300 s |
| `build` | `npm run build` | Exit 0 | 300 s |
| `e2e` | `npm run test:e2e` | Exit 0 y no más de 3 skips explícitos | 1200 s |

Los E2E se ejecutan con `CI=1` para evitar reutilizar accidentalmente servidores previos, según la configuración Playwright del proyecto. Cierra servidores locales que ocupen los puertos 5173/4173 antes de ejecutarlos. Se ejecutan **en orden**. Un control obligatorio que no pasa detiene los controles siguientes; no se etiquetan como ejecutados. Si un script no existe, el estado será `VALIDACION_INCOMPLETA` y no se inventará un resultado.

Los skips esperados corresponden a `tests/fidelity-baseline.spec.ts`, que requiere `CAPTURE_V03_BASELINE=1` por proteger una referencia histórica. No activar esa variable durante las ejecuciones rutinarias.

## Control extendido, voluntario

`e2e-production` ejecuta `npm run test:e2e` con `E2E_PREVIEW=1` después de los controles obligatorios. El proyecto debe tener un build que pueda servirse localmente. Si pasa, el estado será `VALIDADO_E2E_PRODUCCION_LOCAL`, **no** `APROBADO_PARA_DESPLIEGUE`.

No se incluyen pruebas Safari/iOS real, diálogos nativos, análisis de seguridad de dependencias ni cobertura cuantitativa. Se deben añadir como nuevos controles antes de exigirlos.

## Estados de entrega

| Veredicto | Significado |
|---|---|
| `BLOQUEADO` | Node incompatible, error de pruebas, sobrepaso de skips, cambio detectado por Git o imposibilidad de comparar Git |
| `VALIDACION_INCOMPLETA` | Faltó ejecutar o verificar algún control requerido |
| `VALIDADO_DESARROLLO` | Node correcto, todos los controles requeridos exitosos y Git sin cambios verificables |
| `VALIDADO_E2E_PRODUCCION_LOCAL` | Lo anterior y E2E sobre preview local del build, con límites de entorno conocidos |

**Ningún estado autoriza automáticamente publicación.** Revisión humana, CI protegido, seguridad y pruebas específicas del producto siguen siendo necesarias.

## Evidencia obligatoria

`.deving/evidence/<ejecucion>/` contiene:

- `manifest.json` — versiones, controles, salida, duración, estados, saltos, hashes, estado de Git y veredicto;
- `REPORT.md` — resumen legible;
- `<control>.log` — stdout/stderr locales, con ocultación *parcial* de patrones habituales de secretos.

La carpeta tiene un `.gitignore` interno para evitar añadir evidencia por accidente. No subir logs a GitHub ni compartirlos sin inspección humana: pueden contener rutas locales, datos sensibles o información que la redacción no detectó.

Para comprobar la correspondencia entre hashes y logs, ejecutar el modo `verify`. Los hashes locales ayudan a detectar alteraciones accidentales; **no son firmas de procedencia** y pueden manipularse junto con el manifiesto.

## Equipo multiagente

- Orchestrator: decide alcance y solicita ejecución/inspección; no puede sustituir un log con su opinión.
- QA: ejecuta el Quality Engine con autorización del usuario, verifica controles y reporta fallos.
- Research: consulta documentación y busca causas si un gate falla.
- Reviewer: revisa manifest, logs y diff sin editar archivos; rechaza evidencia ausente o inconsistente.
- Especialistas: colaboran si el perfil lo pide; no se les conceden permisos adicionales aquí.

La configuración `subagent_depth` y los modelos permanecen intactos. GGA y CI son una **fase posterior**: no están conectados por este paquete.

## Uso básico

Desde PowerShell en el directorio descomprimido del kit:

```powershell
$proj = 'C:\Users\Cervantes\Desktop\ascii-motion-carousel'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\Run-DevingQuality.ps1' -ProjectPath $proj
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\Run-DevingQuality.ps1' -ProjectPath $proj -Run
```

Para E2E de build local: añadir `-Production -Run`. No modificar scripts de terceros solo para que el gate pase.

## Próximos perfiles

- Android/Kotlin: Gradle wrapper, JDK/SDK comprobados, JVM tests, lint, build, instrumentadas en dispositivo real según alcance.
- FastAPI/React: entorno Python, migraciones, backend unit/integration, frontend tests/build/E2E.
- Express/PostgreSQL y proyectos de salud: además de unit/integration, autorización, permisos, privacidad y migraciones reversibles con datos ficticios.

Estos perfiles **no están instalados ni activos en v0.3**. No copiar `config.json` de ASCII a otro proyecto sin adaptar gates.

## Actualización v0.3.1: evidencia reforzada

- `unit` utiliza el reportero JSON oficial de Vitest (`npm run test -- --reporter=json --outputFile=...`) para registrar `numPassedTests` y `numPendingTests` directamente en `unit-results.json`, con SHA256 y comparación contra `manifest.json`. La ausencia del JSON invalida el gate; un `exit 0` por sí solo no alcanza.
- La comparación Git ahora añade hash del contenido de cada archivo **sin seguimiento y no ignorado**, además de `git status` y `git diff HEAD`. Máximo: 500 archivos y 100 MiB de contenido; superar el límite bloquea, no concede aprobación.
- Archivos `.gitignore` excluidos, binarios sin seguimiento que superen el límite y cambios en archivos ignorados siguen fuera de esta comprobación; no declarar integridad absoluta.
- El verificador inspecciona también `unit-results.json` y que los conteos coincidan con el manifiesto. La ejecución histórica de v0.3 sigue siendo válida para su alcance, pero no adquiere conteos que no se registraron.
- Esta actualización no incorpora GGA, CI ni autorización de publicación. No cambia agentes, sus modelos o las políticas de Gentle AI.
