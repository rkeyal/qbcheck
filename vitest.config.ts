import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // Source uses .js extensions in imports for bundler module resolution;
      // redirect them to .ts files so vitest can resolve them.
    },
    conditions: ["import", "module", "browser", "default"],
  },
});
