import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { decode, decodeFrames } from 'modern-gif';
import { readFile, writeFile } from 'node:fs/promises';
import { fixtures, importThree, selectStyle, waitForRender } from './helpers';
import { RAMPS } from '../src/core/ascii';

async function downloadGif(page: Page, testInfo: TestInfo) {
  const link = page.getByRole('link', { name: 'Descargar GIF' });
  await expect(link).toBeVisible({ timeout: 120000 });
  const downloading = page.waitForEvent('download');
  await link.click();
  const path = testInfo.outputPath('resolution.gif');
  await (await downloading).saveAs(path);
  const buffer = new Uint8Array(await readFile(path)).buffer;
  return { buffer, gif: decode(buffer) };
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });

for (const [columns, size] of [[16, 320], [48, 320], [96, 640], [160, 1024], [300, 2048]]) {
  test(`${columns} columnas: proporciones, glifos completos y preview/GIF a ${size}`, async ({ page }, testInfo) => {
    await importThree(page);
    await page.getByLabel('Resolución de exportación').selectOption('auto');
    await page.getByRole('button', { name: `${columns} columnas`, exact: true }).click();
    await expect(page.getByTestId('columns-value')).toHaveText(`${columns} columnas`);
    await page.getByLabel('Tamaño de carácter', { exact: true }).press('End');
    await waitForRender(page, columns);
    await expect(page.locator('canvas')).toHaveJSProperty('width', size);
    const geometry = await page.locator('canvas').evaluate((element, columns) => {
      const canvas = element as HTMLCanvasElement;
      const rows = Number(canvas.dataset.rows);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = '100px monospace';
      const metrics = Array.from(' .:-=+*#%@', glyph => ctx.measureText(glyph));
      const advance = Math.max(...metrics.map(m => m.width));
      const lineHeight = Math.max(...metrics.map(m => (m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent) + (m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent)));
      return {
        rows, expectedRows: Math.round(columns * .75 * advance / lineHeight),
        fits: canvas.dataset.glyphFit === 'true', // Atlas checks ink bounds before raster clipping.
      };
    }, columns);
    expect(geometry.rows).toBe(geometry.expectedRows);
    expect(geometry.fits).toBe(true);
    await page.getByRole('button', { name: 'Exportar GIF' }).click();
    const { buffer, gif } = await downloadGif(page, testInfo);
    expect([gif.width, gif.height, gif.loopCount]).toEqual([size, size, 0]);
    expect(gif.frames.map(frame => frame.delay)).toEqual([5000, 5000, 5000]);
    const frame = decodeFrames(buffer)[0];
    // Compare a deterministic grid of original-resolution pixels, allowing GIF quantization.
    const samples = Array.from({ length: 2000 }, (_, i) => {
      const pixel = (i * 7919) % (size * size);
      return { pixel, rgb: Array.from(frame.data.slice(pixel * 4, pixel * 4 + 3)) };
    });
    const error = await page.locator('canvas').evaluate((element, samples) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      return samples.reduce((sum, sample) => sum + sample.rgb.reduce((delta, value, c) => delta + Math.abs(value - pixels[sample.pixel * 4 + c]), 0), 0) / (samples.length * 3);
    }, samples);
    expect(error).toBeLessThan(5);
    await testInfo.attach('visual-comparison.json', { body: JSON.stringify({ columns, size, meanChannelError: error, bytes: buffer.byteLength }), contentType: 'application/json' });
    if (process.env.GENERATE_V02_DEMO === '1' && columns === 300) {
      await writeFile('docs/v02/ascii-300.gif', new Uint8Array(buffer));
      const png = await page.locator('canvas').evaluate(element => (element as HTMLCanvasElement).toDataURL('image/png').split(',')[1]);
      await writeFile('docs/v02/preview-300.png', Buffer.from(png, 'base64'));
      await page.screenshot({ path: 'docs/v02/editor.png', fullPage: true, animations: 'disabled' });
    }
  });
}

test('slider unitario, debounce, avisos y resoluciones explícitas', async ({ page }, testInfo) => {
  await importThree(page);
  const slider = page.getByLabel('Densidad', { exact: true });
  await expect(slider).toHaveValue('96');
  await expect(slider).toHaveAttribute('min', '16');
  await expect(slider).toHaveAttribute('max', '300');
  await expect(slider).toHaveAttribute('step', '1');
  await slider.press('ArrowRight');
  await expect(page.getByTestId('columns-value')).toHaveText('97 columnas');
  await slider.press('End');
  await expect(page.getByTestId('columns-value')).toHaveText('300 columnas');
  await expect(page.getByRole('note')).toContainText('Resolución insuficiente');
  await waitForRender(page, 300);
  for (const size of [320, 640, 1024]) {
    await page.getByLabel('Resolución de exportación').selectOption(String(size));
    await waitForRender(page, 300);
    await page.getByRole('button', { name: 'Exportar GIF' }).click();
    const { gif } = await downloadGif(page, testInfo);
    expect([gif.width, gif.height]).toEqual([size, size]);
  }
});

test('300 columnas retienen bandas de cuatro píxeles sin prerreducir la fuente a 320', async ({ page }) => {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1200, 600);
    ctx.fillStyle = '#fff';
    for (let x = 0; x < 1200; x += 8) ctx.fillRect(x, 0, 4, 600);
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles({ name: 'fine-detail.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await page.getByLabel('Resolución de exportación').selectOption('auto');
  await page.getByRole('button', { name: '300 columnas', exact: true }).click();
  await waitForRender(page, 300);
  const bands = await page.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from({ length: 300 }, (_, column) => {
      const x = Math.floor((column + .5) * canvas.width / 300);
      let sum = 0;
      for (let y = 0; y < canvas.height; y++) sum += data[(y * canvas.width + x) * 4];
      return sum;
    });
  });
  expect(bands.filter((value, i) => i % 2 === 0 && value > 1000)).toHaveLength(150);
  expect(bands.filter((value, i) => i % 2 === 1 && value === 0)).toHaveLength(150);
});

test('retrato, rampa detallada y ajustes existentes conservados entre presets', async ({ page }) => {
  const [file] = await fixtures(page, 600, 1200);
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles({ name: 'portrait.png', mimeType: file.mimeType, buffer: Buffer.from(file.data, 'base64') });
  await page.getByLabel('Modo de color').selectOption('mono');
  await selectStyle(page, 'detailed');
  await page.getByLabel('Contraste', { exact: true }).press('End');
  await page.getByLabel('Brillo', { exact: true }).press('End');
  await page.getByLabel('Tamaño de carácter', { exact: true }).press('End');
  await page.getByLabel('Resolución de exportación').selectOption('auto');
  await page.getByRole('button', { name: '160 columnas', exact: true }).click();
  await waitForRender(page, 160);
  await expect(page.locator('canvas')).toHaveJSProperty('width', 2048);
  await expect(page.getByLabel('Modo de color')).toHaveValue('mono');
  await expect(page.getByTestId('selected-style')).toHaveAttribute('data-style', 'detailed');
  await expect(page.getByLabel('Contraste', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Brillo', { exact: true })).toHaveValue('80');
  const info = await page.locator('canvas').evaluate((element, ramp) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = '100px monospace';
    const metrics = Array.from(ramp, character => ctx.measureText(character));
    const advance = Math.max(...metrics.map(m => m.width));
    const lineHeight = Math.max(...metrics.map(m => Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
      (m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent) + (m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent))));
    return {
      rows: Number(canvas.dataset.rows),
      expectedRows: Math.round(160 * 2 * advance / lineHeight),
      fits: canvas.dataset.glyphFit === 'true',
      side: Array.from(canvas.getContext('2d')!.getImageData(10, 1024, 1, 1).data),
    };
  }, RAMPS.detailed);
  expect(info.rows).toBe(info.expectedRows);
  expect(info.fits).toBe(true);
  expect(info.side).toEqual([0, 0, 0, 255]);
});

test('cancela una exportación grande y permite exportar de nuevo', async ({ page }, testInfo) => {
  const files = await fixtures(page);
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles(Array.from({ length: 20 }, (_, i) => ({ name: `${i}.png`, mimeType: files[i % 3].mimeType, buffer: Buffer.from(files[i % 3].data, 'base64') })));
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 20');
  await page.getByRole('button', { name: '300 columnas', exact: true }).click();
  await page.getByLabel('Resolución de exportación').selectOption('auto');
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect.poll(async () => Number(await page.getByRole('progressbar').getAttribute('value'))).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Cancelar exportación' }).click();
  await expect(page.getByTestId('export-status')).toContainText('cancelada');
  await expect(page.getByRole('button', { name: 'Exportar GIF' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Descargar GIF' })).not.toBeVisible();
  await page.getByLabel('Resolución de exportación').selectOption('320');
  await page.getByRole('button', { name: '48 columnas', exact: true }).click();
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  const { gif } = await downloadGif(page, testInfo);
  expect(gif.frames).toHaveLength(20);
});

test('debounce descarta cambios rápidos y no dibuja una densidad obsoleta', async ({ page }) => {
  await importThree(page);
  const start = new Date('2026-11-13T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  const slider = page.getByLabel('Densidad', { exact: true });
  await slider.press('Home');
  await expect(page.getByTestId('columns-value')).toHaveText('16 columnas');
  await page.clock.fastForward(100);
  await slider.press('End');
  await page.clock.fastForward(159);
  await expect(page.locator('canvas')).toHaveAttribute('data-columns', '96');
  await page.clock.fastForward(1);
  await waitForRender(page, 300);
});

test('20 imágenes a 300 columnas: exportación acotada y navegador receptivo', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const files = await fixtures(page, 1600, 1200);
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles(Array.from({ length: 20 }, (_, i) => ({ name: `${i}-${files[i % 3].name}`, mimeType: files[i % 3].mimeType, buffer: Buffer.from(files[i % 3].data, 'base64') })));
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 20');
  await page.getByRole('button', { name: '300 columnas', exact: true }).click();
  await page.getByLabel('Resolución de exportación').selectOption('auto');
  await waitForRender(page, 300);
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  let peakMainJsHeap = 0;
  const sampler = setInterval(() => {
    void session.send('Performance.getMetrics').then(({ metrics }) => {
      peakMainJsHeap = Math.max(peakMainJsHeap, metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0);
    }).catch(() => {});
  }, 100);
  await page.evaluate(() => {
    const probe = { ticks: 0, maxGap: 0, last: performance.now(), id: 0 };
    probe.id = window.setInterval(() => { const now = performance.now(); probe.maxGap = Math.max(probe.maxGap, now - probe.last); probe.last = now; probe.ticks++; }, 16);
    Object.assign(window, { v02Probe: probe });
  });
  const start = Date.now();
  try {
    await page.getByRole('button', { name: 'Exportar GIF' }).click();
    const { buffer, gif } = await downloadGif(page, testInfo);
    const elapsedMs = Date.now() - start;
    const probe = await page.evaluate(() => {
      const probe = (window as typeof window & { v02Probe: { ticks: number; maxGap: number; id: number } }).v02Probe;
      clearInterval(probe.id);
      return { ticks: probe.ticks, maxGapMs: probe.maxGap };
    });
    expect([gif.width, gif.height]).toEqual([2048, 2048]);
    expect(gif.frames).toHaveLength(20);
    expect(buffer.byteLength).toBeLessThan(32 * 1024 * 1024);
    expect(probe.ticks).toBeGreaterThan(20);
    expect(probe.maxGapMs).toBeLessThan(1000);
    const peakRgba = Number(await page.getByRole('region', { name: 'Resultado de exportación' }).getAttribute('data-peak-rgba-bytes'));
    expect(peakRgba).toBe(2 * 2048 * 2048 * 4);
    const report = { images: 20, sourceSize: '1600x1200 (tres patrones alternados)', columns: 300, output: 2048, elapsedMs, gifBytes: buffer.byteLength,
      nodeVersion: process.version, browserVersion: page.context().browser()?.version(),
      workerPeakRgbaBytes: peakRgba, cacheBudgetBytes: 16 * 1024 * 1024, peakMainJsHeapBytes: peakMainJsHeap,
      ...probe, memoryNote: 'RGBA contabiliza pendiente+entrante. Heap CDP solo del hilo principal; excluye worker, backing stores Canvas/bitmap y memoria interna del códec. No es memoria total del navegador.' };
    console.log('Carousel stress:', JSON.stringify(report));
    await testInfo.attach('v02-stress.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    if (process.env.GENERATE_V02_REPORT === '1') await writeFile('docs/v02/performance.json', JSON.stringify(report, null, 2) + '\n');
    if (process.env.GENERATE_V04_ARTIFACTS === '1') await writeFile('docs/v04/performance.json', JSON.stringify(report, null, 2) + '\n');
  } finally { clearInterval(sampler); await session.detach(); }
});
