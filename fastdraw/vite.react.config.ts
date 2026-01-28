import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { isExternal } from './vite.shared';

export default defineConfig({
  plugins: [
    dts({
      entryRoot: 'src/adapters/react',
      outDir: 'dist/adapters/react',
      insertTypesEntry: true
    }),
  ],

  build: {
    outDir: 'dist/adapters/react',

    lib: {
      entry: resolve(__dirname, 'src/adapters/react/index.ts'),
      name: 'FastDrawReact',
      formats: ['es', 'cjs'],
      fileName: (f) => `react.${f}.js`,
    },

    rollupOptions: {
      external: isExternal,
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
        },
      },
    },

    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
    sourcemap: false,
  },
});
