module.exports = {
  webpack(config) {
    config.output.hashFunction = "sha256";
    return config;
  },
};
