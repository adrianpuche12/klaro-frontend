import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // En CI NUNCA el reporte HTML: guarda los pasos `Type "<contraseña>"` del login y el repo es público
  // (así se filtraron TEST_ADMIN_PASS y los E2E_*_PASS). En local sí, para depurar.
  reporter: process.env.CI ? [['list']] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'https://app.belopia.app',
    headless: true,
    // El trace tiene lo mismo que el reporte HTML (cada tecla escrita): apagado siempre.
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-AR',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
