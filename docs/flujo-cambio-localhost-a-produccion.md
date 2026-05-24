# Flujo completo: de localhost a producción

Este documento explica en detalle qué le pasa a un cambio de código desde que se escribe en la máquina local hasta que llega a los usuarios en `app.belopia.app`.

---

## Vista general

```
Máquina local
    └─► GitHub (feature branch)
            └─► CI (GitHub Actions)
                    └─► PR a develop
                            └─► Vercel build → dev.belopia.app
                                    └─► PR a main
                                            └─► Vercel build → app.belopia.app
```

---

## Capa 1 — Desarrollo local (localhost)

### Qué pasa aquí

El desarrollador crea una rama desde `develop` y trabaja localmente:

```bash
git checkout develop
git pull origin develop
git checkout -b feat/mi-nueva-feature
```

Levanta el servidor de desarrollo de Expo:

```bash
npx expo start --web
# Servidor corriendo en http://localhost:8081
```

### Cómo funciona Expo en modo dev

- Expo lanza un servidor Metro bundler en `localhost:8081`
- Sirve el JS en tiempo real con hot reload (cambios se ven al instante sin recargar)
- Las variables `EXPO_PUBLIC_*` se leen desde `.env.local` (o los defaults en `config.ts`)
- En modo dev, el código NO está minificado — los errores muestran stack traces legibles

### Qué servicios usa en local

| Servicio | URL |
|---|---|
| Frontend | http://localhost:8081 |
| Backend | https://klaro-backend-production-8383.up.railway.app (Railway DEV) |
| Keycloak | http://62.171.160.238:8095/realms/klaro-dev |

### Ciclo de un cambio en local

1. El desarrollador edita un archivo `.tsx`
2. Metro detecta el cambio y re-transpila solo ese módulo (tree-shaking parcial)
3. El browser recibe el módulo actualizado via WebSocket (Fast Refresh)
4. React reemplaza el componente sin perder el estado de la app

---

## Capa 2 — Control de versiones (GitHub)

### Push del cambio

```bash
git add .
git commit -m "feat: mi nueva feature"
git push origin feat/mi-nueva-feature
```

### Qué pasa en GitHub

- GitHub recibe el branch y los commits
- Si hay un PR abierto, GitHub notifica a los servicios conectados (Vercel, GitHub Actions)
- GitHub guarda el historial permanente del cambio

### Apertura del Pull Request

El desarrollador abre un PR en GitHub:
- **Base:** `develop`
- **Compare:** `feat/mi-nueva-feature`

En cuanto se abre el PR, se disparan dos cosas en paralelo:
1. **GitHub Actions** (CI) — verifica que el código compila
2. **Vercel** — crea un deploy de preview del PR

---

## Capa 3 — CI (GitHub Actions)

### Qué es y para qué sirve

CI son las siglas de Continuous Integration. GitHub Actions ejecuta automáticamente un conjunto de verificaciones cada vez que se abre o actualiza un PR. Si alguna falla, el merge queda bloqueado.

### Archivo de configuración

`.github/workflows/ci.yml`

### Qué hace el CI (en orden)

```
1. Checkout del código
2. Setup Node.js
3. npm install (instala dependencias)
4. npx tsc --noEmit (TypeScript check — verifica tipos sin generar archivos)
5. npx expo export --platform web (build completo de la app)
```

### Por qué cada paso importa

**TypeScript check (`tsc --noEmit`):**
- Verifica que no haya errores de tipos en todo el proyecto
- Detecta problemas como pasar `string` donde se espera `number`, llamar funciones que no existen, etc.
- Si falla: el merge está bloqueado

**Expo build (`expo export --platform web`):**
- Simula exactamente lo que Vercel haría en producción
- Si algo importa mal, tiene una dependencia rota, o hay un error de sintaxis → falla aquí
- Si falla: el merge está bloqueado

### Duración típica

~2-3 minutos. Si pasa, aparece ✅ en el PR. Si falla, aparece ❌ con el log del error.

---

## Capa 4 — Preview Deploy (Vercel)

### Qué pasa automáticamente

Cuando se abre un PR en GitHub, Vercel detecta el branch nuevo y hace un build de preview automático. No requiere ninguna acción manual.

### URL del preview

```
https://klaro-frontend-[hash]-adrians-projects-ad49b42b.vercel.app
```

Cada PR tiene su propia URL única. Útil para que otro miembro del equipo revise los cambios visualmente antes de aprobar el PR.

### Qué variables de entorno usa el preview

Por defecto Vercel usa las variables del ambiente **Preview** (configuradas en Vercel → Environment Variables). En este proyecto apuntan al backend y Keycloak de DEV.

### Importante: las variables se inyectan en BUILD TIME

Este es un punto crítico para entender. Expo compila el frontend como una **app estática** (HTML + JS + CSS). Al momento del build:

```
EXPO_PUBLIC_API_URL = "https://klaro-backend-..."
```

Se convierte en el bundle JS como una constante literal:

```javascript
// En el bundle compilado:
const API_BASE = "https://klaro-backend-..."; // hardcodeado
```

**Consecuencia:** Si cambias una variable de entorno en Vercel después del build, el usuario sigue viendo la versión anterior hasta que se haga un nuevo deploy. No existe "runtime config" en este stack — todo es build time.

---

## Capa 5 — Merge a develop → dev.belopia.app

### Qué pasa al mergear el PR

1. GitHub fusiona los commits del feature branch en `develop`
2. `develop` tiene un nuevo commit (el merge commit)
3. Vercel detecta el push a `develop` (está conectado al repo via webhook de GitHub)
4. Vercel inicia un nuevo build automáticamente

### El proceso de build de Vercel

```
1. Pull del código desde GitHub (rama develop)
2. Inyecta variables de entorno del ambiente Preview
3. npm install
4. npx expo export --platform web
   └─► Genera: dist/
         ├── index.html
         ├── _expo/static/js/web/entry-[hash].js  (bundle principal)
         └── _expo/static/js/web/[chunks].js       (code splitting)
5. Sube los archivos a la CDN global de Vercel
6. Asigna el dominio dev.belopia.app a este deploy
```

### Qué es la CDN de Vercel

Vercel no sirve los archivos desde un solo servidor. Los replica en ~100 ubicaciones ("edge nodes") alrededor del mundo. Cuando un usuario en Argentina abre `dev.belopia.app`, Vercel le sirve los archivos desde el nodo más cercano (probablemente São Paulo), no desde EE.UU.

### SPA routing (vercel.json)

La app es una SPA (Single Page Application). Todas las rutas (`/login`, `/admin`, etc.) deben devolver el mismo `index.html` — el router de Expo/React maneja la navegación en el browser.

Sin configuración especial, si el usuario escribe `dev.belopia.app/admin` directamente en el browser, el servidor buscaría un archivo `/admin/index.html` que no existe → 404.

El archivo `vercel.json` le dice a Vercel que redirija todo al `index.html`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## Capa 6 — PR a main → app.belopia.app (Producción)

### Cuándo se hace

Cuando el equipo está satisfecho con los cambios en `dev.belopia.app`, se abre un PR de `develop` → `main`.

### Qué pasa

Exactamente lo mismo que el merge a develop, pero:
- Vercel usa las variables del ambiente **Production** (Keycloak PROD, backend PROD)
- El deploy va a `app.belopia.app` (y al fallback `klaro-frontend-two.vercel.app`)
- El CI corre de nuevo (TypeScript + build)

### Vercel Instant Rollback

Si el deploy de producción tiene un problema, Vercel permite volver al deploy anterior con un click en "Instant Rollback" — sin necesidad de revertir el código.

---

## Capa 7 — El usuario abre app.belopia.app

### Request del navegador

```
Usuario escribe: https://app.belopia.app

1. DNS lookup: app.belopia.app
   └─► Cloudflare resuelve CNAME → f51dc4987b3be627.vercel-dns-017.com
   └─► Vercel CDN recibe la request

2. Vercel sirve: index.html + bundle JS (desde edge node más cercano)

3. Browser descarga y ejecuta el JS
   └─► React hidrata la app (conecta el JS con el HTML pre-renderizado)
   └─► Expo Router inicializa el sistema de rutas

4. AuthProvider arranca
   └─► Lee sessionStorage: ¿hay tokens guardados?
       ├── Sí → valida si están vigentes → restaura sesión → redirige al dashboard
       └─► No → muestra la pantalla de login
```

### El usuario hace login

```
Usuario ingresa: root.admin / KlaroRoot2026!
Click en "Iniciar sesión"

1. Frontend hace POST a:
   https://keycloak.belopia.app/realms/klaro-prod/protocol/openid-connect/token

   Body (URL-encoded):
   grant_type=password
   username=root.admin
   password=KlaroRoot2026!
   client_id=klaro-frontend

2. El request viaja:
   Frontend → Cloudflare (DNS only, no proxy) → Nginx (servidor Nilo) → Keycloak (Docker, puerto 8095)

3. Keycloak valida credenciales contra su base de datos interna
   └─► Genera JWT (access_token + refresh_token)
   
   El access_token contiene (decodificado):
   {
     "sub": "uuid-del-usuario",
     "preferred_username": "root.admin",
     "realm_access": { "roles": ["root", "offline_access", ...] },
     "tenant_id": 1,
     "exp": 1779582056
   }

4. Frontend recibe el JWT
   └─► jwtDecode() extrae roles y tenant_id
   └─► Guarda tokens en sessionStorage
   └─► Configura axios: Authorization: Bearer [token]
   └─► Detecta rol: root → isPrivileged = true
   └─► Router redirige a /admin

5. AdminDashboard carga
   └─► Hace requests al backend:
       GET https://klaro-backend-prod-production.up.railway.app/api/v2/...
       Authorization: Bearer [access_token]
   
   └─► Backend (Spring Boot en Railway):
       ├── Valida el JWT: descarga la clave pública de Keycloak y verifica la firma
       ├── Extrae tenant_id del claim → filtra datos por tenant
       └─► Devuelve solo los datos del tenant del usuario
```

### Ciclo de vida del token

```
Login exitoso → access_token (5 min de vida) + refresh_token (24h)

scheduleRefresh() programa un setTimeout 60 segundos antes de que expire el access_token.
Cuando se dispara:
  POST /token con grant_type=refresh_token
  → Keycloak devuelve nuevos tokens
  → Se guardan en sessionStorage
  → El usuario nunca ve una pantalla de "sesión expirada"

Si el refresh falla (refresh_token también expiró):
  → logout() limpia sessionStorage
  → Router redirige a /login
```

---

## Diagrama completo

```
DESARROLLO
──────────
[Código en local]
    │  npx expo start --web (Metro bundler, hot reload)
    │  Usa: localhost:8081, Keycloak klaro-dev, Railway DEV
    ↓
[git push → GitHub]
    │
    ├─► GitHub Actions CI
    │       TypeScript check (tsc --noEmit)
    │       Expo web build (expo export --platform web)
    │       ✅ pasa → PR se puede mergear
    │       ❌ falla → merge bloqueado
    │
    └─► Vercel Preview Deploy (URL temporal por PR)
            Variables: ambiente Preview (DEV)

INTEGRACIÓN
───────────
[Merge PR → develop]
    │
    └─► Vercel Build
            Pull código de GitHub
            Inyecta env vars Preview
            npm install
            expo export --platform web
            → dist/ (HTML + JS chunks)
            Sube a CDN global
            └─► dev.belopia.app activo
                DNS: Cloudflare CNAME → Vercel CDN

PRODUCCIÓN
──────────
[Merge PR develop → main]
    │
    └─► Vercel Build (mismo proceso, env vars Production)
            └─► app.belopia.app activo
                DNS: Cloudflare CNAME → Vercel CDN

RUNTIME (usuario final)
───────────────────────
[Usuario abre app.belopia.app]
    │
    ├─► Cloudflare DNS → Vercel CDN → sirve index.html + bundle JS
    │
    ├─► React hidrata → AuthProvider revisa sessionStorage
    │
    ├─► [No hay sesión] → Login form
    │       POST /token → Nginx → Keycloak klaro-prod
    │       JWT → sessionStorage → Router → /admin o /
    │
    └─► Dashboard carga → axios (con Bearer token) → Railway PROD backend
            Backend valida JWT (firma Keycloak) → filtra por tenant_id → datos
```

---

## Resumen de responsabilidades

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Desarrollo | Expo / Metro | Hot reload, transpilación TypeScript → JS |
| CI | GitHub Actions | Verificar que el código compila y los tipos son correctos |
| Preview | Vercel | Deploy automático por PR para revisión visual |
| Build | Vercel + expo export | Compilar la app en archivos estáticos optimizados |
| Distribución | Vercel CDN | Servir los archivos desde el edge más cercano al usuario |
| DNS | Cloudflare | Resolver el dominio belopia.app → Vercel |
| Auth | Keycloak | Emitir y validar JWTs, gestionar usuarios y roles |
| API | Railway (Spring Boot) | Lógica de negocio, multi-tenancy, base de datos |
| Datos | NeonDB (PostgreSQL) | Persistencia, aislamiento por tenant |
| Archivos | Cloudflare R2 | Almacenamiento de imágenes y documentos |
