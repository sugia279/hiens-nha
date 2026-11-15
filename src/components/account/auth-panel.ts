// Vite removes the unused backend module from the default Pages build.
if (import.meta.env.PUBLIC_BACKEND_ENABLED === 'true') {
  void import('./auth-enabled');
}
