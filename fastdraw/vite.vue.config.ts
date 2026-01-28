import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { isExternal } from './vite.shared';

export default defineConfig({
  plugins: [
    vue(),
    dts({
      entryRoot: 'src/adapters/vue',
      outDir: 'dist/adapters/vue',
      insertTypesEntry: true,
    }),
  ],

  build: {
    outDir: 'dist/adapters/vue',

    lib: {
      entry: resolve(__dirname, 'src/adapters/vue/index.ts'),
      name: 'FastDrawVue',
      formats: ['es', 'cjs'],
      fileName: (f) => `vue.${f}.js`,
    },

    rollupOptions: {
      external: isExternal,
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },

    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
    sourcemap: false,
  },
});
