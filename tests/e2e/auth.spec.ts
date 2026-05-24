import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.TEST_ADMIN_USER ?? 'root.admin';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS ?? '';
const USER_USER  = process.env.TEST_USER_USER  ?? '';
const USER_PASS  = process.env.TEST_USER_PASS  ?? '';

async function login(page: any, username: string, password: string) {
  await page.goto('/login');
  // React Native Paper pone un span flotante sobre el input — usamos click force + type.
  await page.locator('input').nth(0).click({ force: true });
  await page.keyboard.type(username);
  await page.locator('input').nth(1).click({ force: true });
  await page.keyboard.type(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

// ─── Admin (root / admin) ─────────────────────────────────────────────────────

test.describe('Admin login', () => {
  test.skip(!ADMIN_PASS, 'TEST_ADMIN_PASS no está definido');

  test('login como admin redirige al AdminDashboard', async ({ page }) => {
    await login(page, ADMIN_USER, ADMIN_PASS);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Dashboard').first()).toBeVisible();
  });

  test('admin puede cerrar sesión y vuelve al login', async ({ page }) => {
    await login(page, ADMIN_USER, ADMIN_PASS);
    await expect(page.getByText('Dashboard').first()).toBeVisible();
    await page.getByText('Cerrar sesión').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('credenciales incorrectas muestran error', async ({ page }) => {
    await login(page, ADMIN_USER, 'wrong-password-123');
    await expect(page.getByText(/Usuario o contraseña incorrectos/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── User ─────────────────────────────────────────────────────────────────────

test.describe('User login', () => {
  test.skip(!USER_PASS, 'TEST_USER_PASS no está definido');

  test('login como user redirige al UserDashboard', async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Ventas').first()).toBeVisible();
  });

  test('user puede cerrar sesión y vuelve al login', async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await expect(page.getByText('Ventas').first()).toBeVisible();
    await page.getByText('Cerrar sesión').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
