const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

// 未保存の変更があるか（レンダラーから通知される）
let dirty = false;

ipcMain.on('set-dirty', (_event, value) => {
  dirty = Boolean(value);
});

// targetPath があればそこへ上書き、なければ保存先を聞く。保存したパスを返す（キャンセル時は null）
ipcMain.handle('save-png', async (event, bytes, targetPath, defaultPath) => {
  let filePath = targetPath;
  if (!filePath) {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'スキンを保存',
      defaultPath: defaultPath || 'minecraft_skin.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, Buffer.from(bytes));
  return filePath;
});

function createWindow() {
  dirty = false;

  const win = new BrowserWindow({
    width: 1300,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Minecraft Skin Editor',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'icon.png'),
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('close', (event) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['保存せずに閉じる', 'キャンセル'],
      defaultId: 1,
      cancelId: 1,
      message: '保存していない変更があります',
      detail: '閉じると変更は失われます。',
    });
    if (choice === 1) event.preventDefault();
  });

  // シンプルなメニュー
  const menu = Menu.buildFromTemplate([
    {
      label: 'ファイル',
      submenu: [
        { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: 'デベロッパーツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'ズームリセット' },
        { role: 'zoomIn', label: 'ズームイン' },
        { role: 'zoomOut', label: 'ズームアウト' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全画面' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
