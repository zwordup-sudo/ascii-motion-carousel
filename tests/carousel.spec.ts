import { expect, test } from '@playwright/test';
import { decode, decodeFrames } from 'modern-gif';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixtures, importThree, waitForRender } from './helpers';

test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('exporta tres imágenes ASCII a un GIF autónomo para el README', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const external: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on('request', request => { if (!request.url().startsWith(`${origin}/`) && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) external.push(request.url()); });
  await importThree(page);
  await expect(page.getByLabel('Intervalo por imagen')).toHaveValue('5');
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  const downloadLink = page.getByRole('link', { name: 'Descargar GIF' });
  await expect(downloadLink).toBeVisible({ timeout: 30000 });
  const downloadEvent = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadEvent;
  const path = testInfo.outputPath('ascii-motion.gif');
  await download.saveAs(path);
  const bytes = await readFile(path);
  const buffer = new Uint8Array(bytes).buffer;
  const gif = decode(buffer);
  expect([gif.width, gif.height, gif.loopCount]).toEqual([320, 320, 0]);
  expect(gif.looped).toBe(true);
  expect(gif.frames.map(frame => frame.delay)).toEqual([5000, 5000, 5000]);
  const frames = decodeFrames(buffer);
  for (const frame of frames) {
    const colored = frame.data.filter((_, i) => i % 4 !== 3 && frame.data[i] > 40).length;
    expect(colored).toBeGreaterThan(1000);
    // Real ASCII has a predominantly black field with sparse colored glyph strokes.
    const black = Array.from({ length: 320 * 320 }, (_, i) => frame.data[i * 4] + frame.data[i * 4 + 1] + frame.data[i * 4 + 2] < 30).filter(Boolean).length;
    expect(black).toBeGreaterThan(320 * 320 * 0.5);
  }
  expect(frames[0].data).not.toEqual(frames[1].data);
  await expect(page.getByLabel('Markdown para GitHub')).toHaveValue('![Carrusel ASCII animado](./ascii-motion.gif)');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  if (process.env.GENERATE_DEMO === '1') {
    await waitForRender(page, 96);
    await download.saveAs('docs/demo/ascii-motion.gif');
    await page.screenshot({ path: 'docs/demo/editor.png', fullPage: true, animations: 'disabled' });
  }
});

test('reordena, elimina y reproduce con intervalos exactos y bucle', async ({ page }) => {
  await importThree(page);
  await page.getByRole('button', { name: 'Subir portal.webp' }).click();
  await expect(page.locator('.image-name')).toHaveText(['01orbit.png', '02portal.webp', '03peak.jpg']);
  await page.getByRole('button', { name: 'Ver orbit.png' }).click();
  const start = new Date('2026-11-13T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await page.getByRole('button', { name: 'Reproducir' }).click();
  await page.clock.fastForward(4999);
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 3');
  await page.clock.fastForward(1);
  await expect(page.getByTestId('frame-counter')).toHaveText('2 / 3');
  await page.clock.fastForward(5000);
  await expect(page.getByTestId('frame-counter')).toHaveText('3 / 3');
  await page.clock.fastForward(5000);
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 3');
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.clock.fastForward(15000);
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 3');
  for (const seconds of [3, 10, 15]) {
    await page.getByLabel('Intervalo por imagen').selectOption(String(seconds));
    await page.getByRole('button', { name: 'Reproducir' }).click();
    await page.clock.fastForward(seconds * 1000 - 1);
    await expect(page.getByTestId('frame-counter')).toHaveText('1 / 3');
    await page.clock.fastForward(1);
    await expect(page.getByTestId('frame-counter')).toHaveText('2 / 3');
    await page.getByRole('button', { name: 'Pausar' }).click();
    await page.getByRole('button', { name: 'Ver orbit.png' }).click();
  }
  await page.getByRole('button', { name: 'Eliminar portal.webp' }).click();
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 2');
});

test('rechaza archivos inválidos o dañados, acepta válidos del mismo lote y limpia el resultado obsoleto', async ({ page }) => {
  const files = await fixtures(page);
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles([
    { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
    { name: 'script.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
    { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
    { name: files[0].name, mimeType: files[0].mimeType, buffer: Buffer.from(files[0].data, 'base64') },
  ]);
  await expect(page.getByRole('alert')).toContainText('fake.png');
  await expect(page.getByRole('alert')).toContainText('JPG, PNG o WebP');
  await expect(page.getByRole('alert')).toContainText('vacío');
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 1');
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  await expect(page.getByRole('link', { name: 'Descargar GIF' })).toBeVisible();
  await page.getByLabel('Modo de color').selectOption('mono');
  await expect(page.getByRole('link', { name: 'Descargar GIF' })).not.toBeVisible();
  await page.getByLabel('Brillo', { exact: true }).press('End');
  await expect(page.getByLabel('Brillo', { exact: true })).toHaveValue('80');
  await waitForRender(page, 96);
  const padding = await page.locator('canvas').evaluate(canvas => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(160, 10, 1, 1).data));
  expect(padding).toEqual([0, 0, 0, 255]);
  await page.getByRole('button', { name: 'Eliminar orbit.png' }).click();
  await expect(page.getByRole('button', { name: 'Exportar GIF' })).toBeDisabled();
});

test('el editor se adapta a móvil sin desbordamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importThree(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Modo de color')).toBeVisible();
});

test('importa una carpeta y respeta el límite de imágenes', async ({ page }, testInfo) => {
  const files = await fixtures(page);
  const folder = testInfo.outputPath('album');
  await mkdir(join(folder, 'subcarpeta'), { recursive: true });
  for (const [i, file] of files.entries()) {
    await writeFile(join(folder, i === 2 ? 'subcarpeta' : '', file.name), Buffer.from(file.data, 'base64'));
  }
  await page.getByLabel('Seleccionar carpeta', { exact: true }).setInputFiles(folder);
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 3');
  const repeated = Array.from({ length: 20 }, (_, i) => ({ name: `copy-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(files[0].data, 'base64') }));
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles(repeated);
  await expect(page.getByRole('alert')).toContainText('Máximo 20 imágenes');
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 20');
});

test('exporta el orden elegido y fusiona renders consecutivos idénticos', async ({ page }, testInfo) => {
  const files = await fixtures(page);
  const [first, second] = files;
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles([first, first, second].map((file, i) => ({ name: `${i}-${file.name}`, mimeType: file.mimeType, buffer: Buffer.from(file.data, 'base64') })));
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 3');
  await page.getByRole('button', { name: 'Subir 2-peak.jpg' }).click();
  await page.getByRole('button', { name: 'Subir 2-peak.jpg' }).click();
  await page.getByLabel('Intervalo por imagen').selectOption('3');
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  const link = page.getByRole('link', { name: 'Descargar GIF' });
  await expect(link).toBeVisible();
  const downloading = page.waitForEvent('download');
  await link.click();
  const path = testInfo.outputPath('ordered.gif');
  await (await downloading).saveAs(path);
  const gif = decode(new Uint8Array(await readFile(path)).buffer);
  expect(gif.frames.map(frame => frame.delay)).toEqual([3000, 6000]);
  const frames = decodeFrames(new Uint8Array(await readFile(path)).buffer);
  const sums = frames.map(frame => {
    const channels = [0, 0, 0];
    for (let i = 0; i < frame.data.length; i += 4) for (let c = 0; c < 3; c++) channels[c] += frame.data[i + c];
    return channels;
  });
  expect(sums[0][2]).toBeGreaterThan(sums[0][1]); // Purple triangle was moved first.
  expect(sums[1][1]).toBeGreaterThan(sums[1][2]); // Two green orbits share six seconds.
});
