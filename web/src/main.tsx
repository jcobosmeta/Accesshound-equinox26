import "@telefonica/mistica/css/mistica.css";
import "./fonts.css";
import { getTelefonicaSkin, skinVars, ThemeContextProvider } from "@telefonica/mistica";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const theme = {
  skin: getTelefonicaSkin(),
  colorScheme: "dark" as const,
  i18n: { locale: "es-ES" as const, phoneNumberFormattingRegionCode: "ES" as const },
};

// Font family must match the skin: Telefónica skin → 'Telefonica Sans' (@font-face rules in fonts.css).
const GlobalStyles = () => (
  <style>{`
    :root {
      color-scheme: dark;
    }
    body {
      margin: 0;
      font-family: 'Telefonica Sans', 'Helvetica', 'Arial', sans-serif;
      background-color: ${skinVars.colors.background};
      color: ${skinVars.colors.textPrimary};
    }
  `}</style>
);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeContextProvider theme={theme}>
      <GlobalStyles />
      <ErrorBoundary fullScreen>
        <App />
      </ErrorBoundary>
    </ThemeContextProvider>
  </React.StrictMode>
);
