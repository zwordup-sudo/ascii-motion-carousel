import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { selectStyle, waitForRender } from './helpers';

test('captura diagnóstica V0.3 antes de implementar V0.4', async ({ page }) => {
  test.skip(process.env.CAPTURE_V03_BASELINE !== '1', 'Captura histórica explícita; no sobrescribir tras implementar.');
  await page.goto('/');
  await expect(page.locator('.version')).toContainText('V0.3');
  const svg = await readFile('tests/fixtures/reference-v04.svg', 'utf8');
  const source = await page.evaluate(async svg => {
    const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.toDataURL().split(',')[1];
  }, svg);
  await writeFile('public/reference-v04.png', Buffer.from(source, 'base64'));
  await writeFile('docs/v04/original.png', Buffer.from(source, 'base64'));
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles({ name: 'reference-v04.png', mimeType: 'image/png', buffer: Buffer.from(source, 'base64') });
  await selectStyle(page, 'shading');
  await page.getByRole('button', { name: '300 columnas', exact: true }).click();
  await page.getByLabel('Resolución de exportación').selectOption('auto');
  await waitForRender(page, 300);
  await expect(page.locator('canvas')).toHaveAttribute('data-style', 'shading');
  const result = await page.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0; for (let i = 0; i < data.length; i += 4) sum += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    return { png: canvas.toDataURL().split(',')[1], meanLuma: sum / (canvas.width * canvas.height), rows: canvas.dataset.rows, size: canvas.width };
  });
  await writeFile('docs/v04/before-v03.png', Buffer.from(result.png, 'base64'));
  await writeFile('docs/v04/baseline.json', JSON.stringify({ version: '0.3', columns: 300, style: 'shading', contrast: 1.15, brightness: 0, fontScale: 1,
    meanLuma: result.meanLuma, rows: result.rows, size: result.size }, null, 2) + '\n');
  console.log('V0.3 baseline', { ...result, png: '(archivo PNG)' });
});
