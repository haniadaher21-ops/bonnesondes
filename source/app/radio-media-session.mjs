// Make the browser's audio player visible to macOS/Windows media keys,
// the system media overlay and Bluetooth headset controls.
export function installRadioMediaSession(audio, stationName, options = {}) {
  if (!audio) return () => {};
  const session = options.session ?? (typeof navigator !== 'undefined' ? navigator.mediaSession : null);
  const onError = options.onError ?? (() => {});
  const play = () => { void audio.play().catch(onError); };
  const pause = () => audio.pause();
  // Some keyboards expose media keys as DOM events without Media Session.
  const keyTarget = options.keyTarget ?? (typeof window !== 'undefined' ? window : null);
  const keydown = event => {
    if (event.key === 'MediaPause') pause();
    else if (event.key === 'MediaPlay') play();
    else if (event.key === 'MediaPlayPause') audio.paused ? play() : pause();
    else return;
    event.preventDefault?.();
  };
  keyTarget?.addEventListener?.('keydown', keydown);
  if (!session) return () => keyTarget?.removeEventListener?.('keydown', keydown);
  const Metadata = options.Metadata ?? (typeof MediaMetadata !== 'undefined' ? MediaMetadata : null);
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
  setAction('pause', pause);
  setAction('play', play);
  setAction('stop', pause);
  for (const name of ['playing', 'pause', 'ended', 'emptied']) audio.addEventListener(name, sync);
  sync();
  return () => {
    keyTarget?.removeEventListener?.('keydown', keydown);
    for (const name of ['playing', 'pause', 'ended', 'emptied']) audio.removeEventListener(name, sync);
    for (const name of actions) {
      try { session.setActionHandler(name, null); } catch {}
    }
    try { session.playbackState = 'none'; } catch {}
    try { session.metadata = null; } catch {}
  };
}
