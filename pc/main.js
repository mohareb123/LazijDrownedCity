// Lazij: Drowned City — Electron launcher
const { app, BrowserWindow, Menu, shell, globalShortcut } = require('electron');
const path = require('path');

// GPU resilience on mixed desktop hardware (fallback to software WebGL if needed)
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0a0e1c',
    title: 'Lazij: Drowned City',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      spellcheck: false,
      devTools: true
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  globalShortcut.register('F11', () => {
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  globalShortcut.register('Escape', () => {
    if (win && win.isFullScreen()) win.setFullScreen(false);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
