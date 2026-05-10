const path = require("path");

module.exports = {
  webpack(config, { dev }) {
    if (!dev) {
      config.optimization.minimize = false;
    }
    // Force all @babel/runtime requires (including from next/dist/client) to use
    // the project-level 7.29.x so that OverloadYield and awaitAsyncGenerator
    // share the same class reference, fixing instanceof checks in the regenerator.
    config.resolve.alias["@babel/runtime"] = path.resolve(
      __dirname,
      "node_modules/@babel/runtime"
    );
    return config;
  },
};
