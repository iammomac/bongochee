import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  withCredentials: true,
});

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

api.interceptors.request.use((config) => {
  if (["post", "put", "patch", "delete"].includes(config.method ?? "")) {
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) config.headers["X-CSRFToken"] = csrfToken;
  }
  return config;
});

let refreshPromise: Promise<unknown> | null = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api.post("/auth/refresh/").finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const isRefreshCall =
      typeof error.config?.url === "string" &&
      error.config.url.includes("/auth/refresh");
    const isAuthBootstrapCall =
      typeof error.config?.url === "string" &&
      error.config.url.includes("/auth/me");
    if (
      error.response?.status === 401 &&
      !error.config._retry &&
      !isRefreshCall &&
      !isAuthBootstrapCall
    ) {
      error.config._retry = true;
      try {
        await refreshAccessToken();
        return api(error.config);
      } catch {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
