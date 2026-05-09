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

// 3. Shim ReactDOM.hydrate and ReactDOM.render back into React 19.
//    Next.js 9 calls these directly; React 19 removed them.
//    We re-add them as wrappers around hydrateRoot / createRoot.
const reactDomPkg = path.join(root, "node_modules/react-dom/package.json");
const reactDomIndex = path.join(root, "node_modules/react-dom/index.js");
const shimLine = "// next9-shim-v2";
const src = fs.readFileSync(reactDomIndex, "utf8");
if (!src.includes(shimLine)) {
  const shim = `${shimLine}
var __client = require('react-dom/client');
if (!module.exports.hydrate) {
  module.exports.hydrate = function(element, container, cb) {
    var root = __client.hydrateRoot(container, element);
    if (cb) cb();
    return root;
  };
}
if (!module.exports.render) {
  module.exports.render = function(element, container, cb) {
    var root = __client.createRoot(container);
    root.render(element);
    if (cb) cb();
    return root;
  };
}
`;
  fs.writeFileSync(reactDomIndex, src + "\n" + shim);
  console.log("patched: react-dom — shimmed hydrate/render for Next.js 9 compatibility");
}
