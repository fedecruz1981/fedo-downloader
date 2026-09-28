import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // El renderer se carga con loadFile, o sea bajo file://. Con el base por
  // defecto (/), los assets del build quedan como /assets/... y el navegador
  // los busca en la raiz del disco: la app instalada abria en blanco.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})