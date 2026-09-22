module.exports = {
  packagerConfig: {
    // .node binaries cannot be loaded from inside an asar archive
    asar: {
      unpack: '**/node_modules/node-pty/**',
    },
    // User-editable language files ship next to the app under resources/lang;
    // license texts ship alongside so bundled components' copyrights are preserved
    extraResource: ['lang', 'LICENSE', 'THIRD_PARTY_LICENSES.md'],
  },
  // node-pty ships N-API prebuilds that work in Electron as-is; a
  // node-gyp rebuild would need VS C++ build tools and is unnecessary.
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
  ],
  plugins: [],
}
