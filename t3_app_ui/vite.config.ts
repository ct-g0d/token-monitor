import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const t3Root = path.resolve(__dirname, '../t3codeexp');
const webSrc = path.resolve(t3Root, 'apps/web/src');
const contractsSrc = path.resolve(t3Root, 'packages/contracts/src');
const sharedSrc = path.resolve(t3Root, 'packages/shared/src');
const clientRuntimeSrc = path.resolve(t3Root, 'packages/client-runtime/src');
const providerCoreSrc = path.resolve(t3Root, 'packages/provider-core/src');

import fs from 'fs';

function getAllWorkspacePackageAliases(packagesDir: string) {
  const aliases: Array<{ find: string | RegExp; replacement: string }> = [];
  if (!fs.existsSync(packagesDir)) return aliases;
  for (const pkg of fs.readdirSync(packagesDir)) {
    const pkgDir = path.resolve(packagesDir, pkg);
    const pkgJsonPath = path.resolve(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      const pkgName = pkgJson.name;
      if (pkgJson.exports) {
        for (const [subpath, target] of Object.entries(pkgJson.exports)) {
          const targetPath = typeof target === 'string' ? target : ((target as any).default || (target as any).import || (target as any).types);
          if (targetPath) {
            const fullTarget = path.resolve(pkgDir, targetPath);
            if (subpath === '.') {
              aliases.push({ find: new RegExp(`^${pkgName}$`), replacement: fullTarget });
            } else if (subpath.startsWith('./')) {
              const cleanSub = subpath.slice(2);
              aliases.push({ find: new RegExp(`^${pkgName}/${cleanSub}$`), replacement: fullTarget });
            }
          }
        }
      }
      const srcDir = path.resolve(pkgDir, 'src');
      if (fs.existsSync(srcDir)) {
        aliases.push({ find: new RegExp(`^${pkgName}/(.*)$`), replacement: `${srcDir}/$1` });
        aliases.push({ find: new RegExp(`^${pkgName}$`), replacement: fs.existsSync(path.resolve(srcDir, 'index.ts')) ? path.resolve(srcDir, 'index.ts') : srcDir });
      }
    } catch {}
  }
  return aliases;
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-router', '@effect/atom-react', 'effect', 'lucide-react'],
    alias: [
      ...getAllWorkspacePackageAliases(path.resolve(t3Root, 'packages')),

      // Stubs for backend / server connections
      { find: '~/rpc/atomRegistry', replacement: path.resolve(__dirname, 'src/adapters/atomRegistry.ts') },
      { find: '../../state/usage', replacement: path.resolve(__dirname, 'src/adapters/usageState.ts') },
      { find: '~/state/usage', replacement: path.resolve(__dirname, 'src/adapters/usageState.ts') },
      { find: '../../state/server', replacement: path.resolve(__dirname, 'src/adapters/serverState.ts') },
      { find: '~/state/server', replacement: path.resolve(__dirname, 'src/adapters/serverState.ts') },
      { find: '../../state/use-atom-command', replacement: path.resolve(__dirname, 'src/adapters/useAtomCommand.ts') },
      { find: '~/state/use-atom-command', replacement: path.resolve(__dirname, 'src/adapters/useAtomCommand.ts') },

      // Genuine lucide icons
      { find: /^lucide$/, replacement: path.resolve(__dirname, 'node_modules/lucide') },
      { find: /^~\/(.*)$/, replacement: `${webSrc}/$1` },
      { find: '~', replacement: webSrc },
      { find: '@', replacement: path.resolve(__dirname, 'src') },

      // Pierre diffs subpaths
      { find: '@pierre/diffs/ssr', replacement: path.resolve(__dirname, 'node_modules/@pierre/diffs/dist/ssr/index.js') },
      { find: '@pierre/diffs/utils/parsePatchFiles', replacement: path.resolve(__dirname, 'node_modules/@pierre/diffs/dist/utils/parsePatchFiles.js') },

      // Culori subpath aliases
      { find: 'culori/css', replacement: path.resolve(__dirname, 'node_modules/culori/src/bootstrap/css.js') },
      { find: 'culori/fn', replacement: path.resolve(__dirname, 'node_modules/culori/src/index-fn.js') },
      { find: 'culori/all', replacement: path.resolve(__dirname, 'node_modules/culori/src/bootstrap/all.js') },
      { find: /^culori$/, replacement: path.resolve(__dirname, 'node_modules/culori/src/index.js') },
      { find: 'morphicons/react', replacement: path.resolve(__dirname, 'node_modules/morphicons/dist/react.js') },
      { find: /^morphicons$/, replacement: path.resolve(__dirname, 'node_modules/morphicons/dist/index.js') },
    ],
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    open: false,
  },
});
