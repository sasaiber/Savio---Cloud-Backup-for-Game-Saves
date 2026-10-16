import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite settings tuned for Tauri: fixed port, no screen clearing,
// and the Rust folder is ignored by the file watcher.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // WebView2 on Windows 11 is a modern Chromium, so we can ship modern JS (smaller bundle).
    target: "chrome120",
    cssTarget: "chrome120",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
