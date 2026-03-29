// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
    cssEntryFile: "./src/global.css",
    polyfills: { rem: 14 },
    extraThemes: ['custom-theme', 'custom-theme-dark'],
});
