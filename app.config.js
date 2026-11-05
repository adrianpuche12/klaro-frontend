// Extiende app.json (que sigue siendo la configuración base) con la versión para Sentry:
// el commit que se está construyendo. Vercel expone VERCEL_GIT_COMMIT_SHA en el build y GitHub
// Actions GITHUB_SHA; en local queda "local". Lo lee app/_layout.tsx vía expo-constants.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local',
  },
});
