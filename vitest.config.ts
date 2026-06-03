import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // The shuffle logic is pure — node is enough. Switch to "jsdom" when we
    // start testing components.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Mirror the tsconfig `@/*` path alias so tests can import app modules the
    // same way the app does (e.g. `@/lib/spotify`).
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
