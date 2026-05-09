module.exports = {
  webpack(config, { dev }) {
    if (!dev) {
      config.optimization.minimize = false;
    }
    return config;
  },
};
