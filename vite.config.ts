import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: process.env.TAURI_ENV ? 'esnext' : 'es2020',
    minify: !process.env.TAURI_ENV ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV,
  },
})