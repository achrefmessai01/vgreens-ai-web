import { createContext, useContext } from "react";
import type { AuthUser } from "./auth";

export const AuthContext = createContext<{
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
}>({ user: null, setUser: () => {} });

export const useAuth = () => useContext(AuthContext);
