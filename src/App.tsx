import { useState, useEffect } from "react";
import { NavigationRail, type TabId } from "./components/NavigationRail";
import { Library } from "./pages/Library";
import { Clouds } from "./pages/Clouds";
import { Settings } from "./pages/Settings";
import { Onboarding } from "./pages/Onboarding";
import { LiveSyncNotifier } from "./components/LiveSyncNotifier";
import { useSettings } from "./state/settings";
import { api } from "./lib/tauri";

export function App() {
  const { settings, update } = useSettings();
  const [activeTab, setActiveTab] = useState<TabId>("library");

  useEffect(() => {
    // Reveal window once React tree has mounted and theme is initialized
    api.showWindow().catch(() => undefined);
  }, []);

  if (!settings.onboardingDone) {
    return <Onboarding onFinish={() => update({ onboardingDone: true })} />;
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "var(--md-sys-color-background)",
        padding: "14px",
        gap: "14px",
        boxSizing: "border-box",
      }}
    >
      <NavigationRail activeTab={activeTab} onTabChange={setActiveTab} />
      <main
        style={{
          flex: 1,
          height: "100%",
          borderRadius: 28,
          overflow: "hidden",
          display: "flex",
          position: "relative",
          background: "var(--md-sys-color-surface)",
          border: "1px solid var(--md-sys-color-outline-variant)",
          boxShadow: "0 4px 24px var(--md-sys-color-shadow)",
          boxSizing: "border-box",
        }}
      >
        {activeTab === "library" && <Library onNavigateTab={setActiveTab} />}
        {activeTab === "clouds" && <Clouds />}
        {activeTab === "settings" && <Settings />}
      </main>
      <LiveSyncNotifier />
    </div>
  );
}
