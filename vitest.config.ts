import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The shuffle logic is pure — node is enough. Switch to "jsdom" when we
    // start testing components.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
