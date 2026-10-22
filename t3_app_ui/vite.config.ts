import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rendererOutDir = path.resolve(__dirname, '../src/electron/renderer-t3');
const t3Root = path.resolve(__dirname, 'vendor/t3');
const t3WebSrc = path.resolve(t3Root, 'apps/web/src');
const lucideEsm = path.resolve(__dirname, 'node_modules/lucide/dist/esm/lucide.mjs');

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
          const targetPath =
            typeof target === 'string'
              ? target
              : ((target as any).default || (target as any).import || (target as any).types);
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
        aliases.push({
          find: new RegExp(`^${pkgName}$`),
          replacement: fs.existsSync(path.resolve(srcDir, 'index.ts'))
            ? path.resolve(srcDir, 'index.ts')
            : srcDir,
        });
      }
    } catch {}
  }
  return aliases;
}

export default defineConfig({
  logLevel: 'warn',
  base: './',
  build: {
    outDir: rendererOutDir,
    emptyOutDir: true,
  },
  worker: {
    format: 'es',
  },
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'alias-web-connection-catalog',
      resolveId(source, importer) {
        if (!importer) return null;
        if (
          (importer.includes('/apps/web/') || importer.includes('\\apps\\web\\')) &&
          (source === '~/connection/catalog' || source === '../connection/catalog' || source === '../../connection/catalog')
        ) {
          return path.resolve(__dirname, 'src/adapters/catalogState.ts');
        }
        if (
          source === '~/environments/primary/target' ||
          source === '../environments/primary/target' ||
          source === '../../environments/primary/target' ||
          source.endsWith('environments/primary/target') ||
          source.endsWith('environments/primary/target.ts')
        ) {
          return path.resolve(__dirname, 'src/adapters/primaryTarget.ts');
        }
        if (
          source === '~/localEnvironment' ||
          source === '../localEnvironment' ||
          source === '../../localEnvironment' ||
          source.endsWith('/localEnvironment')
        ) {
          return path.resolve(__dirname, 'src/adapters/localEnvironment.ts');
        }
        if (
          (source === './usagePagePreferences' || source === '~/components/usage/usagePagePreferences') &&
          (importer.includes('/components/usage/') || importer.includes('\\components\\usage\\'))
        ) {
          return path.resolve(__dirname, 'src/components/usage/usagePagePreferences.ts');
        }
        return null;
      },
    },
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-router', '@effect/atom-react', 'effect', 'lucide-react'],
    alias: [
      // App.tsx bridge: point hand-written path to genuine T3 UsagePage
      {
        find: /^(?:\.\/components\/usage\/UsagePage|~\/components\/usage\/UsagePage)$/,
        replacement: path.resolve(t3WebSrc, 'components/usage/UsagePage.tsx'),
      },

      // Provider presentation override: token monitor custom provider registry
      {
        find: /^(?:\.\/usageProviders|~\/components\/usage\/usageProviders)$/,
        replacement: path.resolve(__dirname, 'src/components/usage/usageProviders.ts'),
      },

      // Usage page preferences override: starts on "tokens"
      {
        find: /^(?:\.\/usagePagePreferences|~\/components\/usage\/usagePagePreferences)$/,
        replacement: path.resolve(__dirname, 'src/components/usage/usagePagePreferences.ts'),
      },

      // The genuine page still imports the abandoned Token Monitor section.
      {
        find: /^(?:\.\/TokexUsageSection|~\/components\/usage\/TokexUsageSection)$/,
        replacement: path.resolve(__dirname, 'src/components/usage/TokexUsageSection.tsx'),
      },

      // Primary environment target & local environment stubs
      {
        find: /^(?:~\/environments\/primary\/target|\.\.\/environments\/primary\/target)$/,
        replacement: path.resolve(__dirname, 'src/adapters/primaryTarget.ts'),
      },
      {
        find: /^(?:~\/localEnvironment|\.\.\/localEnvironment)$/,
        replacement: path.resolve(__dirname, 'src/adapters/localEnvironment.ts'),
      },

      // Backend adapter stubs
      { find: '~/rpc/atomRegistry', replacement: path.resolve(__dirname, 'src/adapters/atomRegistry.ts') },
      { find: '../../state/usage', replacement: path.resolve(__dirname, 'src/adapters/usageState.ts') },
      { find: '~/state/usage', replacement: path.resolve(__dirname, 'src/adapters/usageState.ts') },
      { find: '../../state/server', replacement: path.resolve(__dirname, 'src/adapters/serverState.ts') },
      { find: '~/state/server', replacement: path.resolve(__dirname, 'src/adapters/serverState.ts') },
      { find: '../../state/presentation', replacement: path.resolve(__dirname, 'src/adapters/presentationState.ts') },
      { find: '~/state/presentation', replacement: path.resolve(__dirname, 'src/adapters/presentationState.ts') },
      { find: '../../state/session', replacement: path.resolve(__dirname, 'src/adapters/sessionState.ts') },
      { find: '~/state/session', replacement: path.resolve(__dirname, 'src/adapters/sessionState.ts') },
      { find: '../../state/use-atom-command', replacement: path.resolve(__dirname, 'src/adapters/useAtomCommand.ts') },
      { find: '~/state/use-atom-command', replacement: path.resolve(__dirname, 'src/adapters/useAtomCommand.ts') },

      // Workspace packages
      ...getAllWorkspacePackageAliases(path.resolve(t3Root, 'packages')),

      // Icons and root paths
      { find: /^lucide$/, replacement: lucideEsm },
      { find: /^~\/(.*)$/, replacement: `${t3WebSrc}/$1` },
      { find: '~', replacement: t3WebSrc },
      { find: 't3-code', replacement: t3WebSrc },
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
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
});
