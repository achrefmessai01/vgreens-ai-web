// Token-based auth for the MVP. The API only supports static bearer tokens
// today, so we store the token locally and send it as Authorization: Bearer.
// Real users/sessions/roles arrive in Milestone 4 (production access); the API
// stays the security boundary — this is only a convenience for the browser.
const KEY = "vgreens_ai_token";

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token.trim());
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}

export function isAuthed(): boolean {
  return !!getToken();
}

// Called when the API rejects the token mid-session. Clearing + reloading sends
// the user back to the login screen (App re-reads isAuthed on mount).
export function handleAuthLost(): void {
  clearToken();
  window.location.reload();
}
