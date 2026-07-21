const { app, BrowserWindow, ipcMain, Menu, MenuItem, globalShortcut, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const downloads = []
let downloadIdCounter = 0
let downloadSettings = {
  defaultPath: app.getPath('downloads'),
  askForPath: false,
  lyricWindowPosition: { x: 0, y: 100 },
  lyricWindowSize: { width: 600, height: 150 },
  lyricSettings: {
    textColor: '#ffffff',
    strokeColor: '#000000',
    fontSize: 28,
    fontFamily: 'Microsoft YaHei',
    karaokeMode: false
  }
}

const dataDir = app.getPath('userData')
const downloadsFile = path.join(dataDir, 'downloads.json')
const settingsFile = path.join(dataDir, 'settings.json')

function loadDownloads() {
  try {
    if (fs.existsSync(downloadsFile)) {
      const saved = JSON.parse(fs.readFileSync(downloadsFile, 'utf8'))
      downloads.push(...saved)
      downloadIdCounter = downloads.length > 0 ? Math.max(...downloads.map(d => d.id)) : 0
    }
  } catch (err) {
    console.error('Failed to load downloads:', err)
  }
}

function saveDownloads() {
  try {
    fs.writeFileSync(downloadsFile, JSON.stringify(downloads, null, 2))
  } catch (err) {
    console.error('Failed to save downloads:', err)
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
      downloadSettings = { ...downloadSettings, ...saved }
      if (saved.lyricSettings) {
        const defaults = {
          textColor: '#ffffff',
          strokeColor: '#000000',
          fontSize: 28,
          fontFamily: 'Microsoft YaHei',
          karaokeMode: false
        }
        downloadSettings.lyricSettings = { ...defaults, ...saved.lyricSettings }
        delete downloadSettings.lyricSettings.shadowColor
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(downloadSettings, null, 2))
  } catch (err) {
    console.error('Failed to save settings:', err)
  }
}

function getUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) {
    return filePath
  }
  
  const dir = path.dirname(filePath)
  const ext = path.extname(filePath)
  const base = path.basename(filePath, ext)
  
  let counter = 1
  while (true) {
    const newPath = path.join(dir, `${base} (${counter})${ext}`)
    if (!fs.existsSync(newPath)) {
      return newPath
    }
    counter++
  }
}

function createWindow(options = {}) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    },
    autoHideMenuBar: true,
    ...options
  })

  if (options.url) {
    win.loadURL(options.url)
  } else if (options.downloadsPage) {
    win.loadFile('downloads.html')
  } else {
    win.loadFile('index.html')
    mainWindow = win
    win.on('closed', () => {
      mainWindow = null
      if (lyricWindow && !lyricWindow.isDestroyed()) {
        lyricWindow.close()
        lyricWindow = null
      }
      if (lyricSettingsWindow && !lyricSettingsWindow.isDestroyed()) {
        lyricSettingsWindow.close()
        lyricSettingsWindow = null
      }
    })
  }

  win.webContents.setWindowOpenHandler((details) => {
    createWindow({ url: details.url })
    return { action: 'deny' }
  })

  setupWindowFeatures(win)
  return win
}

function setupDownloadHandler() {
  app.on('session-created', (session) => {
    session.on('will-download', async (event, item, webContents) => {
      const downloadId = ++downloadIdCounter
      let downloadPath = path.join(downloadSettings.defaultPath, item.getFilename())
      downloadPath = getUniqueFilePath(downloadPath)
      
      const downloadInfo = {
        id: downloadId,
        filename: path.basename(downloadPath),
        url: item.getURL(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: item.getReceivedBytes(),
        progress: 0,
        state: 'pending',
        savePath: downloadPath
      }
      
      downloads.unshift(downloadInfo)
      saveDownloads()
      
      function sendUpdate() {
        const allWindows = BrowserWindow.getAllWindows()
        allWindows.forEach(win => {
          const url = win.webContents.getURL()
          if (url.includes('downloads.html') || url.includes('index.html')) {
            win.webContents.send('download-update', downloadInfo)
          }
        })
      }
      
      sendUpdate()
      
      const filename = downloadInfo.filename
      
      const focusedWindow = BrowserWindow.getFocusedWindow()
      dialog.showMessageBox(focusedWindow || BrowserWindow.getAllWindows()[0], {
        type: 'info',
        title: '下载开始',
        message: '📥 文件已开始下载',
        detail: filename,
        buttons: ['打开下载管理器', '关闭'],
        defaultId: 0
      }).then(function(result) {
        if (result.response === 0) {
          createWindow({ downloadsPage: true })
        }
      }).catch(function(err) {
        console.error('Failed to show download message:', err);
      })
      
      if (downloadSettings.askForPath) {
        item.pause()
        
        const result = await dialog.showSaveDialog({
          defaultPath: downloadPath,
          filters: [{ name: 'All Files', extensions: ['*'] }]
        })
        
        if (result.canceled) {
          downloadInfo.state = 'cancelled'
          sendUpdate()
          return
        }
        
        downloadPath = getUniqueFilePath(result.filePath)
        downloadInfo.filename = path.basename(downloadPath)
        downloadInfo.savePath = downloadPath
        item.setSavePath(downloadPath)
        item.resume()
      } else {
        item.setSavePath(downloadPath)
      }
      
      downloadInfo.state = 'downloading'
      sendUpdate()
      
      item.on('updated', (event, state) => {
        downloadInfo.receivedBytes = item.getReceivedBytes()
        downloadInfo.totalBytes = item.getTotalBytes()
        downloadInfo.progress = downloadInfo.totalBytes > 0 
          ? Math.round((downloadInfo.receivedBytes / downloadInfo.totalBytes) * 100) 
          : 0
        downloadInfo.state = state === 'interrupted' ? 'downloading' : state
        
        sendUpdate()
        saveDownloads()
      })
      
      item.on('done', (event, state) => {
        downloadInfo.state = state === 'completed' ? 'completed' : 'cancelled'
        
        sendUpdate()
        saveDownloads()
      })
    })
  })
}

function extractUrls(text) {
  if (!text) return []
  const urlRegex = /https?:\/\/\S+/g
  const matches = text.match(urlRegex)
  if (matches) {
    return matches.map(url => url.replace(/[.,;:!?)\]}'"]+$/, ''))
  }
  return []
}

function formatUrl(urlString) {
  try {
    const url = new URL(urlString)
    let result = url.hostname + url.pathname
    if (result.length > 30) {
      result = result.substring(0, 30) + '...'
    }
    return result
  } catch (e) {
    return urlString.length > 30 ? urlString.substring(0, 30) + '...' : urlString
  }
}

function setupWindowFeatures(win) {
  const webContents = win.webContents

  webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      event.preventDefault()
      if (webContents.isDevToolsOpened()) {
        webContents.closeDevTools()
      } else {
        webContents.openDevTools()
      }
    } else if (input.key === 'F5' && !input.control && !input.meta) {
      event.preventDefault()
      webContents.reload()
    } else if (input.key === 'F11') {
      event.preventDefault()
      win.setFullScreen(!win.isFullScreen())
    }
  })

  win.webContents.on('context-menu', (event, params) => {
    const menu = new Menu()
    let hasEditItems = false

    menu.append(new MenuItem({
      label: '返回',
      enabled: webContents.canGoBack(),
      click: () => webContents.goBack(),
      accelerator: 'Alt+Left'
    }))

    menu.append(new MenuItem({
      label: '前进',
      enabled: webContents.canGoForward(),
      click: () => webContents.goForward(),
      accelerator: 'Alt+Right'
    }))

    menu.append(new MenuItem({
      label: '重新加载',
      click: () => webContents.reload(),
      accelerator: 'Ctrl+R'
    }))

    menu.append(new MenuItem({ type: 'separator' }))

    menu.append(new MenuItem({
      label: '打开主页',
      click: () => createWindow({ preload: true })
    }))

    menu.append(new MenuItem({
      label: 'Infinity 主页',
      click: () => createWindow({ url: 'https://inftab.com' })
    }))

    menu.append(new MenuItem({
      label: '复制当前链接',
      click: () => {
        const { clipboard } = require('electron')
        clipboard.writeText(webContents.getURL())
      },
      accelerator: 'Ctrl+L'
    }))

    if (params.linkURL && params.linkURL.length > 0) {
      menu.append(new MenuItem({
        label: `跳转到 ${formatUrl(params.linkURL)}`,
        click: () => createWindow({ url: params.linkURL })
      }))
      hasEditItems = true
    }

    if (params.isEditable || params.inputFieldType) {
      if (params.selectionText && params.selectionText.length > 0) {
        const urls = extractUrls(params.selectionText)
        if (urls.length > 0) {
          for (const url of urls.slice(0, 3)) {
            menu.append(new MenuItem({
              label: `跳转到 ${formatUrl(url)}`,
              click: () => createWindow({ url })
            }))
          }
          hasEditItems = true
        }
        menu.append(new MenuItem({
          label: '剪切',
          role: 'cut',
          accelerator: 'Ctrl+X'
        }))
        menu.append(new MenuItem({
          label: '复制',
          role: 'copy',
          accelerator: 'Ctrl+C'
        }))
        hasEditItems = true
      }
      menu.append(new MenuItem({
        label: '粘贴',
        role: 'paste',
        accelerator: 'Ctrl+V'
      }))
      hasEditItems = true
    } else if (params.selectionText && params.selectionText.length > 0) {
      const urls = extractUrls(params.selectionText)
      if (urls.length > 0) {
        for (const url of urls.slice(0, 3)) {
          menu.append(new MenuItem({
            label: `跳转到 ${formatUrl(url)}`,
            click: () => createWindow({ url })
          }))
        }
        hasEditItems = true
      }
      menu.append(new MenuItem({
        label: '复制',
        role: 'copy',
        accelerator: 'Ctrl+C'
      }))
      hasEditItems = true
    }

    if (params.mediaType === 'image') {
      menu.append(new MenuItem({
        label: '复制图片',
        click: async () => {
          const { clipboard, nativeImage } = require('electron')
          try {
            const response = await fetch(params.srcURL)
            const blob = await response.blob()
            const buffer = await blob.arrayBuffer()
            const image = nativeImage.createFromBuffer(Buffer.from(buffer))
            clipboard.writeImage(image)
          } catch (err) {
            clipboard.writeText(params.srcURL)
          }
        }
      }))
      menu.append(new MenuItem({
        label: '复制图片地址',
        click: () => {
          require('electron').clipboard.writeText(params.srcURL)
        }
      }))
      menu.append(new MenuItem({
        label: '另存为...',
        click: async () => {
          const { dialog } = require('electron')
          const fs = require('fs')
          let filename = 'image.png'
          let imgUrl = null

          if (params.srcURL.startsWith('data:')) {
            const match = params.srcURL.match(/data:image\/(\w+);base64,/)
            if (match) {
              filename = `image.${match[1]}`
            }
          } else {
            imgUrl = new URL(params.srcURL)
            filename = imgUrl.pathname.split('/').pop() || 'image.png'
          }

          const result = await dialog.showSaveDialog({
            defaultPath: path.join(downloadSettings.defaultPath, filename),
            filters: [
              { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
              { name: 'All Files', extensions: ['*'] }
            ]
          })

          if (!result.canceled && result.filePath) {
            const uniquePath = getUniqueFilePath(result.filePath)
            const downloadId = ++downloadIdCounter
            const downloadInfo = {
              id: downloadId,
              filename: path.basename(uniquePath),
              url: params.srcURL,
              totalBytes: 0,
              receivedBytes: 0,
              progress: 0,
              state: 'downloading',
              savePath: uniquePath
            }
            downloads.unshift(downloadInfo)
            saveDownloads()

            const mainWindow = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))
            if (mainWindow) {
              mainWindow.webContents.send('download-update', downloadInfo)
            }

            if (params.srcURL.startsWith('data:image/')) {
              const base64Data = params.srcURL.split(',')[1]
              fs.writeFileSync(uniquePath, Buffer.from(base64Data, 'base64'))
              downloadInfo.state = 'completed'
              downloadInfo.progress = 100
              downloadInfo.totalBytes = Buffer.from(base64Data, 'base64').length
              downloadInfo.receivedBytes = downloadInfo.totalBytes
            } else {
              const protocol = imgUrl.protocol === 'https:' ? require('https') : require('http')
              let receivedBytes = 0
              protocol.get(params.srcURL, (response) => {
                const totalBytes = parseInt(response.headers['content-length']) || 0
                downloadInfo.totalBytes = totalBytes
                
                const writeStream = fs.createWriteStream(uniquePath)
                response.on('data', (chunk) => {
                  receivedBytes += chunk.length
                  downloadInfo.receivedBytes = receivedBytes
                  downloadInfo.progress = totalBytes > 0 
                    ? Math.round((receivedBytes / totalBytes) * 100) 
                    : 0
                  if (mainWindow) {
                    mainWindow.webContents.send('download-update', downloadInfo)
                  }
                  saveDownloads()
                })
                response.on('end', () => {
                  downloadInfo.state = 'completed'
                  downloadInfo.progress = 100
                  downloadInfo.receivedBytes = receivedBytes
                  if (mainWindow) {
                    mainWindow.webContents.send('download-update', downloadInfo)
                  }
                  saveDownloads()
                })
                response.pipe(writeStream)
              })
            }
            
            if (params.srcURL.startsWith('data:image/')) {
              if (mainWindow) {
                mainWindow.webContents.send('download-update', downloadInfo)
              }
              saveDownloads()
            }
          }
        }
      }))
      hasEditItems = true
    }

    if (hasEditItems) {
      menu.append(new MenuItem({ type: 'separator' }))
    }

    menu.append(new MenuItem({
      label: '查看网页源代码',
      click: () => {
        createWindow({ url: 'view-source:' + webContents.getURL() })
      },
      accelerator: 'Ctrl+U'
    }))

    menu.append(new MenuItem({ type: 'separator' }))

    menu.append(new MenuItem({
      label: '检查',
      click: () => {
        webContents.inspectElement(params.x, params.y)
        if (!webContents.isDevToolsOpened()) {
          webContents.openDevTools()
        }
      },
      accelerator: 'F12'
    }))

    menu.popup({ window: win })
  })
}

function registerGlobalShortcuts() {
  globalShortcut.register('Alt+Right', () => {
    const focusedWin = BrowserWindow.getFocusedWindow()
    if (focusedWin) {
      const webContents = focusedWin.webContents
      if (webContents.canGoForward()) {
        webContents.goForward()
      }
    }
  })

  globalShortcut.register('Alt+Left', () => {
    const focusedWin = BrowserWindow.getFocusedWindow()
    if (focusedWin) {
      const webContents = focusedWin.webContents
      if (webContents.canGoBack()) {
        webContents.goBack()
      }
    }
  })

  globalShortcut.register('Ctrl+U', () => {
    const focusedWin = BrowserWindow.getFocusedWindow()
    if (focusedWin) {
      createWindow({ url: 'view-source:' + focusedWin.webContents.getURL() })
    }
  })

  globalShortcut.register('Ctrl+L', () => {
    toggleLyricInteractive()
  })
}

ipcMain.handle('open-url', (event, url) => {
  createWindow({ url })
})

ipcMain.handle('open-downloads', () => {
  createWindow({ downloadsPage: true })
})

ipcMain.handle('get-downloads', () => {
  return downloads
})

ipcMain.handle('delete-download', (event, { id, deleteFile }) => {
  const index = downloads.findIndex(d => d.id === id)
  if (index !== -1) {
    const download = downloads[index]
    downloads.splice(index, 1)
    saveDownloads()
    
    if (deleteFile && download.savePath) {
      try {
        fs.unlinkSync(download.savePath)
      } catch (err) {
        console.error('Failed to delete file:', err)
      }
    }
    
    return true
  }
  return false
})

ipcMain.handle('open-file-location', (event, filePath) => {
  try {
    shell.showItemInFolder(filePath)
    return true
  } catch (err) {
    console.error('Failed to open file location:', err)
    return false
  }
})

ipcMain.handle('open-file', (event, filePath) => {
  try {
    shell.openPath(filePath)
    return true
  } catch (err) {
    console.error('Failed to open file:', err)
    return false
  }
})

ipcMain.handle('get-download-settings', () => {
  return downloadSettings
})

ipcMain.handle('set-download-settings', (event, settings) => {
  downloadSettings = { ...downloadSettings, ...settings }
  saveSettings()
  return downloadSettings
})

let mainWindow = null
let lyricWindow = null
let lyricOwnerWindow = null
let isLyricInteractive = false
let lyricSettingsWindow = null

function createLyricWindow(ownerWin = null) {
  if (lyricWindow) {
    lyricWindow.focus()
    return
  }

  const screenWidth = require('electron').screen.getPrimaryDisplay().size.width
  const savedPos = downloadSettings.lyricWindowPosition || { x: Math.floor((screenWidth - 600) / 2), y: 100 }
  const savedSize = downloadSettings.lyricWindowSize || { width: 600, height: 150 }
  
  const win = new BrowserWindow({
    width: savedSize.width,
    height: savedSize.height,
    x: savedPos.x,
    y: savedPos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  })
  
  lyricWindow = win
  lyricOwnerWindow = ownerWin
  
  if (ownerWin) {
    ownerWin.on('closed', () => {
      if (lyricWindow && !lyricWindow.isDestroyed()) {
        lyricWindow.close()
        lyricWindow = null
        lyricOwnerWindow = null
      }
    })
  }

  lyricWindow.loadFile('desktop-lyric.html')

  lyricWindow.webContents.on('ready-to-show', () => {
    lyricWindow.setIgnoreMouseEvents(true)
  })

  lyricWindow.webContents.on('did-finish-load', () => {
    if (lyricWindow && !lyricWindow.isDestroyed()) {
      const defaultSettings = { ...downloadSettings.lyricSettings, fontFamily: 'Microsoft YaHei' }
      lyricWindow.webContents.send('lyric-settings-change', defaultSettings)
      setTimeout(() => {
        if (lyricWindow && !lyricWindow.isDestroyed()) {
          lyricWindow.webContents.send('lyric-settings-change', downloadSettings.lyricSettings)
        }
      }, 300)
    }
  })

  lyricWindow.on('closed', () => {
    lyricWindow = null
  })

  lyricWindow.on('resize', () => {
    const [width, height] = lyricWindow.getSize()
    downloadSettings.lyricWindowSize = { width, height }
    saveSettings()
  })
}

function setLyricWindowInteractive(interactive) {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    isLyricInteractive = interactive
    lyricWindow.setIgnoreMouseEvents(!interactive)
    lyricWindow.webContents.send('lyric-interactive-change', interactive)
  }
}

function toggleLyricInteractive() {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    setLyricWindowInteractive(!isLyricInteractive)
  }
}

function updateLyricWindow(data) {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.webContents.send('lyric-update', { type: 'LYRIC_UPDATE', ...data });
  }
}

function createLyricSettingsWindow() {
  if (lyricSettingsWindow) {
    lyricSettingsWindow.focus()
    return
  }

  lyricSettingsWindow = new BrowserWindow({
    width: 540,
    height: 600,
    frame: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  lyricSettingsWindow.loadFile('lyric-settings.html')

  lyricSettingsWindow.on('closed', () => {
    lyricSettingsWindow = null
  })
}

ipcMain.handle('select-download-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: downloadSettings.defaultPath
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      downloadSettings.defaultPath = result.filePaths[0]
      saveSettings()
      return downloadSettings.defaultPath
    }
    return null
  })

ipcMain.handle('zoom-in', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    const currentZoom = win.webContents.getZoomLevel()
    win.webContents.setZoomLevel(Math.min(currentZoom + 0.5, 3))
  }
})

ipcMain.handle('zoom-out', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    const currentZoom = win.webContents.getZoomLevel()
    win.webContents.setZoomLevel(Math.max(currentZoom - 0.5, 0.25))
  }
})

ipcMain.handle('open-desktop-lyric', (event) => {
  const ownerWin = BrowserWindow.fromWebContents(event.sender)
  createLyricWindow(ownerWin)
})

ipcMain.handle('close-desktop-lyric', () => {
  if (lyricWindow) {
    lyricWindow.close()
    lyricWindow = null
  }
})

ipcMain.handle('update-desktop-lyric', (event, data) => {
  updateLyricWindow(data)
})

ipcMain.handle('toggle-lyric-interactive', (event, interactive) => {
  setLyricWindowInteractive(interactive)
})

ipcMain.handle('move-lyric-window', (event, { x, y }) => {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.setPosition(x, y)
    downloadSettings.lyricWindowPosition = { x, y }
    saveSettings()
  }
})

ipcMain.handle('get-lyric-window-position', () => {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    return lyricWindow.getPosition()
  }
  return [0, 0]
})

ipcMain.handle('open-lyric-settings', () => {
  createLyricSettingsWindow()
})

ipcMain.handle('get-lyric-settings', () => {
  return downloadSettings.lyricSettings
})

ipcMain.handle('save-lyric-settings', (event, settings) => {
  downloadSettings.lyricSettings = { ...downloadSettings.lyricSettings, ...settings }
  saveSettings()
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.webContents.send('lyric-settings-change', downloadSettings.lyricSettings)
  }
  return downloadSettings.lyricSettings
})

ipcMain.handle('get-system-fonts', async () => {
  const { execSync } = require('child_process')
  const fontInfoList = []
  const seenNames = new Set()
  
  if (process.platform === 'win32') {
    try {
      const psScript = `Add-Type -AssemblyName System.Drawing; $ifc = New-Object System.Drawing.Text.InstalledFontCollection; $ifc.Families | ForEach-Object { $_.Name + '|' + $_.GetName(1033) }`
      const output = execSync(`powershell -Command "${psScript}"`, { encoding: 'utf-8' })
      const lines = output.split('\n')
      lines.forEach(line => {
        const parts = line.trim().split('|')
        if (parts.length >= 2) {
          const familyName = parts[0].trim()
          const displayName = parts[1].trim()
          if (familyName.length > 0 && !seenNames.has(familyName)) {
            seenNames.add(familyName)
            fontInfoList.push({
              familyName: familyName,
              displayName: displayName || familyName
            })
          }
        }
      })
    } catch (e) {
      console.error('Failed to get fonts via PowerShell:', e)
    }
  }
  
  if (fontInfoList.length === 0) {
    const defaults = ['Microsoft YaHei', 'SimSun', 'SimHei', 'KaiTi', 'FangSong', 'Arial', 'Times New Roman']
    defaults.forEach(name => {
      fontInfoList.push({ familyName: name, displayName: name })
    })
  }
  
  return fontInfoList.sort((a, b) => a.displayName.localeCompare(b.displayName))
})

ipcMain.handle('get-font-data-url', async (_, fontFamily) => {
  const { execSync } = require('child_process')
  const fs = require('fs')
  const path = require('path')
  
  function pathToFileUrl(p) {
    return 'file:///' + p.replace(/\\/g, '/')
  }
  
  function findFontFile(fontFamily) {
    try {
      const fontKeyScript = `(Get-Item 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts').Property | Where-Object { $_ -match '${fontFamily}' } | Select-Object -First 1`
      const fontKey = execSync(`powershell -Command "${fontKeyScript}"`, { encoding: 'utf-8' }).trim()
      
      if (fontKey) {
        const fontPathScript = `(Get-Item 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts').GetValue('${fontKey}')`
        const fontFileName = execSync(`powershell -Command "${fontPathScript}"`, { encoding: 'utf-8' }).trim()
        
        if (fontFileName) {
          const fullPath = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', fontFileName)
          if (fs.existsSync(fullPath)) return fullPath
        }
      }
      
      const userFontKeyScript = `(Get-Item 'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts').Property | Where-Object { $_ -match '${fontFamily}' } | Select-Object -First 1`
      const userFontKey = execSync(`powershell -Command "${userFontKeyScript}"`, { encoding: 'utf-8' }).trim()
      
      if (userFontKey) {
        const fontPathScript = `(Get-Item 'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts').GetValue('${userFontKey}')`
        const fontFileName = execSync(`powershell -Command "${fontPathScript}"`, { encoding: 'utf-8' }).trim()
        
        if (fontFileName) {
          if (path.isAbsolute(fontFileName) && fs.existsSync(fontFileName)) return fontFileName
          const userFullPath = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', fontFileName)
          if (fs.existsSync(userFullPath)) return userFullPath
        }
      }
    } catch (e) {
      console.error('Failed to find font file:', e)
    }
    return null
  }
  
  if (process.platform === 'win32') {
    const fontPath = findFontFile(fontFamily)
    if (fontPath) {
      const stat = fs.statSync(fontPath)
      if (stat.size > 5 * 1024 * 1024) {
        return pathToFileUrl(fontPath)
      }
      const buffer = fs.readFileSync(fontPath)
      const ext = path.extname(fontPath).toLowerCase()
      let mimeType = 'font/truetype'
      if (ext === '.otf') mimeType = 'font/opentype'
      if (ext === '.woff') mimeType = 'font/woff'
      if (ext === '.woff2') mimeType = 'font/woff2'
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    }
  }
  
  return null
})



app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  loadDownloads()
  loadSettings()
  registerGlobalShortcuts()
  setupDownloadHandler()
  createWindow({ preload: true })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({ preload: true })
    }
  })
})

app.on('before-quit', () => {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.close()
  }
  if (lyricSettingsWindow && !lyricSettingsWindow.isDestroyed()) {
    lyricSettingsWindow.close()
  }
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})