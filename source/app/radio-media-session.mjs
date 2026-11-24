// Make the browser's audio player visible to macOS/Windows media keys,
// the system media overlay and Bluetooth headset controls.
export function installRadioMediaSession(audio, stationName, options = {}) {
  const session = options.session ?? (typeof navigator !== 'undefined' ? navigator.mediaSession : null);
  if (!session || !audio) return () => {};
  const Metadata = options.Metadata ?? (typeof MediaMetadata !== 'undefined' ? MediaMetadata : null);
  const onError = options.onError ?? (() => {});
  const actions = [];
  const setAction = (name, handler) => {
    try {
      session.setActionHandler(name, handler);
      actions.push(name);
    } catch {
      // Some Safari versions do not implement every optional action.
    }
  };
  try {
    if (Metadata) {
      session.metadata = new Metadata({
        title: stationName,
        artist: 'Bonnes Ondes',
        album: 'Radio en direct',
        artwork: options.artwork ? [{ src: options.artwork, type: 'image/svg+xml' }] : [],
      });
    }
  } catch {
    // A browser may reject SVG artwork while still supporting hardware keys.
  }
  const sync = () => {
    try { session.playbackState = audio.paused ? 'paused' : 'playing'; } catch {}
  };
  setAction('pause', () => audio.pause());
  setAction('play', () => { void audio.play().catch(onError); });
  setAction('stop', () => audio.pause());
  for (const name of ['playing', 'pause', 'ended', 'emptied']) audio.addEventListener(name, sync);
  sync();
  return () => {
    for (const name of ['playing', 'pause', 'ended', 'emptied']) audio.removeEventListener(name, sync);
    for (const name of actions) {
      try { session.setActionHandler(name, null); } catch {}
    }
    try { session.playbackState = 'none'; } catch {}
    try { session.metadata = null; } catch {}
  };
}
