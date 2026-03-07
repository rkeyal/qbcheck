import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync } from "fs";

export default defineConfig({
  base: "./",
  root: "src/popup",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/popup/popup.html"),
      output: {
        entryFileNames: "popup.js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  plugins: [
    {
      name: "copy-static",
      closeBundle() {
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(__dirname, "dist/manifest.json")
        );
        copyFileSync(
          resolve(__dirname, "THIRD_PARTY_NOTICES"),
          resolve(__dirname, "dist/THIRD_PARTY_NOTICES")
        );
      },
    },
  ],
});
