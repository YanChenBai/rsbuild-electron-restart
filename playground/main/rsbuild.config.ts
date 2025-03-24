import { resolve } from 'node:path'
import { defineConfig } from '@rsbuild/core'
import AutoRestart from '../../core'

export default defineConfig({
  root: resolve(__dirname, '.'),
  plugins: [
    AutoRestart(),
  ],
  source: {
    entry: {
      index: './index.ts',
    },
  },
  output: {
    target: 'node',
    minify: false,
    distPath: {
      root: '../../out/main',
    },
    cleanDistPath: true,
    filename: {
      js: '[name].cjs',
    },
  },
  tools: {
    rspack: {
      externalsPresets: {
        electronMain: true,
      },
      target: 'electron-main',
    },
  },
})
