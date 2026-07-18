import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { defineConfig } from "vite";

const PANEL_SRC = path.resolve(import.meta.dirname, "../takipci-paneli/src");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      // Point @ to the panel's src so extension pages can import pages/components directly
      "@": PANEL_SRC,
      "@assets": path.resolve(import.meta.dirname, "../../attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist/shared",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Full-page panel (replaces the old popup as the primary UI)
        panel: resolve(import.meta.dirname, "panel.html"),
        // Keep popup build so the file exists (manifest no longer references it)
        popup: resolve(import.meta.dirname, "src/popup/index.html"),
        background: resolve(import.meta.dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
