import { resolve } from 'node:path';
import { defineConfig, UserConfig } from 'vite';
import { isExternal } from './vite.shared';

export default defineConfig(async () => {
  const { default: dts } = await import('vite-plugin-dts');

  const packageConfig: UserConfig = {
    plugins: [
      dts({
        entryRoot: 'src',
        outDir: 'dist',
        insertTypesEntry: true,
      }),
    ],

    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'FastDraw',
        formats: ['es', 'cjs'],
        fileName: (f) => `core.${f}.js`,
      },

      rollupOptions: {
        external: isExternal,
      },

      chunkSizeWarningLimit: 2000,
      reportCompressedSize: false,
      sourcemap: false,
    },
  }

  return packageConfig;
});
