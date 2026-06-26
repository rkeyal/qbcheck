import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, readFileSync, writeFileSync } from 'fs';

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'apps-script'),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/apps-script/main.ts'),
      formats: ['es'],
      fileName: () => 'Code',
    },
    rollupOptions: {
      external: ['jszip'],
      output: {
        entryFileNames: 'Code.js',
      },
    },
    minify: false,
  },
  plugins: [
    {
      name: 'apps-script-transform',
      closeBundle() {
        const codePath = resolve(__dirname, 'apps-script/Code.js');
        let code = readFileSync(codePath, 'utf-8');

        // Strip 'export' keywords to make functions top-level globals
        // (Apps Script requires top-level function declarations)
        code = code.replace(/^export function /gm, 'function ');
        // Remove the trailing export block that Rollup generates
        code = code.replace(/^export \{[^}]*\};\s*$/gm, '');

        writeFileSync(codePath, code);

        copyFileSync(
          resolve(__dirname, 'src/apps-script/sidebar.html'),
          resolve(__dirname, 'apps-script/Sidebar.html')
        );
      },
    },
  ],
});
