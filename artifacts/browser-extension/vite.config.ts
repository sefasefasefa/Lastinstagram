import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { defineConfig } from "vite";

const EXT_SRC = path.resolve(import.meta.dirname, "src");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      // @ resolves to the extension's own src directory
      "@": EXT_SRC,
      "@assets": path.resolve(import.meta.dirname, "../../attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist/shared",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Full-page panel (primary UI)
        panel: resolve(import.meta.dirname, "panel.html"),
        // Popup shown when the toolbar icon is clicked
        popup: resolve(import.meta.dirname, "popup.html"),
        // Background service worker
        background: resolve(import.meta.dirname, "src/background.ts"),
        // Content script — instagram.com sekmelerinde çalışır, API proxy görevi görür
        "content-script": resolve(import.meta.dirname, "src/content-script.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
