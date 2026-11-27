import "@telefonica/mistica/css/mistica.css";
import "./fonts.css";
import { getTelefonicaSkin, skinVars, ThemeContextProvider } from "@telefonica/mistica";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

export type ColorScheme = "dark" | "light";

const COLOR_SCHEME_KEY = "mi-portero.colorScheme";
const loadColorScheme = (): ColorScheme => {
  try {
    return localStorage.getItem(COLOR_SCHEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

const skin = getTelefonicaSkin();

// Font family must match the skin: Telefónica skin → 'Telefonica Sans' (@font-face rules in fonts.css).
const GlobalStyles = ({ colorScheme }: { colorScheme: ColorScheme }) => (
  <style>{`
    :root {
      color-scheme: ${colorScheme};
    }
    body {
      margin: 0;
      font-family: 'Telefonica Sans', 'Helvetica', 'Arial', sans-serif;
      background-color: ${skinVars.colors.background};
      color: ${skinVars.colors.textPrimary};
    }
  `}</style>
);

function Root() {
  const [colorScheme, setColorScheme] = React.useState<ColorScheme>(loadColorScheme);

  React.useEffect(() => {
    try {
      localStorage.setItem(COLOR_SCHEME_KEY, colorScheme);
    } catch {
      // Storage unavailable (private window): choice just lasts for this page load.
    }
  }, [colorScheme]);

  const theme = React.useMemo(
    () => ({
      skin,
      colorScheme,
      i18n: { locale: "es-ES" as const, phoneNumberFormattingRegionCode: "ES" as const },
    }),
    [colorScheme]
  );

  const toggleColorScheme = React.useCallback(() => {
    setColorScheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContextProvider theme={theme}>
      <GlobalStyles colorScheme={colorScheme} />
      <ErrorBoundary fullScreen>
        <App colorScheme={colorScheme} onToggleColorScheme={toggleColorScheme} />
      </ErrorBoundary>
    </ThemeContextProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
