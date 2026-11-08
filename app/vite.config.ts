// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

/// <reference types="vitest/config" />
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// See ADR 0010. The app is a static site: it works from any folder of
// any web server, so every path is relative ("./").
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    // Images stay files: inlined into JS they would count against the
    // JS budget and be parsed on every start.
    assetsInlineLimit: 0,
  },
  plugins: [
    react(),
    // React Compiler memoizes components itself (ADR 0010).
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      // The service worker is ours (src/sw.ts): the caching rules for
      // data are part of data honesty and must be readable (ADR 0005).
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: "script-defer",
      registerType: "autoUpdate",
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,svg,png,webmanifest}"],
      },
      manifest: {
        name: "Orbit — расписание",
        short_name: "Orbit",
        description: "Расписание колледжей и вузов. Независимый проект.",
        lang: "ru",
        id: "./",
        start_url: "./",
        scope: "./",
        display: "standalone",
        categories: ["education", "productivity"],
        // Colors and icons: brand/README.md.
        background_color: "#1f2238",
        theme_color: "#1f2238",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "happy-dom",
    restoreMocks: true,
  },
});
