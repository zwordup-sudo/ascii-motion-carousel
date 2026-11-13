import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { decode, decodeFrames } from 'modern-gif';
import { readFile, writeFile } from 'node:fs/promises';
import { CHARACTER_STYLES } from '../src/core/styles';
import { PREFERENCES_KEY } from '../src/preferences';
import { fixtures, importThree, selectStyle, waitForRender } from './helpers';

async function waitStyle(page: Page, style: string) {
  await expect(page.locator('canvas')).toHaveAttribute('data-style', style);
  await expect(page.locator('canvas')).toHaveAttribute('aria-busy', 'false');
}
async function downloaded(page: Page, info: TestInfo) {
  await expect(page.getByRole('link', { name: 'Descargar GIF' })).toBeVisible({ timeout: 60000 });
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Descargar GIF' }).click();
  const path = info.outputPath('characters.gif');
  await (await downloading).saveAs(path);
  return new Uint8Array(await readFile(path)).buffer;
}
async function comparePreview(page: Page, buffer: ArrayBuffer) {
  const frame = decodeFrames(buffer)[0];
  const samples = Array.from({ length: 4000 }, (_, i) => {
    const pixel = (i * 7919) % (frame.width * frame.height);
    return { pixel, rgb: Array.from(frame.data.slice(pixel * 4, pixel * 4 + 3)) };
  });
  const difference = await page.locator('canvas').evaluate((element, samples) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return samples.reduce((sum, sample) => sum + sample.rgb.reduce((delta, value, c) => delta + Math.abs(value - pixels[sample.pixel * 4 + c]), 0), 0) / (samples.length * 3);
  }, samples);
  expect(difference).toBeLessThan(5);
  expect(frame.data.some((value, i) => i % 4 !== 3 && value > 60)).toBe(true);
  return difference;
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });

for (const style of CHARACTER_STYLES) {
  test(`${style.name}: caracteres reales y preview/GIF coherentes`, async ({ page }, info) => {
    await importThree(page);
    await page.getByRole('button', { name: '48 columnas', exact: true }).click();
    await page.getByLabel('Resolución de exportación').selectOption('640');
    await selectStyle(page, style.id);
    if (style.id === 'custom') await page.getByLabel('Secuencia personalizada').fill(' ·é⣿👩‍💻');
    if (style.id === 'true-braille') await page.getByLabel('Dithering Floyd–Steinberg').check();
    await waitStyle(page, style.id);
    await waitForRender(page, 48);
    const hash = await page.locator('canvas').evaluate(element => (element as HTMLCanvasElement).toDataURL());
    await page.getByRole('button', { name: 'Exportar GIF' }).click();
    const output = await downloaded(page, info);
    const gif = decode(output);
    expect([gif.width, gif.height, gif.loopCount]).toEqual([640, 640, 0]);
    expect(gif.frames.map(frame => frame.delay)).toEqual([5000, 5000, 5000]);
    const error = await comparePreview(page, output);
    await info.attach('character-style.json', { body: JSON.stringify({ style: style.id, bytes: output.byteLength, meanChannelError: error }), contentType: 'application/json' });
    if (process.env.GENERATE_V03_DEMO === '1' && style.id === 'true-braille') {
      await writeFile('docs/v03/true-braille.gif', new Uint8Array(output));
      await writeFile('docs/v03/preview.png', Buffer.from(hash.split(',')[1], 'base64'));
      await page.screenshot({ path: 'docs/v03/editor.png', fullPage: true, animations: 'disabled' });
    }
  });
}

test('selector propio accesible muestra nombre, muestra, cantidad y descripción', async ({ page }) => {
  await page.getByTestId('selected-style').press('Enter');
  await expect(page.getByRole('radio')).toHaveCount(12);
  for (const style of CHARACTER_STYLES) {
    const option = page.getByRole('radio', { name: style.name, exact: true }).locator('..');
    await expect(option.locator('code')).not.toBeEmpty();
    await expect(option).toContainText(style.description);
  }
  await page.getByRole('radio', { name: 'Minimal', exact: true }).check();
  await expect(page.getByTestId('selected-style')).toHaveAttribute('data-style', 'minimal');
  await page.getByTestId('selected-style').press('Enter');
  await page.getByRole('radio', { name: 'Minimal', exact: true }).press('Escape');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByTestId('selected-style')).toBeFocused();
});

test('paletas nuevas ordenadas por cobertura de tinta en la fuente empaquetada', async ({ page }) => {
  await page.getByTestId('selected-style').click();
  await page.evaluate(() => Promise.all([document.fonts.load('100px "Carousel Symbols"', '░●'), document.fonts.load('100px "Carousel Braille"', '⣿')]));
  const ramps = CHARACTER_STYLES.filter(style => style.kind === 'ramp' && !['standard', 'detailed', 'blocks'].includes(style.id));
  const coverage = await page.evaluate(ramps => ramps.map(style => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 180;
    const ctx = canvas.getContext('2d')!; ctx.font = '100px "Carousel Symbols", "Carousel Braille"'; ctx.fillStyle = '#fff';
    return { id: style.id, levels: Array.from(style.characters, character => {
      ctx.clearRect(0, 0, 180, 180); ctx.fillText(character, 30, 120);
      const rgba = ctx.getImageData(0, 0, 180, 180).data;
      let sum = 0; for (let i = 3; i < rgba.length; i += 4) sum += rgba[i];
      return sum;
    }) };
  }), ramps);
  console.log('V0.3 ink coverage:', JSON.stringify(coverage));
  for (const ramp of coverage) {
    expect(ramp.levels[0]).toBe(0);
    expect(ramp.levels.at(-1)).toBeGreaterThan(10000);
    for (let i = 1; i < ramp.levels.length; i++) expect(ramp.levels[i], ramp.id).toBeGreaterThanOrEqual(ramp.levels[i - 1] * .98);
  }
});

test('Custom conserva grafemas, invierte, valida y persiste sin almacenar imágenes', async ({ page }, info) => {
  await importThree(page);
  await selectStyle(page, 'custom');
  const input = page.getByLabel('Secuencia personalizada');
  await input.fill(' e\u0301⣿👩‍💻');
  await expect(page.getByText('Unicode: 4 caracteres.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Invertir orden' }).click();
  await expect(input).toHaveValue('👩‍💻⣿é ');
  await input.fill('ée\u0301');
  await expect(page.getByRole('alert')).toContainText('repetidos');
  await expect(page.getByRole('button', { name: 'Exportar GIF' })).toBeDisabled();
  await input.fill(' ·é⣿👩‍💻');
  await waitStyle(page, 'custom');
  await input.fill(' 👩‍💻');
  await waitStyle(page, 'custom');
  await page.getByLabel('Modo de color').selectOption('mono');
  await expect(page.locator('canvas')).toHaveAttribute('aria-busy', 'false');
  const hasAlienColor = await page.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 80 && (data[i + 1] < data[i] || data[i] < data[i + 2])) return true;
    }
    return false;
  });
  expect(hasAlienColor).toBe(false);
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  await comparePreview(page, await downloaded(page, info));
  await input.fill(' ·é⣿👩‍💻');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PREFERENCES_KEY);
  expect(stored.customRamp).toBe(' ·é⣿👩‍💻');
  expect(Object.keys(stored).sort()).toEqual(['brailleDither', 'brailleThreshold', 'customRamp', 'ramp']);
  await page.reload();
  await expect(page.getByTestId('selected-style')).toHaveAttribute('data-style', 'custom');
  await expect(page.getByLabel('Secuencia personalizada')).toHaveValue(' ·é⣿👩‍💻');
  await expect(page.getByTestId('frame-counter')).toHaveText('0 / 0');
});

test('True Braille mantiene posiciones de puntos, no centra cada máscara parcial', async ({ page }) => {
  await page.getByRole('button', { name: '16 columnas', exact: true }).click();
  await page.getByLabel('Resolución de exportación').selectOption('640');
  await selectStyle(page, 'true-braille');
  const positions: number[] = [];
  for (const dotRow of [0, 1]) {
    const source = await page.evaluate(dotRow => {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 2;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 32, 2); ctx.fillStyle = '#fff';
      for (let x = 0; x < 32; x += 2) ctx.fillRect(x, dotRow, 1, 1);
      return canvas.toDataURL().split(',')[1];
    }, dotRow);
    await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles({ name: `dot-${dotRow}.png`, mimeType: 'image/png', buffer: Buffer.from(source, 'base64') });
    await expect(page.getByTestId('frame-counter')).toHaveText(`1 / ${positions.length + 1}`);
    await page.getByRole('button', { name: `Ver dot-${dotRow}.png`, exact: true }).click();
    await waitStyle(page, 'true-braille');
    await waitForRender(page, 16);
    positions.push(await page.locator('canvas').evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      const rows = Number(canvas.dataset.rows);
      if (rows !== 1) throw new Error('La fixture de posiciones debe formar una sola fila Braille.');
      const top = 300, bottom = 340;
      const rgba = canvas.getContext('2d')!.getImageData(0, 0, 640, 640).data;
      let sum = 0, weight = 0;
      for (let y = top; y < bottom; y++) for (let x = 0; x < 40; x++) {
        const value = rgba[(y * 640 + x) * 4]; sum += y * value; weight += value;
      }
      return sum / weight;
    }));
  }
  expect(Number.isFinite(positions[0])).toBe(true);
  expect(positions[1] - positions[0]).toBeGreaterThan(10);
});

test('True Braille a 300 columnas, threshold/dithering, transparencia y GIF', async ({ page }, info) => {
  const [file] = await fixtures(page, 1600, 1200);
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles({ name: 'high-detail.png', mimeType: file.mimeType, buffer: Buffer.from(file.data, 'base64') });
  await selectStyle(page, 'true-braille');
  await page.getByRole('button', { name: '300 columnas', exact: true }).click();
  await page.getByLabel('Resolución de exportación').selectOption('auto');
  await page.getByLabel('Umbral Braille', { exact: true }).press('Home');
  await page.getByLabel('Umbral Braille', { exact: true }).press('ArrowRight');
  await page.getByLabel('Dithering Floyd–Steinberg').check();
  await waitStyle(page, 'true-braille');
  await waitForRender(page, 300);
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  const output = await downloaded(page, info);
  expect(decode(output).width).toBe(2048);
  await comparePreview(page, output);
  await page.reload();
  await expect(page.getByLabel('Umbral Braille', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Dithering Floyd–Steinberg')).toBeChecked();
  const transparent = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; return canvas.toDataURL().split(',')[1]; });
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(transparent, 'base64') });
  await page.getByLabel('Brillo', { exact: true }).press('End');
  await page.getByLabel('Umbral Braille', { exact: true }).press('Home');
  await waitStyle(page, 'true-braille');
  const isBlack = await page.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.every((value, i) => i % 4 === 3 || value === 0);
  });
  expect(isBlack).toBe(true);
});

test('Storage denegado no bloquea edición y selector funciona en móvil', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Preferencias locales no disponibles', { exact: false })).toBeVisible();
  await selectStyle(page, 'custom');
  await page.getByLabel('Secuencia personalizada').fill(' ·é⣿');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('todos los estilos admiten 300 columnas y conservan los controles comunes', async ({ page }) => {
  await importThree(page);
  await page.getByRole('button', { name: '300 columnas', exact: true }).click();
  await page.getByLabel('Resolución de exportación').selectOption('auto');
  await page.getByLabel('Modo de color').selectOption('mono');
  for (const style of CHARACTER_STYLES) {
    await selectStyle(page, style.id);
    if (style.id === 'custom') await page.getByLabel('Secuencia personalizada').fill(' ·é⣿👩‍💻');
    await waitStyle(page, style.id);
    await waitForRender(page, 300);
    await expect(page.locator('canvas')).toHaveJSProperty('width', 2048);
    await expect(page.getByLabel('Modo de color')).toHaveValue('mono');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});
