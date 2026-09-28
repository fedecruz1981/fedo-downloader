// Genera la captura del README de YTAudio Studio. Arranca la app con una
// carpeta de descargas de ejemplo, simula una cola de descargas en estados
// realista y guarda el PNG en docs/. Se regenera con npm run captura, asi el
// README nunca muestra una imagen vieja de la interfaz.
//
// El audio de la carpeta es sintetico (senos de ffmpeg): lo que se ve en la
// captura es la app real, no una maqueta dibujada a mano.

import { _electron as electron } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Carpeta raiz del proyecto, resuelta desde la ubicacion de este archivo
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Destino de la captura
const outFile = path.join(projectRoot, 'docs', 'captura.png')

// Escribe un WAV PCM de 16 bits mono, igual que el helper del explorer
function writeWav(filePath, seconds, freq) {
  // Frecuencia de muestreo
  const RATE = 44100
  // Cantidad de muestras
  const n = Math.round(seconds * RATE)
  // Buffer del archivo: cabecera de 44 bytes mas los datos de 16 bits
  const buf = Buffer.alloc(44 + n * 2)
  // Firma RIFF y tamaño total
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  // Formato WAVE con un bloque fmt
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  // PCM sin compresion, un canal, 16 bits
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  // Frecuencia de muestreo y velocidad en bytes
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  // Bloque de datos con su tamaño
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  // Escribe el seno muestra a muestra
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * freq * i) / RATE)), 44 + i * 2)
  }
  fs.writeFileSync(filePath, buf)
}

// Codifica un MP3 con ffmpeg a partir de un seno de la frecuencia pedida
function writeMp3(filePath, seconds, freq) {
  // Sintetiza el tono y lo codifica en MP3 a 192 kbps
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`,
    '-b:a', '192k', filePath,
  ])
}

// Si ffmpeg esta disponible en el PATH
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

// Crea la carpeta de descargas de ejemplo. Va en Descargas con un nombre de
// proyecto para que las rutas del panel lateral se vean creibles en el README,
// y se borra al terminar.
function makeFixtureDir() {
  // Sin ffmpeg no se pueden generar los MP3 y FLAC de ejemplo
  if (!hasFfmpeg) throw new Error('ffmpeg no esta en el PATH: hace falta para los MP3 de ejemplo')
  // Carpeta de la descarga de demo
  const dir = path.join(os.homedir(), 'Descargas', 'YT Audio - Sesion 12-08')
  // Empieza de cero si una corrida anterior dejo la carpeta a medias
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // MP3 como los que baja la app, con duraciones distintas
  const mp3s = [
    ['01 - ensayo bajo.mp3', 7.4, 110],
    ['02 - pista pad.mp3', 5.1, 220],
    ['03 - intro.mp3', 3.8, 330],
    ['04 - cierre.mp3', 6.2, 165],
  ]
  for (const [name, seconds, freq] of mp3s) writeMp3(path.join(dir, name), seconds, freq)
  // Un WAV y un FLAC para que se vean los tres formatos que la app lista
  writeWav(path.join(dir, '05 - loop bajo.wav'), 4.2, 98)
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'sine=frequency=147:duration=5.5',
    path.join(dir, '06 - Idea 3.flac'),
  ])
  return dir
}

async function main() {
  // Carpeta con la descarga de demo
  const dir = makeFixtureDir()
  // Carpeta secundaria, para que el arbol tenga mas de una entrada
  const otra = path.join(os.homedir(), 'Descargas', 'YT Audio - Interviews')

  // Lanza la app pasando la raiz del proyecto como argumento. Sin empaquetar,
  // main.ts abre DevTools, asi que firstWindow() puede devolver esa ventana.
  const app = await electron.launch({ args: [projectRoot] })
  // Espera a que aparezca la ventana de la app y no la de DevTools
  let win = null
  const limite = Date.now() + 60000
  while (Date.now() < limite && !win) {
    win = app
      .windows()
      .find((w) => !w.url().startsWith('devtools://') && w.url() !== '' && w.url() !== 'about:blank')
    // Espera 200 ms antes de volver a mirar
    if (!win) await new Promise((r) => setTimeout(r, 200))
  }
  if (!win) throw new Error('la ventana principal de la app no apareció')

  try {
    // Sin empaquetar, main.ts siempre carga el dev server de Vite y abre
    // DevTools docked. Para la captura interesa el build real: se cierra
    // DevTools y se carga dist/index.html, que es la misma ruta que usa la
    // app empaquetada. Asi no hace falta levantar Vite.
    await app.evaluate(async ({ BrowserWindow }, args) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.webContents.getURL().startsWith('devtools://')
      )
      w.webContents.closeDevTools()
      await w.loadFile(args.indexHtml)
    }, { indexHtml: path.join(projectRoot, 'dist', 'index.html') })
    await win.waitForLoadState('domcontentloaded')

    // La app persiste la configuracion con zustand/persist en localStorage
    // (clave ytaudio-store), no con el handler get-config, asi que el estado
    // de la demo se siembra antes de que corra el bundle. Asi se ve la app
    // como queda despues de agregar carpetas a mano.
    await win.addInitScript((persistido) => {
      localStorage.setItem('ytaudio-store', JSON.stringify(persistido))
    }, {
      state: {
        config: {
          rootFolders: [dir, otra],
          lastActiveFolder: dir,
          defaultDownloadFolder: dir,
          defaultDownloadFormat: 'mp3',
          defaultDownloadQuality: '320k',
          defaultNormalizeTarget: -14,
          gridOrListView: 'grid',
          maxParallelDownloads: 1,
        },
        viewMode: 'grid',
        sidebarCollapsed: false,
      },
      version: 0,
    })

    // Parchea el arranque de descargas en el proceso principal. El arranque
    // real delegaria en el sidecar de Python con yt-dlp, que no corresponde
    // aca: se devuelven ids falsos y los eventos los manda el script.
    await app.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('start-download')
      ipcMain.handle('start-download', async (_e, jobs) => {
        // Guarda los ids para que el script pueda mandar los eventos despues
        globalThis.__ids = jobs.map((_, i) => `demo-${i}`)
        return globalThis.__ids
      })
    })
    await win.reload()
    await win.waitForLoadState('domcontentloaded')

    // Espera a que la lista de archivos cargue
    await win.locator('text=01 - ensayo bajo.mp3').first().waitFor({ timeout: 30000 })

    // Escribe tres URLs en la barra y las envía, que es el camino real de la
    // app: el submit llama a startDownload y agrega los trabajos a la cola.
    const textarea = win.locator('textarea')
    await textarea.fill(
      [
        'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        'https://www.youtube.com/watch?v=9bZkp7q19f0',
        'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
      ].join('\n')
    )
    await win.locator('form button[type="submit"]').click()

    // Espera a que la cola muestre los tres trabajos
    await win.waitForTimeout(800)
    // Manda los eventos que el proceso principal emitiria en una descarga real:
    // uno terminado, uno a mitad de camino y uno en cola.
    await app.evaluate(async ({ BrowserWindow }, fixture) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().startsWith('devtools://'))
      const [hecho, bajando, encolado] = globalThis.__ids
      w.webContents.send('download:complete', {
        id: hecho,
        path: `${fixture}\\07 - Big Buck Bunny.mp3`,
      })
      w.webContents.send('download:progress', {
        id: bajando,
        percent: 63,
        speed: '1,8 MB/s',
        eta: '0:04',
        status: 'downloading',
      })
      w.webContents.send('download:progress', {
        id: encolado,
        percent: 0,
        status: 'queued',
      })
    }, dir)

    // Deja que la barra de progreso y el toast se asienten
    await win.waitForTimeout(1500)

    // Guarda la captura en docs/
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    await win.screenshot({ path: outFile })
    const kb = (fs.statSync(outFile).size / 1024).toFixed(0)
    console.log(`captura escrita en ${path.relative(projectRoot, outFile)} (${kb} KB)`)
  } finally {
    // Cierra la app y borra las carpetas de demo
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export { makeFixtureDir, main }

// La captura solo corre cuando este archivo se invoca directamente. Si otro
// script lo importa para inspeccionar el estado de la interfaz, no debe
// arrancar la app por los ojos de quien importa.
const invocadoDirecto =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invocadoDirecto) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
