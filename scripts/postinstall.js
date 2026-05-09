#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

// 1. Add missing "main" field to @tailwindcss/postcss so Next.js 9's bundled
//    resolver (which only reads "main", not "exports") can find the CJS entry.
const twPostcssPkg = path.join(root, "node_modules/@tailwindcss/postcss/package.json");
const pkg = JSON.parse(fs.readFileSync(twPostcssPkg, "utf8"));
if (!pkg.main) {
  pkg.main = "dist/index.js";
  fs.writeFileSync(twPostcssPkg, JSON.stringify(pkg, null, 2) + "\n");
  console.log("patched: @tailwindcss/postcss — added main field");
}

// 2. Remove postcss-loader's nested PostCSS 7 so it falls through to the
//    project-level PostCSS 8, which @tailwindcss/postcss requires.
const nestedPostcss = path.join(root, "node_modules/postcss-loader/node_modules/postcss");
if (fs.existsSync(nestedPostcss)) {
  fs.rmSync(nestedPostcss, { recursive: true });
  console.log("patched: postcss-loader — removed nested PostCSS 7");
}

// 3. Patch Next.js 9 client to use React 19's hydrateRoot/createRoot.
//    React 19 removed ReactDOM.hydrate() and ReactDOM.render() which
//    Next.js 9 calls directly. We patch the compiled client bundle.
const nextClient = path.join(root, "node_modules/next/dist/client/index.js");
let nc = fs.readFileSync(nextClient, "utf8");
let changed = false;

// Replace isInitialRender check (hydrate exists check) → always true
if (nc.includes("typeof _reactDom.default.hydrate==='function'")) {
  nc = nc.replace(
    "var isInitialRender=typeof _reactDom.default.hydrate==='function';",
    "var isInitialRender=true;"
  );
  changed = true;
}
// Replace ReactDOM.hydrate call → hydrateRoot
if (nc.includes("_reactDom.default.hydrate(reactEl,domEl,markHydrateComplete)")) {
  nc = nc.replace(
    "_reactDom.default.hydrate(reactEl,domEl,markHydrateComplete);isInitialRender=false;",
    "require('react-dom/client').hydrateRoot(domEl,reactEl);isInitialRender=false;markHydrateComplete();"
  );
  changed = true;
}
// Replace ReactDOM.render call → createRoot
if (nc.includes("_reactDom.default.render(reactEl,domEl,markRenderComplete)")) {
  nc = nc.replace(
    "_reactDom.default.render(reactEl,domEl,markRenderComplete);",
    "require('react-dom/client').createRoot(domEl).render(reactEl);markRenderComplete();"
  );
  changed = true;
}
if (changed) {
  fs.writeFileSync(nextClient, nc);
  console.log("patched: next/dist/client/index.js — use hydrateRoot/createRoot for React 19");
}
