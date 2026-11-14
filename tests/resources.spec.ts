import { expect, test, type Page } from '@playwright/test';
import { importThree } from './helpers';

type ResourceState = { urlsCreated: string[]; urlsRevoked: string[]; workersCreated: number; workersAlive: number };

declare global {
  interface Window { __resourceState: ResourceState }
}

async function state(page: Page): Promise<ResourceState> {
  return page.evaluate(() => ({ ...window.__resourceState, urlsCreated: [...window.__resourceState.urlsCreated], urlsRevoked: [...window.__resourceState.urlsRevoked] }));
}

test('libera el object URL y termina el worker al invalidar el resultado', async ({ page }) => {
  await page.addInitScript(() => {
    const resourceState: ResourceState = { urlsCreated: [], urlsRevoked: [], workersCreated: 0, workersAlive: 0 };
    window.__resourceState = resourceState;
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = createObjectURL(blob);
      resourceState.urlsCreated.push(url);
      return url;
    };
    URL.revokeObjectURL = url => {
      resourceState.urlsRevoked.push(url);
      revokeObjectURL(url);
    };
    const NativeWorker = window.Worker;
    const alive = new Set<Worker>();
    class TrackedWorker extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        alive.add(this);
        resourceState.workersCreated++;
        resourceState.workersAlive = alive.size;
      }
      terminate() {
        alive.delete(this);
        resourceState.workersAlive = alive.size;
        super.terminate();
      }
    }
    window.Worker = TrackedWorker as unknown as typeof Worker;
  });
  await page.goto('./');
  await importThree(page);
  await page.evaluate(() => {
    window.__resourceState.urlsCreated = [];
    window.__resourceState.urlsRevoked = [];
    window.__resourceState.workersCreated = 0;
  });
  await page.getByRole('button', { name: 'Exportar GIF' }).click();
  await expect(page.getByRole('link', { name: 'Descargar GIF' })).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await state(page)).workersAlive).toBe(0);
  const exported = await state(page);
  expect(exported.urlsCreated).toHaveLength(1);
  expect(exported.urlsRevoked).toEqual([]);
  expect(exported.workersCreated).toBeGreaterThanOrEqual(1);
  await page.getByLabel('Modo de color').selectOption('mono');
  await expect(page.getByRole('region', { name: 'Resultado de exportación' })).toHaveCount(0);
  await expect.poll(async () => (await state(page)).urlsRevoked.length).toBe(1);
  const invalidated = await state(page);
  expect(invalidated.urlsRevoked).toEqual(invalidated.urlsCreated);
});
