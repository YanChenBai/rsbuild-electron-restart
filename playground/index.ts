import { app, BrowserWindow } from 'electron'

app.whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
    })

    win.loadURL('https://www.electronjs.org')
  })
