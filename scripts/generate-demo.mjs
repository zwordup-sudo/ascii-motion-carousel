import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-g', 'exporta tres imágenes'], {
  stdio: 'inherit', env: { ...process.env, GENERATE_DEMO: '1' },
});
process.exit(result.status ?? 1);
