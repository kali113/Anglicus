const DEFAULT_BACKEND_URL = "https://anglicus-api.anglicus-api.workers.dev";

export { DEFAULT_BACKEND_URL };

export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL
).replace(/\/$/, "");
