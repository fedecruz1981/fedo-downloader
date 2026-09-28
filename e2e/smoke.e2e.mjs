// Smoke test de arranque de YTAudio Studio: comprueba que el proceso principal
// de Electron arranca con la version actual, que la ventana carga el build del
// renderer y que el preload publica su API. Es la red de seguridad frente a
// regressions de API al subir de version de Electron.
//
// El smoke test no lanza descargas ni llama al sidecar de Python a proposito:
// en el CI no estan ffmpeg, yt-dlp ni Whisper, y la interfaz debe poder
// arrancar sin ellos.

import { test, expect, _electron as electron } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Carpeta raiz del proyecto, resuelta desde la ubicacion de este archivo
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Arranca la aplicacion Electron y devuelve el proceso junto a su ventana principal.
// Ojo: al ejecutar sin empaquetar, main.ts considera que estamos en desarrollo
// (isDev = NODE_ENV === 'development' || !app.isPackaged) y abre DevTools, asi que
// firstWindow() devolveria esa ventana en lugar de la de la app.
async function launchApp() {
  // Lanza la app pasando la raiz del proyecto como argumento
  const app = await electron.launch({ args: [projectRoot] })
  // Espera a que aparezca la ventana de la aplicacion, no la de DevTools
  const win = await waitForMainWindow(app)
  // Devuelve el proceso y la ventana ya disponible
  return { app, win }
}

// Espera a que exista la ventana de la aplicacion (no la de DevTools)
async function waitForMainWindow(app, timeoutMs = 60000) {
  // Fecha limite para no esperar indefinidamente
  const deadline = Date.now() + timeoutMs
  // Busca la ventana principal hasta que aparezca
  while (Date.now() < deadline) {
    // Filtra DevTools (devtools://) y las paginas aun vacias o en blanco
    const candidatas = app.windows().filter((w) => {
      // URL actual de la ventana
      const url = w.url()
      // Descarta DevTools y las paginas que aun no han cargado
      return !url.startsWith('devtools://') && url !== '' && url !== 'about:blank'
    })
    // En cuanto haya una ventana de la app, la devuelve
    if (candidatas.length > 0) return candidatas[0]
    // Espera 200 ms antes de volver a mirar
    await new Promise((r) => setTimeout(r, 200))
  }
  // Si no aparece, es un fallo real de arranque
  throw new Error('la ventana principal de la app no apareció')
}

test.describe('YTAudio Studio', () => {
  test('arranca y monta la interfaz', async () => {
    // Lanza la app y toma la ventana
    const { app, win } = await launchApp()

    try {
      // Espera a que el documento termine de cargar
      await win.waitForLoadState('domcontentloaded')

      // La ventana debe tener el titulo de la app
      await expect(win).toHaveTitle(/YTAudio Studio/)

      // React debe haber montado algo dentro de #root
      await expect(win.locator('#root')).toBeAttached()
      // La raiz de la app no puede estar vacia
      const rootHtml = await win.locator('#root').innerHTML()
      // Confirma que React renderizo la interfaz
      expect(rootHtml.length).toBeGreaterThan(0)

      // La ventana principal debe existir en el proceso principal
      const windowCount = await app.evaluate(async ({ BrowserWindow }) => {
        // Devuelve cuantas ventanas existen en el proceso principal
        return BrowserWindow.getAllWindows().length
      })
      // Debe existir exactamente una ventana
      expect(windowCount).toBe(1)
    } finally {
      // Cierra siempre la app para no dejar procesos colgados
      await app.close()
    }
  })

  test('expone el puente de IPC y lee la configuracion', async () => {
    // Lanza la app y toma la ventana
    const { app, win } = await launchApp()

    try {
      // Espera a que el documento termine de cargar
      await win.waitForLoadState('domcontentloaded')

      // El preload debe haber publicado window.api en el renderer
      const tieneBridge = await win.evaluate(() => typeof window.api === 'object')
      // Confirma que el puente de IPC existe
      expect(tieneBridge).toBe(true)

      // get-config lee electron-store en el proceso principal: valida el viaje
      // preload -> ipcRenderer.invoke -> ipcMain.handle -> respuesta sin
      // depender de ffmpeg, yt-dlp ni del sidecar
      const config = await win.evaluate(() => window.api.getConfig())
      // La configuracion debe ser un objeto
      expect(config).toBeTruthy()
      expect(typeof config).toBe('object')
    } finally {
      // Cierra siempre la app
      await app.close()
    }
  })

  test('no registra errores de JavaScript al arrancar', async () => {
    // Lanza la app y toma la ventana
    const { app, win } = await launchApp()

    try {
      // Recoge los errores de la pagina que aparezcan tras cargar
      const errores = []
      // Escucha los errores no capturados del renderer
      win.on('pageerror', (err) => errores.push(String(err)))

      // Fuerza una recarga para observar el arranque completo
      await win.reload()
      // Espera a que el documento termine de cargar
      await win.waitForLoadState('domcontentloaded')
      // Margen para que se dispare algun error asincrono tardio
      await win.waitForTimeout(2000)

      // Ningun error de JavaScript debe haber aparecido
      expect(errores).toEqual([])
    } finally {
      // Cierra siempre la app
      await app.close()
    }
  })
})
