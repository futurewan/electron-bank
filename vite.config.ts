import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-pdf-worker',
      buildStart() {
        try {
          const src = path.resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')
          const destDir = path.resolve(__dirname, 'dist-electron')
          const dest = path.join(destDir, 'pdf.worker.mjs')

          if (fs.existsSync(src)) {
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true })
            }
            fs.copyFileSync(src, dest)
            console.log('[Vite] Copied pdf.worker.mjs to dist-electron')
          } else {
            console.warn('[Vite] Warning: pdf.worker.mjs not found at ' + src)
          }
        } catch (e) {
          console.error('[Vite] Failed to copy pdf.worker.mjs:', e)
        }
      }
    },
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'pdf-parse', 'pdfjs-dist'],
            },
          },
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
})
