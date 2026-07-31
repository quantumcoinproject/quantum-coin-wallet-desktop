import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Renderer build. Verbatim legacy assets (styles.css, fonts, svg, json) live in
// public/ and are copied byte-for-byte; only TypeScript in src/ is bundled.
export default defineConfig({
  base: "./",
  publicDir: "public",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        instance: resolve(__dirname, "instance.html"),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
