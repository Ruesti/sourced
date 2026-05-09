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
// 4. The __NEXT_REACT_MODE !== 'legacy' branch (always taken when the env
//    var is unset) tries _reactDom.default.createBlockingRoot() which React 19
//    removed, throwing before our patched else-branch ever runs.
//    Force the condition to false so we always fall into the else branch.
const reactModeBranch =
  "if(process.env.__NEXT_REACT_MODE!=='legacy')" +
  "{if(!reactRoot){var opts={hydrate:true};" +
  "reactRoot=process.env.__NEXT_REACT_MODE==='concurrent'" +
  "?_reactDom.default.createRoot(domEl,opts)" +
  ":_reactDom.default.createBlockingRoot(domEl,opts);}" +
  "reactRoot.render(reactEl);}else{";
if (nc.includes(reactModeBranch)) {
  nc = nc.replace(
    reactModeBranch,
    "if(false){if(!reactRoot){var opts={hydrate:true};reactRoot=null;}reactRoot.render(reactEl);}else{"
  );
  changed = true;
}

if (changed) {
  fs.writeFileSync(nextClient, nc);
  console.log("patched: next/dist/client/index.js — use hydrateRoot/createRoot for React 19");
}

// 5. Duck-type the OverloadYield instanceof check in @babel/helpers so it works
//    regardless of which OverloadYield constructor created the object.
//    babel-loader inlines _regeneratorAsyncIterator (and a local _OverloadYield)
//    from @babel/helpers, while awaitAsyncGenerator is extracted to @babel/runtime
//    with its own OverloadYield — different constructors, so instanceof always fails.
//    Both constructors set this.k = d, making .k !== undefined a safe duck-type.
const regenIter = path.join(root, "node_modules/@babel/helpers/lib/helpers/regeneratorAsyncIterator.js");
let ri = fs.readFileSync(regenIter, "utf8");
if (ri.includes("value instanceof _OverloadYield.default")) {
  ri = ri.replace(
    "value instanceof _OverloadYield.default",
    "value && value.k !== undefined"
  );
  fs.writeFileSync(regenIter, ri);
  console.log("patched: @babel/helpers regeneratorAsyncIterator — duck-type OverloadYield check");
}
