import { test, expect } from '@playwright/test';

test.describe('Rutas públicas', () => {
  test('/login responde con HTTP 200 y muestra el formulario', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('/ sin sesión redirige al login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('/admin sin sesión redirige al login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('ruta inexistente no devuelve pantalla vacía', async ({ page }) => {
    await page.goto('/ruta-que-no-existe');
    // Expo Router muestra +not-found, no una pantalla en blanco
    const body = await page.locator('body').textContent();
    expect(body?.trim().length).toBeGreaterThan(0);
  });
});
