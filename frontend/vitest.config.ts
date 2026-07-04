import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "mock-svg",
      transform(_code, id) {
        if (id.endsWith(".svg")) {
          return 'export default "mocked-svg";';
        }
      },
      enforce: "pre",
    },
  ],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
