// Radio France's HLS playlists do not use the MP3 Icecast connection that
// inserts an advertising pre-roll for third-party listeners.
// HLS plays natively in Safari; hls.js supplies MediaSource playback elsewhere.
export const hlsScriptUrl = 'https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js';

export interface HlsRadioPlayer {
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  on(event: string, callback: (event: string, data: { fatal?: boolean }) => void): void;
  destroy(): void;
}

export interface HlsRadioConstructor {
  new (options?: { enableWorker?: boolean }): HlsRadioPlayer;
  isSupported(): boolean;
  Events: { ERROR: string };
}

declare global {
  interface Window { Hls?: HlsRadioConstructor }
}

let pending: Promise<HlsRadioConstructor> | null = null;

export function isHlsStream(url: string | undefined): boolean {
  return !!url && /^https:\/\/stream\.radiofrance\.fr\/[^?#]+\.m3u8(?:[?#]|$)/.test(url);
}

export function supportsNativeHls(media: HTMLMediaElement): boolean {
  return !!(media.canPlayType('application/vnd.apple.mpegurl') ||
    media.canPlayType('application/x-mpegURL'));
}

export function loadHlsLibrary(): Promise<HlsRadioConstructor> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Lecteur réservé au navigateur.'));
  if (window.Hls) return Promise.resolve(window.Hls);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = hlsScriptUrl;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.Hls) resolve(window.Hls);
      else reject(new Error('Impossible de charger le lecteur HLS.'));
    };
    script.onerror = () => { script.remove(); reject(new Error('Lecteur HLS inaccessible.')); };
    document.head.appendChild(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}
