import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Baked in at build time from the actual commit the CI/CD build cloned —
// not something that can drift from what's really deployed, unlike a
// hand-maintained version number. Falls back gracefully if `.git` isn't
// available in the build environment for some reason.
function gitInfo(cmd, fallback) {
  try { return execSync(cmd).toString().trim(); } catch { return fallback; }
}
const APP_VERSION = gitInfo('git rev-parse --short HEAD', 'unknown');
const APP_VERSION_DATE = gitInfo('git log -1 --format=%cI', new Date().toISOString());

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_VERSION_DATE__: JSON.stringify(APP_VERSION_DATE),
  },
});
