import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * The console shell reads client storage in its auth guard, so server-rendering
 * it would only ever bounce to `/login` — mark it client-only. The public auth
 * screens are safe to server-render.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'login', renderMode: RenderMode.Server },
  { path: 'login/verify', renderMode: RenderMode.Server },
  { path: 'forgot-password', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Client },
];
