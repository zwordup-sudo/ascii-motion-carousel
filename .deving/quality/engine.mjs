#!/usr/bin/env node
/**
 * DEVING OS Quality Engine 0.3.0
 * Node.js >=22.12, standard library only. Local evidence; no network or install actions.
 * Run in a trusted repository only: npm scripts are executable project code.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, lstatSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { once } from 'node:events';

const VERSION = '0.3.1';
const MAX_UNTRACKED_FILES = 500;
const MAX_UNTRACKED_BYTES = 100 * 1024 * 1024;
const MAX_TEST_JSON_BYTES = 8 * 1024 * 1024;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const supportedIds = /^[a-z][a-z0-9-]{0,40}$/;
const npmScriptPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/;
const opts = process.argv.slice(2);
const action = opts[0] || 'help';
function option(name) { const i = opts.indexOf(name); return i < 0 ? undefined : opts[i + 1]; }
function bad(message) { throw new Error(message); }
function sha(data) { return createHash('sha256').update(data).digest('hex'); }
function shaFile(path) { return sha(readFileSync(path)); }
function writeJsonAtomic(path, data) {
  const temp = `${path}.tmp-${randomBytes(4).toString('hex')}`;
  writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  renameSync(temp, path);
}
function inside(root, candidate) {
  const diff = relative(root, candidate);
  return diff === '' || (diff !== '..' && !diff.startsWith('..' + sep) && !isAbsolute(diff));
}
function parseSemver(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) bad(`Versión semver inválida: ${s}`);
  return m.slice(1).map(Number);
}
function cmpSemver(a, b) {
  for (let i=0; i<3; i++) { if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; }
  return 0;
}
function loadConfig(root) {
  const file = join(root, '.deving', 'quality', 'config.json');
  if (!existsSync(file)) bad(`No existe ${file}; instala primero v0.3 con el script del kit.`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.schema_version !== 1 || !Array.isArray(data.checks)) bad('Config de Quality Engine no compatible (schema_version=1).');
  if (!data.node || !Number.isInteger(data.node.major) || !data.node.min_version) bad('Falta requisito Node en config.');
  if (!Number.isInteger(data.node.max_major_exclusive) || data.node.max_major_exclusive <= data.node.major || parseSemver(data.node.min_version)[0] !== data.node.major) bad('Requisito Node inválido.');
  if (!data.checks.length) bad('Se requiere al menos un control.');
  const ids = new Set();
  for (const c of data.checks) {
    if (!supportedIds.test(c.id) || ids.has(c.id)) bad(`ID de control inválido o duplicado: ${c.id}`);
    ids.add(c.id);
    if (c.kind !== 'npm-script' || !npmScriptPattern.test(c.script)) bad(`Control no permitido: ${c.id}`);
    if (typeof c.required !== 'boolean' || typeof c.timeout_seconds !== 'number' || c.timeout_seconds < 1 || c.timeout_seconds > 3600) bad(`Config incompleta: ${c.id}`);
    if (c.max_skips !== undefined && (!Number.isInteger(c.max_skips) || c.max_skips < 0)) bad(`max_skips inválido: ${c.id}`);
    if (c.max_skips > 0 && !c.skip_reason) bad(`Falta justificación para omisiones de ${c.id}`);
    if (c.result_format !== undefined && (c.result_format !== 'vitest-json' || c.id !== 'unit' || c.script !== 'test')) bad(`Formato de resultados no permitido para ${c.id}`);
    if (c.env !== undefined) {
      if (!c.env || typeof c.env !== 'object' || Array.isArray(c.env) || Object.keys(c.env).some(k => !['E2E_PREVIEW','CI'].includes(k) || !['0','1'].includes(c.env[k]))) bad(`Variables de entorno no permitidas en ${c.id}`);
    }
  }
  return data;
}
function gitRun(root, args) {
  const r = spawnSync('git', args, { cwd:root, encoding:'utf8', timeout:20_000, windowsHide:true, maxBuffer:5*1024*1024 });
  if (r.error || r.status !== 0) return { ok:false, error: r.error?.message || `git exit ${r.status}` };
  return {ok:true, output:r.stdout};
}
function snapshotUntracked(root) {
  const list = gitRun(root, ['ls-files','--others','--exclude-standard','-z']);
  if (!list.ok) return {ok:false,count:null,digest:null,error:list.error};
  const names = list.output.split('\0').filter(Boolean).sort();
  if (names.length > MAX_UNTRACKED_FILES) return {ok:false,count:names.length,digest:null,error:`Demasiados archivos sin seguimiento (>${MAX_UNTRACKED_FILES}).`};
  const h = createHash('sha256');
  let bytes = 0;
  try {
    for (const name of names) {
      const path = resolve(root, name);
      if (!inside(root,path)) throw new Error('Ruta sin seguimiento fuera del proyecto.');
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Archivo sin seguimiento no regular / symlink.');
      bytes += info.size;
      if (bytes > MAX_UNTRACKED_BYTES) throw new Error(`Archivos sin seguimiento superan ${MAX_UNTRACKED_BYTES} bytes.`);
      h.update(name).update('\0').update(String(info.size)).update('\0').update(shaFile(path)).update('\0');
    }
  } catch (e) { return {ok:false,count:names.length,digest:null,error:e.message}; }
  return {ok:true,count:names.length,digest:h.digest('hex'),error:null};
}
function snapshotGit(root) {
  const status = gitRun(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const diff = gitRun(root, ['diff','--binary','HEAD']);
  const untracked = snapshotUntracked(root);
  const ok = status.ok && diff.ok && untracked.ok;
  return {
    ok,
    status_lines: status.ok ? status.output.trimEnd().split('\n').filter(Boolean).length : null,
    status_sha256: status.ok ? sha(status.output) : null,
    diff_sha256: diff.ok ? sha(diff.output) : null,
    untracked_count:untracked.count,
    untracked_sha256:untracked.digest,
    error: !status.ok ? status.error : !diff.ok ? `No se pudo calcular diff HEAD: ${diff.error}` : untracked.error
  };
}
function sameGit(a,b) {
  return a.ok && b.ok && a.status_sha256 === b.status_sha256 &&
    a.diff_sha256 === b.diff_sha256 && a.untracked_sha256 === b.untracked_sha256 &&
    a.untracked_count === b.untracked_count;
}
function parseVitestJson(path) {
  const bytes = statSync(path).size;
  if (bytes < 2 || bytes > MAX_TEST_JSON_BYTES) bad('JSON de Vitest ausente o demasiado grande.');
  const data = JSON.parse(readFileSync(path,'utf8'));
  const fields=['numTotalTests','numPassedTests','numFailedTests','numPendingTests'];
  if (fields.some(k=> !Number.isInteger(data[k]) || data[k]<0)) bad('JSON Vitest sin conteos verificables.');
  const {numTotalTests:total,numPassedTests:passed,numFailedTests:failed,numPendingTests:pending} = data;
  const todo = Number.isInteger(data.numTodoTests) ? data.numTodoTests : 0;
  if (total < 1 || passed < 1 || passed + failed + pending + todo !== total) bad('Los totales de Vitest no son coherentes o están vacíos.');
  return {passed,failed,skipped:pending+todo,total};
}
function findNpmCli() {
  const p = dirname(process.execPath);
  const candidates = [
    join(p, 'node_modules','npm','bin','npm-cli.js'),
    resolve(p, '..','lib','node_modules','npm','bin','npm-cli.js'),
    resolve(p, '..','node_modules','npm','bin','npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js'
  ];
  return candidates.find(existsSync) || null;
}
function redact(s) {
  return s
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|token|password|secret|authorization|private[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}
function passedCount(s) {
  const matches = [...s.matchAll(/\b(\d+)\s+passed\b/gi)].map(x=>Number(x[1]));
  return matches.length ? matches.at(-1) : null;
}
function npmVersion(cli) {
  if (!cli) return null;
  try { return JSON.parse(readFileSync(resolve(cli,'..','..','package.json'),'utf8')).version || null; } catch { return null; }
}
function skipCount(s) {
  const matches = [...s.matchAll(/\b(\d+)\s+skipped\b/gi)].map(x=>Number(x[1]));
  if (matches.length) return matches.at(-1);
  // Playwright and Vitest both print "passed" and skipped only when applicable.
  if (/\b\d+\s+passed\b/i.test(s)) return 0;
  return null;
}
async function runCheck(root, c, reportDir, scripts, npmCli) {
  const t0 = Date.now();
  const entry = { id:c.id, required:c.required, script:c.script, status:'not_run', exit_code:null, timed_out:false, duration_ms:0, log:`${c.id}.log`, log_sha256:null, result_json:null, result_sha256:null, output_truncated:false, passed_count:null, skips:null, skip_reason:c.skip_reason || null, reason:null };
  const logPath = join(reportDir, entry.log);
  const resultJsonPath = c.result_format === 'vitest-json' ? join(reportDir, `${c.id}-results.json`) : null;
  const sink = createWriteStream(logPath, {flags:'wx',mode:0o600});
  let bytes = 0; let tail = '';
  const record = (piece) => {
    const red = redact(String(piece));
    tail = (tail + red).slice(-8192);
    if (bytes >= MAX_LOG_BYTES) { entry.output_truncated=true; return; }
    const buff = Buffer.from(red);
    const permitted = buff.subarray(0, MAX_LOG_BYTES - bytes);
    sink.write(permitted); bytes += permitted.length;
    if (permitted.length < buff.length) entry.output_truncated=true;
  };
  const finalize = async () => {
    sink.end(); await once(sink, 'finish');
    entry.duration_ms=Date.now()-t0;
    entry.log_sha256=shaFile(logPath);
    entry.skips=skipCount(tail);
    entry.passed_count=passedCount(tail);
  };
  if (!Object.hasOwn(scripts,c.script)) {
    entry.status='not_run'; entry.reason=`Script npm no existe: ${c.script}`;
    record(entry.reason + '\n'); await finalize(); return entry;
  }
  if (!npmCli) {
    entry.status='not_run'; entry.reason='No se encontró npm-cli.js junto al Node activo.';
    record(entry.reason + '\n'); await finalize(); return entry;
  }
  record(`[DEVING] ${new Date().toISOString()} — node ${process.version}; npm run ${c.script}\n`);
  const env = {...process.env, ...(c.env || {})};
  // npm scripts launched from npm-cli inherit the selected Node binary, also on Windows.
  env.PATH = dirname(process.execPath) + sepPath() + (env.PATH || env.Path || '');
  env.Path = env.PATH;
  try {
    const extraArgs = resultJsonPath ? ['--','--reporter=json',`--outputFile=${resultJsonPath}`] : [];
    const child = spawn(process.execPath, [npmCli, 'run', c.script, ...extraArgs], { cwd:root, env, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'] });
    child.stdout.on('data', record); child.stderr.on('data', record);
    const result = await new Promise(resolveResult=>{
      let resolved=false;
      const done=(r)=>{if (!resolved){resolved=true;resolveResult(r);}};
      let timedOut=false;
      const timer=setTimeout(()=>{
        timedOut=true;
        // Kill npm; descendant test servers may still require manual cleanup.
        child.kill();
        // Avoid waiting forever for a child that ignored termination.
        setTimeout(()=>{child.stdout?.removeAllListeners('data');child.stderr?.removeAllListeners('data');done({exit_code:null,timeout:true});},3000).unref();
      }, c.timeout_seconds * 1000);
      child.on('error', e=>{clearTimeout(timer);done({exit_code:null,error:e.message,timeout:timedOut});});
      child.on('close', (code,signal)=>{clearTimeout(timer);done({exit_code:code,signal,timeout:timedOut});});
    });
    entry.exit_code=result.exit_code;
    entry.timed_out=!!result.timeout;
    entry.reason=result.error || (result.timeout?'Tiempo límite agotado; revisar posibles subprocesos.':null);
    entry.status=(result.exit_code===0 && !entry.timed_out && !entry.output_truncated) ? 'pass' : (result.error?'not_run':'fail');
    if (entry.output_truncated) entry.reason='Salida truncada; evidencia incompleta.';
    record(`\n[DEVING] exit=${entry.exit_code}; timeout=${entry.timed_out}\n`);
  } catch (e) {
    entry.status='not_run'; entry.reason=e.message; record(`\nERROR: ${e.message}\n`);
  }
  await finalize();
  if (resultJsonPath) {
    if (existsSync(resultJsonPath)) { entry.result_json = `${c.id}-results.json`; entry.result_sha256 = shaFile(resultJsonPath); }
    if (entry.status === 'pass') {
      try {
        const result = parseVitestJson(resultJsonPath);
        entry.passed_count = result.passed; entry.skips = result.skipped;
        if (result.failed !== 0) { entry.status='fail'; entry.reason=`Vitest reporta ${result.failed} fallos.`; }
      } catch(e) { entry.status='incomplete'; entry.reason=`Resultados de Vitest no verificables: ${e.message}`; }
    }
  }
  if (entry.output_truncated && entry.status==='pass') { entry.status='incomplete'; entry.reason='Log truncado después del resumen de salida.'; }
  if (entry.status==='pass' && c.max_skips !== undefined) {
    if (entry.skips === null) { entry.status='incomplete'; entry.reason='No se pudo verificar cantidad de omisiones.'; }
    else if (entry.skips > c.max_skips) { entry.status='fail'; entry.reason=`${entry.skips} omitidas exceden máximo ${c.max_skips}`; }
  }
  return entry;
}
function sepPath() { return process.platform === 'win32' ? ';' : ':'; }
function verdict(manifest) {
  if (!manifest.preflight.node_ok) return 'BLOQUEADO';
  if (!manifest.git.before.ok || !manifest.git.after.ok || !manifest.git.unchanged) return 'BLOQUEADO';
  if (manifest.checks.some(c=>c.required && c.status==='fail')) return 'BLOQUEADO';
  if (manifest.checks.some(c=>c.required && c.status!=='pass')) return 'VALIDACION_INCOMPLETA';
  if (manifest.mode==='production') {
    if (manifest.checks.find(c=>c.id==='e2e-production')?.status === 'pass') return 'VALIDADO_E2E_PRODUCCION_LOCAL';
    return 'VALIDACION_INCOMPLETA';
  }
  return 'VALIDADO_DESARROLLO';
}
function reportText(m) {
  const lines = [
    '# DEVING OS — Evidence Report', '',
    `- **Veredicto:** ${m.verdict}`,
    `- **Alcance:** ${m.mode==='production'?'build y E2E de producción LOCAL (sin despliegue)':'desarrollo (no autorización de producción)'}`,
    `- **Inicio:** ${m.started_at}`,
    `- **Fin:** ${m.finished_at}`,
    `- **Node:** ${m.runtime.node} — ${m.preflight.node_ok?'compatible':'NO compatible'}`,
    `- **Git sin cambios:** ${m.git.unchanged?'sí':'no o no verificable'}`,
    `- **Archivos sin seguimiento comprobados:** ${m.git.before.untracked_count??'—'}`,
    '', '| Control | Obligatorio | Estado | Exit | Duración | Aprobadas* | Skips* | SHA256 del log |',
    '|---|---|---|---:|---:|---:|---:|---|'
  ];
  for (const c of m.checks) lines.push(`| ${c.id} | ${c.required?'sí':'no'} | ${c.status} | ${c.exit_code??'—'} | ${Math.round(c.duration_ms/1000)}s | ${c.passed_count??'—'} | ${c.skips??'—'} | ${c.log_sha256??'—'} |`);
  lines.push('', '## Alcance y límites','',
    '- Salidas completas (redactadas parcialmente) disponibles **solo en los logs locales**. Revisar antes de compartir; la redacción no garantiza detectar todos los secretos.',
    '- La evidencia de un proceso `npm` no demuestra pruebas manuales, Safari/iOS, publicación ni autenticidad externa.',
    '- Git compara estado/diff y huellas del CONTENIDO de archivos sin seguimiento (hasta 500 archivos / 100 MiB). Los ignorados quedan fuera.',
    '- SHA256 comprueba consistencia de archivos locales, no constituye firma de confianza.',
    '- Conteos unitarios proceden del reporte JSON de Vitest generado en esta ejecución, si está configurado.',
    '- Un control opcional no ejecutado no autoriza publicación. Las pruebas omitidas deben justificarse.',
    '', '## Detalles de controles','');
  for (const c of m.checks) lines.push(`- **${c.id}**: ${c.status}; ${c.reason||'sin observaciones'}${c.result_json ? `; JSON resultados: ${c.result_json} (SHA256: ${c.result_sha256})` : ''}${c.skips ? '; justificación de omisiones: ' + (c.skip_reason||'NO DEFINIDA') : ''}`);
  return lines.join('\n') + '\n';
}
async function main() {
  if (action==='help' || !['plan','run','verify'].includes(action)) {
    console.log('DEVING OS Quality Engine v'+VERSION);
    console.log('node .deving/quality/engine.mjs plan [--project RUTA]');
    console.log('node .deving/quality/engine.mjs run [--project RUTA] [--production]');
    console.log('node .deving/quality/engine.mjs verify [--project RUTA] --report RUTA_REPORTE');
    if (action!=='help') process.exitCode=2;
    return;
  }
  const root=resolve(option('--project') || process.cwd());
  const config=loadConfig(root);
  const min=parseSemver(config.node.min_version), current=parseSemver(process.version);
  const compatible=current[0]===config.node.major && cmpSemver(current,min)>=0 && current[0]<config.node.max_major_exclusive;
  const selected=config.checks.filter(c=>c.required || (!!opts.includes('--production') && c.id==='e2e-production'));
  if (action==='plan') {
    console.log(`DEVING OS ${VERSION} — PREVIEW / solo lectura`);
    console.log(`Proyecto: ${root}`);
    console.log(`Node ${process.version}: ${compatible?'COMPATIBLE':'BLOQUEADO'} (requiere ${config.node.min_version} y major ${config.node.major})`);
    for (const c of selected) console.log(`- ${c.id}: npm run ${c.script}${c.env?.E2E_PREVIEW?' (E2E_PREVIEW=1)':''}${c.env?.CI?' (CI=1)':''} [${c.required?'requerido':'opcional seleccionado'}]`);
    console.log('run guarda evidencia local en .deving/evidence/; no instala dependencias.');
    return;
  }
  if (action==='verify') {
    const report=option('--report');
    if (!report) bad('verify requiere --report <directorio-del-reporte>.');
    const reportsRoot=join(root,'.deving','evidence');
    const directory=resolve(report);
    if (!inside(reportsRoot,directory)) bad('El reporte debe estar dentro de .deving/evidence/.');
    const m=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
    const failures=[];
    for (const c of m.checks) {
      if (!c.log) continue;
      const p=resolve(directory,c.log);
      if (!inside(directory,p) || !existsSync(p) || lstatSync(p).isSymbolicLink() || shaFile(p)!==c.log_sha256) failures.push(c.id + ':log');
      if (c.result_json) {
        const r=resolve(directory,c.result_json);
        if (!inside(directory,r) || !existsSync(r) || lstatSync(r).isSymbolicLink() || shaFile(r)!==c.result_sha256) failures.push(c.id + ':json-hash');
        else {
          try {
            const counts = parseVitestJson(r);
            if (counts.passed!==c.passed_count || counts.skipped!==c.skips || counts.failed!==0) failures.push(c.id + ':json-count');
          } catch(e) { failures.push(c.id + ':json-invalid'); }
        }
      } else if (c.id==='unit' && m.version==='0.3.1' && c.status==='pass') failures.push(c.id + ':json-missing');
    }
    console.log(`Reporte: ${directory}`);
    console.log(`Veredicto registrado: ${m.verdict}`);
    console.log(`SHA256 logs/JSON: ${failures.length?'FALLO '+failures.join(', '):'CONCUERDAN'}`);
    console.log('Nota: integridad relativa al manifest local, NO es firma criptográfica de un tercero.');
    process.exitCode=failures.length?2:0;
    return;
  }
  const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
  const reportDir=join(root,'.deving','evidence',timestamp+'-'+randomBytes(3).toString('hex'));
  mkdirSync(reportDir,{recursive:true});
  const started_at=new Date().toISOString();
  const manifest={ version:VERSION, started_at, finished_at:null, mode:opts.includes('--production')?'production':'development', runtime:{node:process.version, platform:process.platform, arch:process.arch}, preflight:{node_ok:compatible, required:config.node}, git:{before:snapshotGit(root),after:null,unchanged:false}, checks:[], verdict:'VALIDACION_INCOMPLETA' };
  writeJsonAtomic(join(reportDir,'manifest.json'),manifest);
  try {
    let scripts={};
    const npmCli=findNpmCli();
    manifest.runtime.npm=npmVersion(npmCli);
    try { scripts=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).scripts || {}; } catch { /* recorded by not_run */ }
    if (!compatible) {
      console.error(`[BLOQUEADO] Node ${process.version} no cumple >=${config.node.min_version} <${config.node.max_major_exclusive}.0.0`);
    } else {
      for (const c of selected) {
        const result=await runCheck(root,c,reportDir,scripts,npmCli);
        manifest.checks.push(result);
        console.log(`[${result.status.toUpperCase()}] ${c.id}: exit=${result.exit_code ?? '—'} (${Math.round(result.duration_ms/1000)}s)`);
        if (c.required && result.status!=='pass') {
          console.warn(`Control ${c.id} no superado; se detiene la secuencia.`); break;
        }
      }
    }
  } finally {
    manifest.finished_at=new Date().toISOString();
    manifest.git.after=snapshotGit(root);
    manifest.git.unchanged=sameGit(manifest.git.before,manifest.git.after);
    manifest.verdict=verdict(manifest);
    writeJsonAtomic(join(reportDir,'manifest.json'),manifest);
    writeFileSync(join(reportDir,'REPORT.md'),reportText(manifest),{flag:'wx',mode:0o600});
    console.log(`Veredicto: ${manifest.verdict}`);
    console.log(`Evidencia: ${reportDir}`);
  }
  if (manifest.verdict!=='VALIDADO_DESARROLLO' && manifest.verdict!=='VALIDADO_E2E_PRODUCCION_LOCAL') process.exitCode=1;
}
main().catch(e=>{console.error(`DEVING ERROR: ${e.message}`);process.exitCode=2;});
