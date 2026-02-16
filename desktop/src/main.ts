import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  session,
  shell,
} from "electron";
import path from "path";

const DEFAULT_APP_URL = "https://kali113.github.io/Anglicus/";
const APP_URL = resolveAppUrl(process.env.ANGLICUS_URL);
const APP_NAME = "Anglicus";
const APP_ID = "io.github.kali113.anglicus";
const APP_ORIGIN = new URL(APP_URL).origin;
const ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function resolveAppUrl(rawUrl?: string): string {
  if (!rawUrl) return DEFAULT_APP_URL;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return DEFAULT_APP_URL;
    }
    return parsed.toString();
  } catch {
    return DEFAULT_APP_URL;
  }
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Anglicus",
        click: () => showMainWindow(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => showMainWindow());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeHttpUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const nextOrigin = new URL(url).origin;
      if (nextOrigin !== APP_ORIGIN) {
        event.preventDefault();
        if (isSafeHttpUrl(url)) {
          void shell.openExternal(url);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.once("ready-to-show", () => {
    const { wasOpenedAtLogin } = app.getLoginItemSettings();
    if (!wasOpenedAtLogin) {
      mainWindow?.show();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        if (permission !== "notifications") {
          callback(false);
          return;
        }

        const requestUrl = webContents.getURL();
        if (!requestUrl) {
          callback(false);
          return;
        }

        try {
          callback(new URL(requestUrl).origin === APP_ORIGIN);
        } catch {
          callback(false);
        }
      },
    );

    createWindow();
    createTray();

    app.on("activate", () => showMainWindow());
  });
}

app.on("window-all-closed", () => {
  if (isQuitting) {
    app.quit();
  }
});
