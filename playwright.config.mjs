// Configuración de Playwright para el smoke test de arranque de Electron.
// Solo se necesita el binario de Electron del propio proyecto: no se
// descargan navegadores, porque el test lanza la app con _electron.launch().

import { defineConfig } from '@playwright/test'

// Configuración del smoke test: un solo proyecto, sin parallelism para que
// dos instances de Electron no compitan por los recursos de la maquina.
export default defineConfig({
  // Limita los tests a la carpeta e2e
  testDir: './e2e',
  // Solo acepta los *.e2e.mjs de esa carpeta
  testMatch: /.*\.e2e\.mjs/,
  // main.ts considera que estamos en desarrollo cuando la app no esta
  // empaquetada (isDev = NODE_ENV === 'development' || !app.isPackaged) y en ese
  // caso carga el servidor de Vite en vez del build. El smoke test lanza la app
  // sin empaquetar, asi que necesita el dev server en pie.
  webServer: {
    command: 'npm run dev:vite',
    // Vite sin server.host escucha en localhost (no en 127.0.0.1), que es
    // justo la URL que carga electron/main.ts en modo desarrollo
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 180000
  },
  // Un solo worker: la app Electron es pesada y no necesita paralelismo
  workers: 1,
  // Sin reintentos: un fallo de arranque es un fallo real, no es flakiness
  retries: 0,
  // Margen generoso: el primer arranque tras npm ci es lento
  timeout: 120000,
  expect: {
    // Margen para las aserciones de UI
    timeout: 20000
  },
  reporter: [['list']]
})
