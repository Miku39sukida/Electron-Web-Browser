const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openDownloads: () => ipcRenderer.invoke('open-downloads'),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  deleteDownload: ({ id, deleteFile }) => ipcRenderer.invoke('delete-download', { id, deleteFile }),
  openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  onDownloadUpdate: (callback) => ipcRenderer.on('download-update', (event, info) => callback(info)),
  getDownloadSettings: () => ipcRenderer.invoke('get-download-settings'),
  setDownloadSettings: (settings) => ipcRenderer.invoke('set-download-settings', settings),
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
  zoomIn: () => ipcRenderer.invoke('zoom-in'),
  zoomOut: () => ipcRenderer.invoke('zoom-out'),
  
  openDesktopLyric: () => ipcRenderer.invoke('open-desktop-lyric'),
  closeDesktopLyric: () => ipcRenderer.invoke('close-desktop-lyric'),
  updateDesktopLyric: (data) => ipcRenderer.invoke('update-desktop-lyric', data),
  cacheLyricData: (data) => ipcRenderer.invoke('cache-lyric-data', data),
  syncPlaybackState: (data) => ipcRenderer.invoke('sync-playback-state', data),
  clearDesktopLyric: () => ipcRenderer.invoke('clear-desktop-lyric'),
  toggleLyricInteractive: (interactive) => ipcRenderer.invoke('toggle-lyric-interactive', interactive),
  moveLyricWindow: (x, y) => ipcRenderer.invoke('move-lyric-window', { x, y }),
  getLyricWindowPosition: () => ipcRenderer.invoke('get-lyric-window-position'),
  openLyricSettings: () => ipcRenderer.invoke('open-lyric-settings'),
  getLyricSettings: () => ipcRenderer.invoke('get-lyric-settings'),
  saveLyricSettings: (settings) => ipcRenderer.invoke('save-lyric-settings', settings),
  getSystemFonts: () => ipcRenderer.invoke('get-system-fonts'),
  getFontDataUrl: (fontFamily) => ipcRenderer.invoke('get-font-data-url', fontFamily),
  isElectron: () => true,
  onLyricUpdate: (callback) => ipcRenderer.on('lyric-update', (event, data) => callback(data)),
  onLyricInteractiveChange: (callback) => ipcRenderer.on('lyric-interactive-change', (event, data) => callback(data)),
  onLyricSettingsChange: (callback) => ipcRenderer.on('lyric-settings-change', (event, data) => callback(data))
})

window.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    if (e.deltaY < 0) {
      ipcRenderer.invoke('zoom-in')
    } else {
      ipcRenderer.invoke('zoom-out')
    }
  }
}, { passive: false })


