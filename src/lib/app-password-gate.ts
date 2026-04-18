/** Chave no localStorage após senha do app validada (valor não é a senha). */
export const APP_AUTH_STORAGE_KEY = "app_auth";

const APP_AUTH_MARKER = "1";

export function getConfiguredAppPassword(): string {
  return process.env.NEXT_PUBLIC_APP_PASSWORD?.trim() ?? "";
}

export function isAppPasswordGateEnabled(): boolean {
  return getConfiguredAppPassword().length > 0;
}

export function readAppPasswordAuthed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(APP_AUTH_STORAGE_KEY) === APP_AUTH_MARKER;
  } catch {
    return false;
  }
}

export function writeAppPasswordAuthed(): void {
  try {
    localStorage.setItem(APP_AUTH_STORAGE_KEY, APP_AUTH_MARKER);
  } catch {
    /* ignore */
  }
}

export function clearAppPasswordAuthed(): void {
  try {
    localStorage.removeItem(APP_AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
