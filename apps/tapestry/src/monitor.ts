export function reportError(error: unknown, where: string, extra: Record<string, unknown> = {}) {
  console.error(`[tapestry] ${where}`, error, extra); // wired to Sentry/GlitchTip the same way as earshelf when VITE_SENTRY_DSN is set
}
