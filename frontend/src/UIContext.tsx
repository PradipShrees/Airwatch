import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark";

interface UIState {
  theme: Theme;
  toggleTheme: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}

const UICtx = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const s = localStorage.getItem("theme");
    return s === "light" ? "light" : "dark";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Close sidebar when navigating on mobile
  useEffect(() => {
    function onResize() { if (window.innerWidth > 900) setSidebarOpen(false); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <UICtx.Provider value={{
      theme,
      toggleTheme: () => setTheme(t => t === "dark" ? "light" : "dark"),
      sidebarOpen,
      setSidebarOpen,
    }}>
      {children}
    </UICtx.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UICtx);
  if (!ctx) throw new Error("useUI must be inside UIProvider");
  return ctx;
}
