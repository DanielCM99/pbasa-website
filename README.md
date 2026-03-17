# PBASA Website

Sitio web de Palm Beach Academy of Sports and Arts construido con Astro y Tailwind.

## Requisitos

- Node.js 20
- npm

## Desarrollo local

```bash
npm install
npm run dev
```

## Build local

```bash
npm run build
```

El sitio genera archivos estaticos en `dist/`.

## Deploy en Netlify

Este proyecto ya incluye la configuracion necesaria en `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: `20`

### Opcion 1: Netlify desde el dashboard

1. Entra a Netlify y elige `Add new site` > `Import an existing project`.
2. Conecta GitHub y selecciona el repositorio `DanielCM99/pbasa-website`.
3. Confirma estas opciones:
   - Branch to deploy: `master`
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Haz clic en `Deploy site`.

### Opcion 2: Netlify CLI

```bash
npx netlify login
npx netlify link --git-remote-url https://github.com/DanielCM99/pbasa-website.git
npx netlify deploy
npx netlify deploy --prod
```

Notas:

- `npx netlify deploy` crea un preview deploy.
- `npx netlify deploy --prod` publica a produccion.
- Si Netlify pide crear el sitio porque no existe todavia, usa `npx netlify init`.

## Git

Para actualizar tu copia local con lo ultimo del repositorio:

```bash
git pull origin master
```
