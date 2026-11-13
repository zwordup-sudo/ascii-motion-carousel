import { expect, type Page } from '@playwright/test';
import { getStyle, type StyleId } from '../src/core/styles';

export async function selectStyle(page: Page, id: StyleId) {
  if (await page.getByTestId('selected-style').getAttribute('data-style') === id) return;
  await page.getByTestId('selected-style').click();
  await page.getByRole('radio', { name: getStyle(id).name, exact: true }).check();
  await expect(page.getByTestId('selected-style')).toHaveAttribute('data-style', id);
}

export async function fixtures(page: Page, width = 480, height = 360) {
  return page.evaluate(({ width, height }) => [0, 1, 2].map(i => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(width / 480, height / 360);
    ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, 480, 360);
    const colors = [['#b9ff5a', '#2d8e69'], ['#c5a0ff', '#5a32c4'], ['#72f4f0', '#1875c9']];
    const gradient = ctx.createLinearGradient(80, 30, 400, 340);
    gradient.addColorStop(0, colors[i][0]); gradient.addColorStop(1, colors[i][1]);
    ctx.fillStyle = gradient;
    if (i === 0) { ctx.beginPath(); ctx.arc(240, 160, 118, 0, Math.PI * 2); ctx.fill(); }
    if (i === 1) { ctx.beginPath(); ctx.moveTo(240, 25); ctx.lineTo(390, 280); ctx.lineTo(90, 280); ctx.closePath(); ctx.fill(); }
    if (i === 2) { ctx.fillRect(118, 45, 244, 244); ctx.clearRect(175, 102, 130, 130); }
    ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = colors[i][0];
    ctx.fillText(['ORBIT / 01', 'PEAK / 02', 'PORTAL / 03'][i], 240, 335);
    const mime = ['image/png', 'image/jpeg', 'image/webp'][i];
    return { name: ['orbit.png', 'peak.jpg', 'portal.webp'][i], mimeType: mime, data: canvas.toDataURL(mime).split(',')[1] };
  }), { width, height });
}

export async function importThree(page: Page) {
  const files = await fixtures(page);
  await page.getByLabel('Seleccionar imágenes', { exact: true }).setInputFiles(files.map(file => ({ name: file.name, mimeType: file.mimeType, buffer: Buffer.from(file.data, 'base64') })));
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 3');
  await waitForRender(page, 96);
}

export async function waitForRender(page: Page, columns: number) {
  await expect(page.locator('canvas')).toHaveAttribute('data-columns', String(columns));
  await expect(page.locator('canvas')).toHaveAttribute('aria-busy', 'false');
}
