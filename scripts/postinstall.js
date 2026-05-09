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

// 5. Duck-type the OverloadYield instanceof checks in @babel/helpers helpers-generated.js.
//    babel-loader inlines helpers from this pre-compiled map. Each entry has a `dependencies`
//    map that tells babel where to inject resolved helper references into the AST.
//    Changing the string (instanceof → duck-type) shifts the AST, so the old path injected
//    _OverloadYield at the wrong node, producing `u && _OverloadYield` (always-truthy).
//    Fix: patch both the string AND remove the OverloadYield dependency entry so babel
//    leaves the duck-type expression untouched.
const helpersGen = path.join(root, "node_modules/@babel/helpers/lib/helpers-generated.js");
let hg = fs.readFileSync(helpersGen, "utf8");
let hgChanged = false;

// regeneratorAsyncIterator — duck-type the check + remove OverloadYield dependency
if (hg.includes("u instanceof OverloadYield?")) {
  hg = hg.replace("u instanceof OverloadYield?", "u&&u.k!==void 0?");
  hgChanged = true;
}
// Remove the OverloadYield dep path so babel doesn't corrupt the patched expression
const regenDepLine = '      OverloadYield: ["body.0.body.body.0.body.body.0.block.body.1.argument.test.right"],\n';
if (hg.includes(regenDepLine)) {
  hg = hg.replace(regenDepLine, "");
  hgChanged = true;
}

// wrapAsyncGenerator — duck-type the check + remove OverloadYield dependency
if (hg.includes("u=o instanceof OverloadYield")) {
  hg = hg.replace("u=o instanceof OverloadYield", "u=o&&o.k!==void 0");
  hgChanged = true;
}
// wrapAsyncGenerator has OverloadYield as its only dependency entry
const wrapDepBlock = '    dependencies: {\n      OverloadYield: ["body.1.body.body.1.body.body.0.block.body.0.declarations.2.init.right"]\n    },';
if (hg.includes(wrapDepBlock)) {
  hg = hg.replace(wrapDepBlock, "    dependencies: {},");
  hgChanged = true;
}

if (hgChanged) {
  fs.writeFileSync(helpersGen, hg);
  console.log("patched: @babel/helpers helpers-generated.js — duck-type OverloadYield checks");
}
