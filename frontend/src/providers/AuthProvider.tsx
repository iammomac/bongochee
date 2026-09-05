import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AuthContext } from "../hooks/useAuth";
import { useIdleLogout } from "../hooks/useIdleLogout";
import { api } from "../services/api";
import type { User } from "../types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get<User>("/auth/me/")
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string, captchaToken?: string) => {
    const res = await api.post<User>("/auth/login/", { username, password, captchaToken });
    setUser(res.data);
  };

  const logout = async () => {
    await api.post("/auth/logout/");
    setUser(null);
  };

  const handleIdle = useCallback(() => {
    void logout();
  }, []);
  useIdleLogout(Boolean(user), handleIdle);

  const changePassword = async (newPassword: string) => {
    const res = await api.post<User>("/auth/change-password/", { newPassword });
    setUser(res.data);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
