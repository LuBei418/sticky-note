const { app, BrowserWindow, ipcMain, screen, Menu, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// 打包后数据放在 exe 同目录，开发时放在源码目录
const APP_ROOT = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const DATA_FILE = path.join(APP_ROOT, 'data.json');

let win = null;
let store = { tasks: [], topmost: true, window: null };
let saveTimer = null;
/* 面板展开/收起的程序性改窗口高度，不该被记进 store.window */
let suppressBoundsUntil = 0;

function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') store = Object.assign(store, obj);
  } catch (_) { /* 首次运行没有数据文件 */ }
}

function writeStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('保存失败', e);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (Date.now() < suppressBoundsUntil) return; // 面板伸缩造成的窗口变化不落盘
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      store.window = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    writeStore();
  }, 350);
}

/* ---------- 右下角贴纸 ---------- */
const STICKER_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
/* 旧版「去背」遗留清理：删掉蒙版文件和字段 */
const CUT_FILE = path.join(APP_ROOT, 'sticker-cut.png');

function removeCutFile() {
  if (fs.existsSync(CUT_FILE)) {
    try { fs.unlinkSync(CUT_FILE); } catch (_) {}
  }
  delete store.stickerCut;
}

function stickerUrl() {
  if (!store.sticker) return null;
  const p = path.join(APP_ROOT, store.sticker);
  if (!fs.existsSync(p)) return null;
  return pathToFileURL(p).href;
}

/* 粗略判断图片有没有透明通道（决定贴纸默认样式） */
function detectHasAlpha(file) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.bmp') return false;
    if (ext === '.png') {
      const b = fs.readFileSync(file);
      if (b.length > 26 && b.readUInt32BE(12) === 0x49484452) {
        const colorType = b[25]; // 0灰度 2RGB 4灰+α 6RGBA
        return colorType === 4 || colorType === 6;
      }
      return true;
    }
    return true; // gif / webp 默认当透明处理
  } catch (_) {
    return true;
  }
}

function setStickerFrom(srcPath) {
  try {
    const ext = path.extname(srcPath || '').toLowerCase();
    if (!STICKER_EXTS.includes(ext)) {
      return { ok: false, error: '仅支持 png / jpg / gif / webp / bmp 图片' };
    }
    for (const e of STICKER_EXTS) {
      const f = path.join(APP_ROOT, 'sticker' + e);
      if (e !== ext && fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    }
    const dest = path.join(APP_ROOT, 'sticker' + ext);
    fs.copyFileSync(srcPath, dest);
    removeCutFile();
    store.sticker = 'sticker' + ext;
    writeStore();
    return { ok: true, url: pathToFileURL(dest).href, hasAlpha: detectHasAlpha(dest) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

ipcMain.handle('sticker:pick', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择贴纸图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
  return setStickerFrom(r.filePaths[0]);
});

ipcMain.handle('sticker:set', (_e, p) => setStickerFrom(p));

ipcMain.handle('sticker:clear', () => {
  for (const e of STICKER_EXTS) {
    const f = path.join(APP_ROOT, 'sticker' + e);
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
  }
  removeCutFile();
  store.sticker = null;
  writeStore();
  return { ok: true };
});

function safeBounds(w) {
  const def = { width: 330, height: 460 };
  if (!w || typeof w.width !== 'number') return def;
  const area = screen.getDisplayNearestPoint({ x: w.x || 0, y: w.y || 0 }).workArea;
  const width = Math.max(260, Math.min(w.width, area.width));
  const height = Math.max(240, Math.min(w.height, area.height));
  let x = typeof w.x === 'number' ? w.x : area.x + area.width - width - 40;
  let y = typeof w.y === 'number' ? w.y : area.y + 80;
  x = Math.min(Math.max(x, area.x - 20), area.x + area.width - 80);
  y = Math.min(Math.max(y, area.y - 10), area.y + area.height - 80);
  return { x, y, width, height };
}

function createWindow() {
  readStore();
  const b = safeBounds(store.window);

  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    minWidth: 260,
    minHeight: 240,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: '待办便签',
    icon: path.join(__dirname, 'cat.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.setAlwaysOnTop(store.topmost !== false, 'floating');
  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', () => win.show());
  win.on('moved', scheduleSave);
  win.on('resized', scheduleSave);
  win.on('closed', () => { win = null; });

  // 开发自检：STICKY_SHOT=输出路径 时截图后退出（正常使用不会触发）
  if (process.env.STICKY_SHOT) {
    setTimeout(async () => {
      try {
        if (process.env.STICKY_TEST) {
          const code = fs.readFileSync(process.env.STICKY_TEST, 'utf8');
          await win.webContents.executeJavaScript(code);
          await new Promise((r) => setTimeout(r, 700));
        }
        const img = await win.capturePage();
        fs.writeFileSync(process.env.STICKY_SHOT, img.toPNG());
      } catch (e) {
        console.error('自检失败', e);
      }
      app.quit();
    }, 1500);
  }
}

ipcMain.handle('store:load', () => ({
  tasks: Array.isArray(store.tasks) ? store.tasks : [],
  topmost: store.topmost !== false,
  opacity: typeof store.opacity === 'number' ? store.opacity : 100,
  sticker: stickerUrl(),
  stickerSize: typeof store.stickerSize === 'number' ? store.stickerSize : 110,
  stickerInk: typeof store.stickerInk === 'number' ? store.stickerInk : 100,
  stickerStyle: typeof store.stickerStyle === 'string' ? store.stickerStyle : 'plain',
  stickerBlend: !!store.stickerBlend,
  stickerX: typeof store.stickerX === 'number' ? store.stickerX : null,
  stickerY: typeof store.stickerY === 'number' ? store.stickerY : null,
  panelOpen: !!store.panelOpen,
  fresh: !fs.existsSync(DATA_FILE)
}));

ipcMain.handle('store:save', (_e, payload) => {
  if (payload && Array.isArray(payload.tasks)) {
    store.tasks = payload.tasks;
    store.topmost = payload.topmost !== false;
    if (typeof payload.opacity === 'number') store.opacity = payload.opacity;
    if (typeof payload.stickerSize === 'number') store.stickerSize = payload.stickerSize;
    if (typeof payload.stickerInk === 'number') store.stickerInk = payload.stickerInk;
    if (typeof payload.stickerStyle === 'string') store.stickerStyle = payload.stickerStyle;
    if (typeof payload.stickerBlend === 'boolean') store.stickerBlend = payload.stickerBlend;
    if (typeof payload.stickerX === 'number') store.stickerX = payload.stickerX;
    if (typeof payload.stickerY === 'number') store.stickerY = payload.stickerY;
    if (typeof payload.panelOpen === 'boolean') store.panelOpen = payload.panelOpen;
  }
  scheduleSave();
  return true;
});

ipcMain.handle('win:topmost', (_e, value) => {
  const on = !!value;
  if (win) win.setAlwaysOnTop(on, 'floating');
  store.topmost = on;
  scheduleSave();
  return on;
});

ipcMain.handle('win:close', () => {
  if (win) {
    const b = win.getBounds();
    store.window = { x: b.x, y: b.y, width: b.width, height: b.height };
    writeStore();
    win.destroy();
  }
  app.quit();
});

ipcMain.handle('win:set-size', (_e, { width, height }) => {
  if (!win) return;
  const w = Math.max(260, Math.round(width));
  const h = Math.max(240, Math.round(height));
  const b = win.getBounds();
  win.setBounds({ x: b.x, y: b.y, width: w, height: h });
});

/* 面板展开/收起：窗口向下伸长/收回 delta 像素（不写入 store.window） */
ipcMain.handle('win:reserve-panel', (_e, delta) => {
  if (!win) return;
  const d = Math.round(Number(delta) || 0);
  if (!d) return;
  const b = win.getBounds();
  const area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  const maxH = area.y + area.height - b.y;
  const h = Math.max(240, Math.min(b.height + d, Math.max(240, maxH)));
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: h });
  suppressBoundsUntil = Date.now() + 900;
});

ipcMain.handle('ui:menu', (_e, payload) => {
  const { kind, id, text } = payload || {};
  let items = [];

  if (kind === 'done-section') {
    items = [{ label: '清除已完成', click: () => send('clear-done') }];
  } else if (kind === 'sticker') {
    items = [
      { label: '更换图片', click: () => send('sticker-change') },
      { type: 'separator' },
      { label: '移除图片', click: () => send('sticker-clear') }
    ];
  } else if (kind === 'card') {
    items = payload.hasSticker
      ? [
          { label: '更换贴纸图片', click: () => send('sticker-change') },
          { label: '移除贴纸', click: () => send('sticker-clear') }
        ]
      : [{ label: '插入贴纸图片', click: () => send('sticker-insert') }];
  } else {
    items = [
      { label: '编辑', click: () => send('edit', id) },
      { label: '复制文字', click: () => clipboard.writeText(text || '') },
      { type: 'separator' },
      { label: '删除', click: () => send('delete', id) }
    ];
  }

  function send(action, tid) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('menu:action', { action, id: tid });
    }
  }

  Menu.buildFromTemplate(items).popup({ window: win });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
