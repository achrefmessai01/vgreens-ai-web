// Session-cookie auth. The browser holds no token — authentication is the
// HttpOnly `vg_session` cookie set by the API on login. On a 401 we bounce the
// user back to the login screen by reloading (App re-checks /auth/me).
export function handleAuthLost(): void {
  window.location.reload();
}

export interface AuthUser {
  username: string;
  role: "viewer" | "operator" | "admin" | string;
  via?: string;
}

const RANK: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

export function roleAtLeast(role: string | undefined, minimum: string): boolean {
  return (RANK[role ?? ""] ?? -1) >= (RANK[minimum] ?? 99);
}
