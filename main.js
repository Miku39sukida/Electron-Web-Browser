const { app, BrowserWindow, ipcMain, Menu, MenuItem, globalShortcut, dialog, shell, protocol, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')

// 注册自定义字体协议（必须在 app.whenReady 之前）
protocol.registerSchemesAsPrivileged([{
  scheme: 'font-asset',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}])

const downloads = []
let downloadIdCounter = 0
let downloadSettings = {
  defaultPath: app.getPath('downloads'),
  askForPath: false,
  searchEngine: 'google',
  lyricWindowPosition: { x: 0, y: 100 },
  lyricWindowSize: { width: 600, height: 150 },
  lyricSettings: {
    textColor: '#ffffff',
    strokeColor: '#000000',
    fontSize: 28,
    fontFamily: 'Microsoft YaHei',
    fontFallback: 'Microsoft YaHei',
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
          fontFallback: 'Microsoft YaHei',
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

  const updateFaviconFromUrl = async (faviconUrl) => {
    if (!faviconUrl) return
    try {
      const { net } = require('electron')
      const response = await net.fetch(faviconUrl)
      const buffer = Buffer.from(await response.arrayBuffer())
      console.log('Favicon buffer size:', buffer.length)
      
      const tempPath = path.join(app.getPath('temp'), 'favicon_' + Date.now() + '.ico')
      fs.writeFileSync(tempPath, buffer)
      
      const img = nativeImage.createFromPath(tempPath)
      console.log('Image from path size:', img.getSize(), 'isEmpty:', img.isEmpty())
      
      if (!img.isEmpty()) {
        win.setIcon(img)
        console.log('Window icon set successfully')
      } else {
        console.log('Image from path is empty, trying Buffer')
        const img2 = nativeImage.createFromBuffer(buffer)
        console.log('Image from buffer size:', img2.getSize(), 'isEmpty:', img2.isEmpty())
        if (!img2.isEmpty()) {
          win.setIcon(img2)
          console.log('Window icon set with buffer method')
        }
      }
      
      setTimeout(() => {
        try { fs.unlinkSync(tempPath) } catch (e) {}
      }, 10000)
    } catch (err) {
      console.error('Failed to set window icon:', err.message)
    }
  }

  win.webContents.on('page-favicon-updated', (event, favicons) => {
    console.log('page-favicon-updated triggered with', favicons.length, 'favicons')
    if (favicons && favicons.length > 0) {
      updateFaviconFromUrl(favicons[0])
    }
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
    } else if (input.key === 'F5' && (input.control || input.meta)) {
      event.preventDefault()
      webContents.reloadIgnoringCache()
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

    menu.append(new MenuItem({
      label: '强制重新加载',
      click: () => webContents.reloadIgnoringCache(),
      accelerator: 'Ctrl+F5'
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

ipcMain.handle('get-search-engine', () => {
  return downloadSettings.searchEngine || 'google'
})

ipcMain.handle('set-search-engine', (event, engine) => {
  downloadSettings.searchEngine = engine
  saveSettings()
  return downloadSettings.searchEngine
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

  lyricWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      event.preventDefault();
      if (lyricWindow.webContents.isDevToolsOpened()) {
        lyricWindow.webContents.closeDevTools();
      } else {
        lyricWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  lyricWindow.webContents.on('ready-to-show', () => {
    lyricWindow.setIgnoreMouseEvents(true)
  })

  lyricWindow.webContents.on('did-finish-load', () => {
    if (lyricWindow && !lyricWindow.isDestroyed()) {
      // 页面完全加载后，发送一次设置作为兜底
      // HTML 端的 loadSettings() 已处理初始加载，这里仅作为备用
      setTimeout(() => {
        if (lyricWindow && !lyricWindow.isDestroyed()) {
          lyricWindow.webContents.send('lyric-settings-change', downloadSettings.lyricSettings)
        }
      }, 500)
    }
  })

  lyricWindow.on('closed', () => {
    stopLyricBgPush();
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

// ============ 桌面歌词主进程推送（绕过 Chromium 节流） ============
// Chromium 在窗口最小化/隐藏时会将渲染进程的 setInterval/requestAnimationFrame
// 节流到 1Hz，即使设置了 backgroundThrottling: false 也无效（且 visibilitychange
// 也不会触发）。解决方案：主进程 Node.js 定时器始终推送，不受节流影响。
// 渲染端通过 rAF 定期同步音频时间，主进程用墙钟时间插值估算当前位置。
let cachedLyricLines = [];
let cachedLoopStartS = 0;
let cachedLoopDurS = 0;
let syncedAudioTime = 0;        // 渲染端最近同步的音频时间
let syncedWallClock = 0;        // 渲染端最近同步的墙钟时间
let prevEstimatedTime = 0;      // 上次估算的音频时间（用于检测循环回绕）
let lyricBgPushTimer = null;
let lastPushedIdx = 0;          // 上次推送的歌词行索引（用于优化搜索）

function startLyricBgPush() {
  if (lyricBgPushTimer) return;

  // Node.js setInterval 完全不受 Chromium 节流，16ms ≈ 60fps
  lyricBgPushTimer = setInterval(() => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return;
    if (cachedLyricLines.length === 0) return;
    if (syncedWallClock === 0) return; // 还未收到渲染端同步

    // 用墙钟时间估算当前音频位置（音频时钟与墙钟同步推进）
    const now = Date.now();
    let estimatedTime = syncedAudioTime + (now - syncedWallClock) / 1000;

    // 处理循环回绕（与渲染端 currentPlaySec 逻辑一致）
    if (cachedLoopDurS > 0 && estimatedTime >= cachedLoopStartS) {
      const into = (estimatedTime - cachedLoopStartS) % cachedLoopDurS;
      estimatedTime = cachedLoopStartS + into;
    }

    // 检测循环回绕：如果时间往回跳，从头搜索歌词行
    let startIdx = 0;
    if (estimatedTime >= prevEstimatedTime) {
      // 时间前进：从上次位置继续搜索（需要记录上次 idx）
      startIdx = lastPushedIdx;
    }
    prevEstimatedTime = estimatedTime;

    let idx = startIdx;
    while (idx < cachedLyricLines.length - 1 && cachedLyricLines[idx + 1].time_sec <= estimatedTime) {
      idx++;
    }
    lastPushedIdx = idx;

    const line = cachedLyricLines[idx] || cachedLyricLines[0];
    const nextLine = cachedLyricLines[idx + 1];

    lyricWindow.webContents.send('lyric-update', {
      type: 'LYRIC_UPDATE',
      text: line.text || '',
      translation: line.translation || '',
      karaoke: line.karaoke || [],
      lineEndTime: nextLine ? nextLine.time_sec : null,
      currentTime: estimatedTime
    });
  }, 16);
}

function stopLyricBgPush() {
  if (lyricBgPushTimer) {
    clearInterval(lyricBgPushTimer);
    lyricBgPushTimer = null;
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

// 缓存歌词数据（渲染端在歌词/循环参数变化时同步到主进程）
// 当有歌词数据时自动启动主进程推送；无数据时自动停止
ipcMain.handle('cache-lyric-data', (event, data) => {
  cachedLyricLines = data.lines || [];
  cachedLoopStartS = data.loopStartS || 0;
  cachedLoopDurS = data.loopDurS || 0;
  if (cachedLyricLines.length > 0) {
    startLyricBgPush();
  } else {
    stopLyricBgPush();
  }
})

// 接收渲染端音频时间同步（渲染端在 rAF 回调中频繁调用）
// 主进程用此值 + 墙钟时间插值估算当前音频位置，即使渲染端被节流也能保持准确
ipcMain.handle('sync-playback-state', (event, data) => {
  syncedAudioTime = data.audioTime || 0;
  syncedWallClock = data.wallClock || Date.now();
})

// 清空桌面歌词并停止推送（停止播放时调用）
ipcMain.handle('clear-desktop-lyric', () => {
  stopLyricBgPush();
  cachedLyricLines = [];
  syncedAudioTime = 0;
  syncedWallClock = 0;
  prevEstimatedTime = 0;
  lastPushedIdx = 0;
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.webContents.send('lyric-update', {
      type: 'LYRIC_UPDATE',
      text: '',
      translation: '',
      karaoke: [],
      lineEndTime: null,
      currentTime: 0
    });
  }
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
  const fs = require('fs')
  const path = require('path')
  const fontInfoList = []
  const seenNames = new Set()

  if (process.platform === 'win32') {
    try {
      const fontDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
      const regKeys = [
        'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
        'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
      ]

      for (const regKey of regKeys) {
        try {
          const buffer = execSync(`chcp 65001 >nul && reg query "${regKey}"`)
          const output = buffer.toString('utf8')
          const lines = output.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('HKEY_')) continue
            const match = trimmed.match(/^(.+?)\s+REG_\w+\s+(.+)$/)
            if (!match) continue
            const name = match[1].trim()
            const value = match[2].trim()
            if (!name || !value) continue

            const fileName = path.basename(value)
            let filePath = value
            if (!path.isAbsolute(filePath)) {
              filePath = path.join(fontDir, fileName)
            }

            const displayName = name.replace(/\s*\(TrueType\)$/i, '').replace(/\s*\(OpenType\)$/i, '').trim()
            // 提取更简洁的家族名作为主标识
            const familyName = displayName
              .replace(/\s*\(TrueType\)$/i, '')
              .replace(/\s*\(OpenType\)$/i, '')
              .replace(/\s*&\s*.+$/, '')        // 去除 "& ..." 后缀
              .replace(/\s+(Regular|Bold|Light|Medium|Black|Thin|ExtraLight|SemiBold|Heavy)\s*$/i, '')
              .trim()

            if (familyName && !seenNames.has(familyName)) {
              seenNames.add(familyName)
              fontInfoList.push({
                familyName: familyName,
                displayName: displayName
              })
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      console.error('Failed to get fonts via reg:', e)
    }
  }

  if (fontInfoList.length === 0) {
    const defaults = ['Microsoft YaHei', 'SimSun', 'SimHei', 'KaiTi', 'FangSong', 'Arial', 'Times New Roman']
    defaults.forEach(name => {
      fontInfoList.push({ familyName: name, displayName: name })
    })
  }

  return fontInfoList.sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'))
})

let fontFileMap = null

function buildFontFileMap() {
  if (fontFileMap) return fontFileMap
  const { execSync } = require('child_process')
  const path = require('path')
  fontFileMap = new Map()

  if (process.platform !== 'win32') return fontFileMap

  const fontDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
  const regKeys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
  ]

  for (const regKey of regKeys) {
    try {
      const buffer = execSync(`chcp 65001 >nul && reg query "${regKey}"`)
      const output = buffer.toString('utf8')
      const lines = output.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('HKEY_')) continue
        const match = trimmed.match(/^(.+?)\s+REG_\w+\s+(.+)$/)
        if (!match) continue
        const name = match[1].trim()
        const value = match[2].trim()
        if (!name || !value) continue

        const displayName = name.replace(/\s*\(TrueType\)$/i, '').replace(/\s*\(OpenType\)$/i, '').trim()
        const fileName = path.basename(value)
        let filePath = value
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(fontDir, fileName)
        }

        const key = displayName.toLowerCase()
        if (!fontFileMap.has(key)) {
          fontFileMap.set(key, filePath)
        }

        // 添加简化名作为附加查找键
        // 例如 "Noto Sans CJK KR Regular & Noto Sans CJK SC Regular" 也能通过 "Noto Sans CJK KR" 查找
        const simplified = displayName
          .replace(/\s*\(TrueType\)$/i, '')
          .replace(/\s*\(OpenType\)$/i, '')
          .replace(/\s*&\s*.+$/, '')
          .replace(/\s+(Regular|Bold|Light|Medium|Black|Thin|ExtraLight|SemiBold|Heavy)\s*$/i, '')
          .trim()
        if (simplified && simplified !== displayName) {
          const simpKey = simplified.toLowerCase()
          if (!fontFileMap.has(simpKey)) {
            fontFileMap.set(simpKey, filePath)
          }
        }

        // 额外：按字体文件名（不含扩展名）索引
        const nameWithoutExt = path.basename(fileName, path.extname(fileName))
        if (nameWithoutExt) {
          const extKey = nameWithoutExt.toLowerCase()
          if (!fontFileMap.has(extKey)) {
            fontFileMap.set(extKey, filePath)
          }
        }
      }
    } catch (_) {}
  }

  return fontFileMap
}

ipcMain.handle('get-search-suggestions', async (_, keyword) => {
  if (!keyword || keyword.trim().length === 0) {
    return []
  }
  try {
    const { net } = require('electron')
    const encodedKeyword = encodeURIComponent(keyword.trim())
    const response = await net.fetch(`https://www.baidu.com/sugrec?ie=utf-8&json=1&prod=pc&wd=${encodedKeyword}`)
    const text = await response.text()
    const data = JSON.parse(text)
    if (data.g && Array.isArray(data.g)) {
      return data.g.map(item => item.q).filter(q => q)
    }
    return []
  } catch (err) {
    console.error('Failed to get search suggestions:', err.message)
    return []
  }
})

ipcMain.handle('get-font-data-url', async (_, fontFamily) => {
  const fs = require('fs')
  const path = require('path')

  function findFontFile(ff) {
    const map = buildFontFileMap()
    const key = ff.toLowerCase()
    if (map.has(key)) {
      const fp = map.get(key)
      if (fs.existsSync(fp)) return fp
    }
    // 精确子串匹配
    for (const [k, v] of map.entries()) {
      if (k === key || k.includes(key) || key.includes(k)) {
        if (fs.existsSync(v)) return v
      }
    }
    // 去除字重后缀后再匹配
    const withoutWeight = key.replace(/\s+(regular|bold|light|medium|black|thin|extralight|semibold|heavy)$/i, '').trim()
    if (withoutWeight !== key) {
      for (const [k, v] of map.entries()) {
        if (k.includes(withoutWeight) || withoutWeight.includes(k)) {
          if (fs.existsSync(v)) return v
        }
      }
    }
    // 按文件名查找（适用于自定义字体如 "851手書き雑"）
    for (const [k, v] of map.entries()) {
      const fileName = path.basename(v, path.extname(v)).toLowerCase()
      if (fileName === key || fileName.includes(key) || key.includes(fileName)) {
        if (fs.existsSync(v)) return v
      }
    }
    return null
  }

  if (process.platform === 'win32') {
    const fontPath = findFontFile(fontFamily)
    if (fontPath) {
      // 返回自定义协议 URL（IPC 只传字符串，不传大 ArrayBuffer）
      return 'font-asset://font?path=' + encodeURIComponent(fontPath)
    }
  }

  return null
})



app.whenReady().then(() => {
  // 注册字体协议处理器（流式传输，支持大文件）
  protocol.handle('font-asset', async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.searchParams.get('path'))
      if (!fs.existsSync(filePath)) {
        return new Response('Font not found', { status: 404 })
      }
      const stat = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      let mimeType = 'font/ttf'
      if (ext === '.otf') mimeType = 'font/otf'
      if (ext === '.ttc') mimeType = 'font/ttc'
      if (ext === '.woff') mimeType = 'font/woff'
      if (ext === '.woff2') mimeType = 'font/woff2'
      
      // 用 ReadableStream 流式传输，支持大文件
      const fileStream = fs.createReadStream(filePath)
      const { Readable } = require('stream')
      const readableStream = Readable.toWeb(fileStream)
      
      return new Response(readableStream, {
        headers: {
          'Content-Type': mimeType,
          'Content-Length': stat.size.toString(),
          'Cache-Control': 'public, max-age=31536000'
        }
      })
    } catch (e) {
      console.error('font-asset protocol error:', e)
      return new Response('Font load error: ' + e.message, { status: 500 })
    }
  })

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
  stopLyricBgPush();
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