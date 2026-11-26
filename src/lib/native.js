import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';

// In the iOS and Android shells the web share and clipboard APIs are unreliable, so route them to the native plugins.
if (Capacitor.isNativePlatform()) {
  const define = (name, value) => {
    try { Object.defineProperty(navigator, name, { value, configurable: true }); } catch (e) { /* keep the browser default */ }
  };
  define('share', async (d) => {
    const data = d || {};
    try {
      await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title });
    } catch (e) {
      throw new DOMException('Share dismissed', 'AbortError');
    }
  });
  define('clipboard', {
    writeText: (t) => Clipboard.write({ string: String(t) }),
    readText: async () => {
      const r = await Clipboard.read();
      return r && r.value ? r.value : '';
    },
  });
}
