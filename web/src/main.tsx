import "@telefonica/mistica/css/mistica.css";
import { getTelefonicaSkin, skinVars, ThemeContextProvider } from "@telefonica/mistica";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const theme = {
  skin: getTelefonicaSkin(),
  colorScheme: "light" as const,
  i18n: { locale: "en-US" as const, phoneNumberFormattingRegionCode: "ES" as const },
};

// Telefónica Sans isn't bundled, so fall back to the platform's UI sans-serif.
const GlobalStyles = () => (
  <style>{`
    body {
      margin: 0;
      font-family: 'Telefonica Sans', 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: ${skinVars.colors.background};
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
