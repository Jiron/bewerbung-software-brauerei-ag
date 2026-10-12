import { defineConfig } from "vite";

/**
 * Bundles the MCP server into one executable file. Local code (including the
 * shared API types and SSE parser from the main app) is inlined; npm
 * dependencies stay external and are installed by npx.
 */
export default defineConfig({
  root: import.meta.dirname,
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    emptyOutDir: true,
    target: "node20",
    rolldownOptions: {
      output: {
        entryFileNames: "index.js",
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
