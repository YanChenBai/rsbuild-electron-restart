import process from 'node:process'
import { defineConfig } from 'tsup'

const isDev = process.env.NODE_ENV === 'development'

export default defineConfig({
  tsconfig: './tsconfig.json',
  entry: {
    index: 'core/index.ts',
  },
  external: ['@rsbuild/core'],
  format: ['esm'],
  sourcemap: isDev,
  minify: false,
  splitting: true,
  clean: true,
  dts: true,
  esbuildOptions(options) {
    options.conditions = ['dev']
  },
})
