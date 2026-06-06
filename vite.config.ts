import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  plugins: [
    ...tanstackStart({
      server: {
        entry: "server",
      },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    ...(command === "build" ? cloudflare() : []),
  ],
  resolve: {
    dedupe: ["@tanstack/react-router", "@tanstack/react-start", "react", "react-dom"],
  },
}));
