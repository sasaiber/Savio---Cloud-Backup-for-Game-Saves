import React from "react";
import ReactDOM from "react-dom/client";
import { api, type BootstrapInfo } from "./lib/tauri";
import { SettingsProvider, useSettings } from "./state/settings";
import { I18nProvider } from "./i18n/I18nProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import { App } from "./App";
import "./theme/theme.css";

function RootContent() {
  const { settings } = useSettings();

  return (
    <I18nProvider lang={settings.language}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>
  );
}

async function bootstrapAndMount() {
  const boot: BootstrapInfo = await api.bootstrap();

  const container = document.getElementById("root");
  if (!container) throw new Error("Root element not found");

  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <SettingsProvider boot={boot}>
        <RootContent />
      </SettingsProvider>
    </React.StrictMode>
  );
}

bootstrapAndMount().catch((err) => {
  console.error("Critical error during app startup:", err);
});
