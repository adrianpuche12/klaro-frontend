# Etapa 1: Build
FROM node:18-alpine AS build
WORKDIR /app

# Copia los archivos de dependencias e instala TODO (expo/metro/babel están en devDependencies,
# hacen falta para el build aunque no para runtime)
COPY package.json package-lock.json ./
RUN npm ci

# Copia el resto del código fuente
COPY . .

# Variables EXPO_PUBLIC_* — Expo las inlinea en el bundle en tiempo de build, no de runtime.
# Se reciben como build-args desde el workflow de CI/CD (distintas por ambiente prod/dev).
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_KEYCLOAK_URL
ARG EXPO_PUBLIC_KEYCLOAK_REALM
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_KEYCLOAK_URL=$EXPO_PUBLIC_KEYCLOAK_URL
ENV EXPO_PUBLIC_KEYCLOAK_REALM=$EXPO_PUBLIC_KEYCLOAK_REALM

# Construye la aplicación (export web estático)
RUN npx expo export --platform web

# Etapa 2: Producción con Nginx
FROM nginx:alpine

# Copia los archivos de la aplicación compilada
COPY --from=build /app/dist /usr/share/nginx/html

# Copia la configuración de Nginx (corrige la ruta a tu archivo local)
COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf

# Expone el puerto 80
EXPOSE 80

# Inicia Nginx en primer plano
CMD ["nginx", "-g", "daemon off;"]