# Ambiente PROD — Belopia Frontend

## Descripción

El ambiente de producción sirve a los usuarios finales. Tiene su propio realm de Keycloak (`klaro-prod`) con HTTPS, su propio servicio de backend en Railway, y el dominio oficial `app.belopia.app`.

---

## URLs

| Servicio | URL |
|---|---|
| Frontend (Vercel Production) | https://app.belopia.app |
| Frontend (fallback Vercel) | https://klaro-frontend-two.vercel.app |
| Backend (Railway PROD) | https://klaro-backend-prod-production.up.railway.app |
| Keycloak realm PROD | https://keycloak.belopia.app/realms/klaro-prod |
| Keycloak Admin UI | https://keycloak.belopia.app |

---

## Rama de Git

```
main
```

Vercel despliega automáticamente en `app.belopia.app` cada vez que se hace merge a `main`.

---

## Variables de entorno (Vercel — Production Environment)

| Variable | Valor |
|---|---|
| `EXPO_PUBLIC_KEYCLOAK_URL` | `https://keycloak.belopia.app` |
| `EXPO_PUBLIC_KEYCLOAK_REALM` | `klaro-prod` |
| `EXPO_PUBLIC_API_URL` | `https://klaro-backend-prod-production.up.railway.app` |

> **Importante:** Estas variables se inyectan en tiempo de build como constantes en el bundle JS. No son accesibles ni modificables en runtime. Cualquier cambio requiere un redeploy.

---

## DNS (Cloudflare)

| Tipo | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `app` | `f51dc4987b3be627.vercel-dns-017.com` | DNS only (desactivado) |
| CNAME | `dev` | `f51dc4987b3be627.vercel-dns-017.com` | DNS only (desactivado) |
| A | `keycloak` | `62.171.160.238` | DNS only (desactivado) |

> El proxy de Cloudflare debe estar **desactivado** en todos los registros que apuntan a Vercel o Keycloak — ambos manejan su propio SSL/CDN.

---

## Keycloak — Realm `klaro-prod`

- **URL:** `https://keycloak.belopia.app/realms/klaro-prod`
- **Servidor:** `62.171.160.238` (servidor Nilo) — Nginx hace reverse proxy al contenedor Docker en puerto 8095
- **Cliente frontend:** `klaro-frontend` (público, sin client_secret)
- **Roles:** `root`, `admin`, `user`
- **Protocol Mapper:** `tenant_id` → claim en el JWT (tipo long)
- **Usuario ROOT inicial:** `root.admin`

### Configuración del contenedor Keycloak

```bash
docker run -d --name geronimo_keycloak --network geronimo_default \
  --restart unless-stopped -p 8095:8080 \
  -v geronimo_keycloak_data:/opt/keycloak/data \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD='GeronimoAdmin2024!' \
  -e KC_HTTP_ENABLED=true \
  -e KC_HOSTNAME_STRICT=false \
  -e KC_PROXY=edge \
  quay.io/keycloak/keycloak:23.0 start-dev
```

> `KC_PROXY=edge` es obligatorio — permite que Keycloak respete los headers `X-Forwarded-*` de Nginx y genere URLs HTTPS correctas en el Admin UI.

---

## Backend (Railway PROD)

- **Proyecto Railway:** `heroic-enjoyment`
- **Servicio:** `klaro-backend-prod`
- **URL:** `https://klaro-backend-prod-production.up.railway.app`
- **Base de datos:** NeonDB branch `production` (São Paulo, sa-east-1)
- **Almacenamiento:** Cloudflare R2 bucket `klaro-storage`

---

## Base de datos

- **NeonDB** — branch `production` (São Paulo, sa-east-1)
- Datos reales de clientes. **No usar para pruebas.**

---

## Usuarios del sistema (PROD)

| Usuario | Rol | Descripción |
|---|---|---|
| `root.admin` | root | Super administrador del sistema |

---

## Notas de seguridad

- Las credenciales de producción están en el archivo `🔐 CREDENCIALES KLARO.md` en Obsidian (acceso restringido).
- **Nunca** commitear credenciales al repositorio.
- **Nunca** hacer push directo a `main` — siempre via PR con CI aprobado.
- El cliente Keycloak `klaro-frontend` es **público** (sin secret) — es intencional para apps mobile/web.
