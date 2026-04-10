export const DEBUG_MODE_STORAGE_KEY = 'debugMode';

let debugEnabled = false;
let initialized = false;
let consolePatched = false;

const nativeDebug = console.debug.bind(console);
const nativeLog = console.log.bind(console);
const nativeInfo = console.info.bind(console);
const nativeWarn = console.warn.bind(console);
const nativeError = console.error.bind(console);

function canUseChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function patchConsoleOutput(): void {
  if (consolePatched) {
    return;
  }

  consolePatched = true;

  console.debug = (...args: unknown[]) => {
    if (debugEnabled) {
      nativeDebug(...args);
    }
  };

  console.log = (...args: unknown[]) => {
    if (debugEnabled) {
      nativeLog(...args);
    }
  };

  console.info = (...args: unknown[]) => {
    if (debugEnabled) {
      nativeInfo(...args);
    }
  };

  console.warn = (...args: unknown[]) => {
    if (debugEnabled) {
      nativeWarn(...args);
    }
  };

  console.error = (...args: unknown[]) => {
    if (debugEnabled) {
      nativeError(...args);
    }
  };
}

export async function initDebugLogging(): Promise<void> {
  patchConsoleOutput();

  if (initialized || !canUseChromeStorage()) {
    return;
  }

  initialized = true;

  try {
    const settings = await chrome.storage.local.get([DEBUG_MODE_STORAGE_KEY]);
    debugEnabled = settings[DEBUG_MODE_STORAGE_KEY] === true;
  } catch {
    debugEnabled = false;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[DEBUG_MODE_STORAGE_KEY]) {
      return;
    }

    debugEnabled = changes[DEBUG_MODE_STORAGE_KEY].newValue === true;
  });
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (debugEnabled) {
      nativeDebug(...args);
    }
  },
  log: (...args: unknown[]) => {
    if (debugEnabled) {
      nativeLog(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (debugEnabled) {
      nativeInfo(...args);
    }
  },
  isDebugEnabled: () => debugEnabled,
};

void initDebugLogging();
