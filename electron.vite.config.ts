import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk/vite'

export default defineConfig({
  main: {},

  preload: {},

  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },

    plugins: [
      vue(),
      DownloadLive2DSDK()
    ]
  }
})