# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
    npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Tests (Belopia)

### Unitarios (jest)

```bash
npm run test:unit      # una corrida, como en el CI
npm test               # modo watch
```

Los specs de `tests/e2e/` quedan fuera de jest (`testPathIgnorePatterns`). El CI corre
`test:unit` en el job "TypeScript + Build Web".

### E2E (Playwright)

Corren contra la empresa de prueba **`e2e-pruebas`** del realm `klaro-dev`, sin datos reales.
Usuarios por rol: `e2e.root`, `e2e.encargado`, `e2e.contador` y `e2e.cajero`.

```bash
# Siempre con TEST_BASE_URL: sin ella, playwright.config.ts apunta a PROD.
TEST_BASE_URL=https://dev.belopia.app E2E_CAJERO_USER=... E2E_CAJERO_PASS=... npm run test:e2e
```

Variables: `E2E_<ROL>_USER` y `E2E_<ROL>_PASS` para `ROOT`, `ENCARGADO`, `CAJERO` y `CONTADOR`.
Sin las de un rol, sus tests se **saltean**.

En el CI (`.github/workflows/ci.yml`):
- En cada PR del mismo repo se construye el frontend del PR, se sirve en `localhost:8081` y se
  prueba contra el backend y el Keycloak de DEV.
- En push a `develop` se prueba `dev.belopia.app`, y **un test salteado deja el job en rojo**
  (paso "Ningún test E2E salteado en develop"): es la señal de que vencieron o faltan secrets.
- Si algo falla se suben solo capturas (`.png`) y videos (`.webm`). **Nunca** el
  `playwright-report/` ni el JSON: el repo es público y el reporte guarda lo que se escribió en
  los inputs, contraseñas incluidas.

### Preparar o reparar la empresa de prueba

`scripts/e2e/preparar-empresa-e2e.mjs` usa la API de la app (como una persona): con el usuario
de plataforma da de alta la empresa y su dueño, y con el dueño crea el local, un producto con
stock, los roles y los usuarios. No toca empresas existentes y se niega a correr contra PROD.

```bash
PLATFORM_USER=... PLATFORM_PASS=... OUT_FILE=~/.secrets/belopia-e2e-dev.env node scripts/e2e/preparar-empresa-e2e.mjs

gh secret set -f ~/.secrets/belopia-e2e-dev.env   # carga los 8 secrets E2E_*
```

- Las contraseñas se generan en el script y se escriben **solo** en `OUT_FILE`: no se imprimen y
  no van al repo ni al vault.
- Volver a correrlo completa lo que falte (por ejemplo, repone el stock del producto).
- `ROTAR=1` asigna contraseñas nuevas a los 4 usuarios (por ejemplo, si se filtraron). Después
  hay que volver a correr `gh secret set -f`.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
