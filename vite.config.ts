import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;

// Every landing-page variant lives in its own folder: v1/index.html … v10/index.html
// for the product overview, and <page>/vN/index.html for other pages (e.g. travel/v1/).
const isVariant = (dir: string) => /^v\d+$/.test(dir);
const pageDirs = ["travel", "itinerary", "telco", "esign", "quoting", "docgen", "blocks", "canvas", "collab"];
const variantInputs = Object.fromEntries([
  ...readdirSync(root)
    .filter((dir) => isVariant(dir) && existsSync(resolve(root, dir, "index.html")))
    .map((dir) => [dir, resolve(root, dir, "index.html")]),
  ...pageDirs
    .filter((page) => existsSync(resolve(root, page)))
    .flatMap((page) =>
      readdirSync(resolve(root, page))
        .filter((dir) => isVariant(dir) && existsSync(resolve(root, page, dir, "index.html")))
        .map((dir) => [`${page}-${dir}`, resolve(root, page, dir, "index.html")]),
    ),
]);

// `<!-- @include header -->` pulls in src/partials/header.html so every page
// ships the same static header, footer and SEO head (no client-side rendering).
function htmlPartials(): Plugin {
  return {
    name: "qc-html-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name: string) =>
          readFileSync(resolve(root, "src/partials", `${name}.html`), "utf8"),
        );
      },
    },
    handleHotUpdate({ file, server }) {
      if (file.includes("/src/partials/")) server.ws.send({ type: "full-reload" });
    },
  };
}

export default defineConfig({
  plugins: [htmlPartials()],
  server: { port: 5190, allowedHosts: [".trycloudflare.com"] },
  preview: { port: 5191, allowedHosts: [".trycloudflare.com"] },
  build: {
    rollupOptions: { input: { main: resolve(root, "index.html"), ...variantInputs } },
  },
});
