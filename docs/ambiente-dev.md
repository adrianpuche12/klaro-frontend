# Ambiente DEV — Belopia Frontend

## Descripción

El ambiente de desarrollo es donde se integran los cambios antes de llegar a producción. Tiene su propia instancia de Keycloak (realm `klaro-dev`) y su propio servicio de backend en Railway.

---

## URLs

| Servicio | URL |
|---|---|
| Frontend (Vercel Preview) | https://dev.belopia.app |
| Backend (Railway DEV) | https://klaro-backend-production-8383.up.railway.app |
| Keycloak realm DEV | http://62.171.160.238:8095/realms/klaro-dev |
| Keycloak Admin UI | http://62.171.160.238:8095 |

---

## Rama de Git

```
develop
```

Vercel despliega automáticamente en `dev.belopia.app` cada vez que se hace merge a `develop`.

---

## Variables de entorno (Vercel — Preview Environment)

Estas variables se inyectan en tiempo de build. Son constantes en el bundle JS — no se pueden cambiar en runtime.

| Variable | Valor |
|---|---|
| `EXPO_PUBLIC_KEYCLOAK_URL` | `http://62.171.160.238:8095` |
| `EXPO_PUBLIC_KEYCLOAK_REALM` | `klaro-dev` |
| `EXPO_PUBLIC_API_URL` | `https://klaro-backend-production-8383.up.railway.app` |

---

## Keycloak — Realm `klaro-dev`

- **URL:** `http://62.171.160.238:8095/realms/klaro-dev`
- **Cliente frontend:** `klaro-frontend` (público, sin client_secret)
- **Roles disponibles:** `root`, `admin`, `user`
- **Protocol Mapper:** `tenant_id` (claim en el JWT)

---

## Ejecución local (localhost)

Para correr el frontend apuntando al ambiente DEV:

```bash
# 1. Clonar e instalar
git clone https://github.com/adrianpuche12/klaro-frontend.git
cd klaro-frontend
npm install

# 2. Crear archivo de entorno local
cp .env.example .env.local
# Editar .env.local con los valores DEV (ya son los valores por defecto en config.ts)

# 3. Levantar
npx expo start --web
```

El servidor corre en `http://localhost:8081`.

---

## Flujo de trabajo en DEV

```
localhost (feat/branch)
    → push a GitHub
    → CI: TypeScript check + Expo build
    → PR a develop
    → merge
    → Vercel build automático
    → deploy en dev.belopia.app
```

---

## Base de datos

- **NeonDB** — branch `dev` (São Paulo, sa-east-1)
- Separada de producción. Datos de prueba, no reales.

---

## Notas importantes

- Los cambios en DEV **nunca van directo a producción** — deben pasar por un PR a `main`.
- El CI debe pasar (TypeScript + build) antes de poder mergear.
- Las env vars se inyectan en **build time** — si las cambias en Vercel, se requiere un redeploy.
