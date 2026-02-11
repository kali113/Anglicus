import { isBrowser } from "$lib/storage/base-store.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8787";
const TOKEN_KEY = "anglicus_auth_token";

export function getToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (!isBrowser()) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(TOKEN_KEY);
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => null);
  return data?.error?.message || fallback;
}

export async function registerUser(email: string, password: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      "No se pudo registrar el usuario",
    );
    throw new Error(message);
  }
}

export async function verifyUser(email: string, code: string): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      "No se pudo verificar el usuario",
    );
    throw new Error(message);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("Respuesta de verificacion invalida");
  }

  return data.token;
}

export async function loginUser(email: string, password: string): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      "No se pudo iniciar sesion",
    );
    throw new Error(message);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("Respuesta de inicio invalida");
  }

  return data.token;
}

export async function refreshToken(): Promise<string> {
  const token = getToken();
  if (!token) {
    throw new Error("No auth token");
  }

  const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      "No se pudo refrescar el token",
    );
    throw new Error(message);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("Respuesta de refresco invalida");
  }

  return data.token;
}

export async function enableByok(
  apiKey: string,
  baseUrl?: string,
): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new Error("No auth token");
  }

  const response = await fetch(`${BACKEND_URL}/auth/byok`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiKey,
      baseUrl: baseUrl?.trim() || undefined,
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      "No se pudo validar la API key",
    );
    throw new Error(message);
  }
}
