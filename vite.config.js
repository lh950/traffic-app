import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// base: './' so the built assets resolve as relative paths — needed for the dist folder to be
// portable to any local static server (or off-server hosting) without sitting at a domain root.
export default {
  base: './',
  define: {
    // Injected at build time — update only package.json to change the version everywhere.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: Number(process.env.PORT) || 5175,
    strictPort: false,
  },
};
