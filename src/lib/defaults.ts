type Os = 'mac' | 'win' | 'linux' | 'other';

const BROWSER = ((import.meta as { env?: { BROWSER?: string } }).env?.BROWSER ?? 'chrome') as
  'chrome' | 'edge' | 'firefox' | string;

async function detectOs(): Promise<Os> {
  try {
    const info = await chrome.runtime.getPlatformInfo();
    if (info.os === 'mac') return 'mac';
    if (info.os === 'win') return 'win';
    if (info.os === 'linux') return 'linux';
    return 'other';
  } catch {
    return 'other';
  }
}

function pickCounterpartHandler(): string {
  // Send links *out* of the browser the extension is running in.
  // Defaults: Chrome -> Edge, Edge -> Chrome, others -> Chrome.
  switch (BROWSER) {
    case 'edge':
      return 'open-in-chrome';
    case 'chrome':
    default:
      return 'open-in-edge';
  }
}

export async function defaultRewriteTemplate(): Promise<string> {
  const os = await detectOs();
  const handler = pickCounterpartHandler();
  switch (os) {
    case 'mac':
      return `hammerspoon://${handler}?url={urlencoded}`;
    case 'win':
      // AutoHotkey, custom URL handler, or a registered protocol.
      return `tabsquad-${handler}://{urlencoded}`;
    case 'linux':
      // xdg-open registered scheme handler.
      return `tabsquad-${handler}://{urlencoded}`;
    default:
      return `tabsquad-${handler}://{urlencoded}`;
  }
}
