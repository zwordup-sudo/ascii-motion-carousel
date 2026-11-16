# DEVING OS v0.4 - Integracion GGA y GitHub Actions

## Propiedad de los controles

- **GGA** revisa codigo *staged* antes de hacer commit. Requiere `gga` y `opencode` instalados, proveedor accesible y que las reglas versionadas en `docs/DEVING-GGA-RULES.md` sean validas. La revision con IA es orientativa y puede fallar.
- **CI existente** (`.github/workflows/ci.yml`) ya ejecuta unit, build y E2E sobre pull requests. No se sustituye.
- **DEVING Quality** es un workflow nuevo para pull requests, que ejecuta una prueba autocontenida del motor y luego el motor de v0.3.1 con pruebas de desarrollo y E2E de *preview de produccion local*. Puede aumentar el tiempo y uso de minutos de Actions: algunas pruebas se repiten con el CI existente. **No se suben logs ni evidence/ como artefactos**; solo queda el estado y un resumen breve en la consola de CI.
- Ni GGA, ni el motor, ni el workflow autorizan publicaciones. `pages.yml` sigue siendo independiente; habilita proteccion de `main` si deseas obligar a pasar los tests antes de integrar.

## Limites importantes

1. **Antes de subir la rama**, inspecciona `git diff --cached` y evita subir `.opencode/`, `opencode.json`, logs de `.deving/evidence/` o tokens sin revisar. La carpeta de evidence tiene un `.gitignore` que debe estar versionado; los archivos historicos no deben subirse.
2. GGA envia codigo a un proveedor externo cuando se ejecuta. La configuracion usa `PROVIDER="opencode"`, que emplea la integracion OpenCode disponible; no determina por si sola que modelo usa ni su tratamiento de datos. Verificar privacidad/cuotas antes de revisiones de repositorios privados o de terceros.
3. Los hooks locales pueden saltarse o no estar instalados en otras computadoras. No constituyen una garantia de bloqueo de merges; CI y reglas de ramas son controles independientes.
4. Las pruebas autocontenidas en `tests/deving-quality-smoke.mjs` verifican el motor con un repositorio sintetico; no sustituyen la ejecucion real del workflow ni los tests del producto.
5. `--production` prueba Vite preview **local**, no el despliegue real de Pages ni Safari/iOS fisicos.
6. Una ejecucion en CI se interpreta por su estado en GitHub; no consideres los SHA256 locales una firma criptografica de un tercero.

## Archivos que deben estar versionados para que CI funcione

- `.github/workflows/deving-quality.yml` (nuevo)
- `.gga` y `docs/DEVING-GGA-RULES.md` (reglas de revision, nuevas)
- `.deving/quality/engine.mjs` (motor ya instalado en el proyecto)
- `.deving/quality/config.json` (configuracion ya instalada)
- `.deving/evidence/.gitignore` (permite ignorar logs de evidencia)
- `tests/deving-quality-smoke.mjs` (prueba autocontenida del motor)
- `docs/QUALITY-GATES.md` (politica ya instalada)

Si falta cualquiera de estos **nueve** archivos en el checkout del PR, el paso `Check DEVING contract files and GGA policy` falla. Ese mismo paso verifica `STRICT_MODE="true"`, la ruta del archivo de reglas en `.gga` y las reglas de exclusion de evidence. No subas todo `.deving/` indiscriminadamente.

**Dos verificaciones distintas:** GGA realiza revision estatica solamente de los archivos que pasan sus patrones; por configuracion, `.gga` y `.deving/evidence/.gitignore` no se transmiten en el prompt de GGA. Verifica ambos manualmente en el diff staged antes del commit; el workflow CI comprueba que existan y que sus controles criticos esten activos. **CI no ejecuta el modelo GGA**, ni su check de existencia reemplaza una revision humana del contenido de las reglas.

Un informe GGA de solo lectura no acredita que se hayan ejecutado tests, build o E2E. Esto corresponde al Quality Engine y a las jobs obligatorias de CI. Un `STATUS: PASSED` de GGA solo significa que no se detectaron bloqueos en el material **recibido por ese revisor**; no certifica el PR ni autoriza merge/publicacion.

## GGA local (opt-in)

Desde la raiz del repositorio:

```powershell
gga version
gga config
# Solo tras revisar .gga, AGENTS.md, privacidad y el hook existente:
gga install
# Para evaluar los cambios que ya preparaste para commit:
gga run
```

El instalador de DEVING agrega `.gga`, **pero no ejecuta `gga install`** salvo con `-InstallHook` explicito. Si ya existe un hook o `core.hooksPath` personalizado, revisalo manualmente; el instalador no intenta fusionarlos.

## GitHub: proteccion de main (manual)

En el repositorio GitHub: Settings -> Rules -> Rulesets (o Branch protection) -> New branch ruleset -> rama `main`. Requerir PR y comprobaciones exitosas. Tras existir una primera ejecucion del workflow, selecciona por nombre real en GitHub los jobs de `CI` y `DEVING Quality`. **No se configuran protecciones por el script**, y su disponibilidad depende del plan/permisos.

> No toques `pages.yml` ni fuerces pushes a `main` para probarlo. Haz una rama aislada y un pull request despues de revisar exactamente que archivos estas incluyendo.
