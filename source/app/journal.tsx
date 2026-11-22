'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Disc3, Headphones, Heart, Maximize2, Menu, Minimize2, Music2, Play, Plus, Radio, ThumbsDown, X } from 'lucide-react';
import { archive, catalog, issues, live, parsePlaylist, personalPlaylist, playlists, stations, type Format, type Recommendation } from './content';

import { selectEdition } from '../editorial/edition.mjs';
import { editionShelf } from '../editorial/shelves.mjs';
import RadioTrack, { type OnAir } from './radio-track';
import ProfileSync from './profile-sync';
import TastePreferences from './taste-preferences';
import { playableYouTubeId, youtubeEmbedSrc, youtubeThumbnailCandidates } from './youtube-player.mjs';
import { collectionRecommendations, restoreLibrary, toggleSaved, libraryStorageKey } from './library-store.mjs';

const pages = [
  ['rotation', 'Sélection'], ['radio', 'Radios'], ['playlists', 'Playlists'],
  ['live', 'Live'], ['mix', 'Mix'], ['editions', 'Archives'], ['library', 'Ma collection'],
] as const;
type Page = typeof pages[number][0] | 'archive' | 'preferences';
const formatLabels: Record<Format, string> = {
  Album: 'Album', 'Radio show': 'DJ set / mix', Playlist: 'Playlist', 'Live session': 'Session live', Track: 'Morceau',
};
// For mixes and live performances, the source alone is the useful card label.
const recommendationLabel = (item: Recommendation) =>
  item.format === 'Radio show' || item.format === 'Live session'
    ? item.source
    : formatLabels[item.format] + (item.format === 'Album' ? '' : ' · ' + item.source);

const viewLabels: Record<string, string> = {
  Saved: 'Favoris', 'All discoveries': 'Toutes les découvertes',
  Loved: 'Coup de cœur', Interesting: 'Intéressant', 'Not for me': 'Pas pour moi',
  'Worth revisiting': 'À réécouter',
};
const reactions = ['Loved', 'Not for me'] as const;
// Keep existing localStorage/profile reaction values readable for older collections.
type Reaction = 'Loved' | 'Interesting' | 'Not for me' | 'Worth revisiting';
type Entry = { saved?: boolean; reaction?: Reaction };
type Library = { entries: Record<string, Entry>; playlists: Recommendation[]; radioTracks: Record<string, Recommendation>; curators: string[]; savedItems: Record<string, Recommendation> };
const emptyLibrary: Library = { entries: {}, playlists: [], radioTracks: {}, curators: [], savedItems: {} };
const storageKey = libraryStorageKey;
// All still-available catalogues are used once to recover bookmarks saved with
// the previous library format (which remembered IDs but not complete cards).
const bundledRecommendations = [...catalog, ...issues.flatMap(edition => [
  edition.featured, ...edition.albums, ...edition.mixes, ...edition.playlists, ...edition.live,
])];
const dateLabel = (value: string) => new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium', timeZone: 'UTC',
}).format(new Date(value + 'T12:00:00Z'));
const displayMinutes = (minutes: number) => Math.ceil(minutes) + ' min';
function SourceLink({ item, children }: { item: { url: string }; children: ReactNode }) {
  return <a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={15} /></a>;
}

function Player({ item }: { item: Recommendation }) {
  if (item.embed?.provider !== 'spotify') return null;
  return <iframe className="spotify-frame" loading="lazy"
    title={'Lecteur : ' + item.title}
    src={'https://open.spotify.com/embed/' + (item.format === 'Album' ? 'album/' : 'playlist/') + item.embed.id + '?locale=fr'}
    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
    allowFullScreen />;
}

function PersistentYouTubePlayer({ item, expanded, onResize, onClose }: {
  item: Recommendation | null; expanded: boolean; onResize: () => void; onClose: () => void;
}) {
  const videoId = item?.embed?.provider === 'youtube' ? item.embed.id : null;
  const src = videoId ? youtubeEmbedSrc(videoId) : undefined;
  if (!src || !item) return null;
  // One iframe, outside the conditionally rendered tabs: changing #mix / #live /
  // #radio never destroys it or resets the playhead.
  return <aside className={'video-dock' + (expanded ? ' video-dock-expanded' : '')}
    aria-label="Lecteur YouTube persistant" role="region">
    <div className="video-dock-bar">
      <div className="video-dock-heading"><strong>Vidéo en cours</strong><span title={item.title}>{item.title}</span></div>
      <div className="video-dock-controls">
        <button type="button" className="video-dock-button" onClick={onResize}
          title={expanded ? 'Réduire le lecteur' : 'Agrandir le lecteur'}
          aria-label={expanded ? 'Réduire le lecteur YouTube' : 'Agrandir le lecteur YouTube'}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button type="button" className="video-dock-button" onClick={onClose}
          title="Arrêter et fermer" aria-label="Arrêter la vidéo et fermer le lecteur YouTube"><X size={18} /></button>
      </div>
    </div>
    <iframe key={videoId} className="video-dock-iframe"
      title={'Lecteur YouTube : ' + item.title}
      src={src} loading="eager" referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
      allowFullScreen />
    <div className="video-dock-foot">
      <span>Le son continue quand tu changes de rubrique.</span>
      <a href={item.url} target="_blank" rel="noopener noreferrer">Ouvrir sur YouTube <ArrowUpRight size={13} /></a>
    </div>
  </aside>;
}

function PersistentMixPlayer({ item, onClose }: { item: Recommendation | null; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const audio = item?.audio;
  const source = audio?.provider === 'podcast'
    && ['proxycast.radiofrance.fr', 'audio.audiomeans.fr'].includes(new URL(audio.url).hostname)
    ? audio.url : undefined;
  const soundcloud = audio?.provider === 'soundcloud'
    && new URL(audio.url).hostname === 'soundcloud.com'
    ? 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(audio.url)
      + '&auto_play=true&hide_related=true&show_comments=false&show_reposts=false&visual=false'
    : undefined;
  if (!item || (!source && !soundcloud)) return null;
  return <aside className="video-dock mix-dock" aria-label="Lecteur de mix persistant" role="region">
    <div className="video-dock-bar">
      <div className="video-dock-heading"><strong>Mix en cours</strong><span title={item.title}>{item.title}</span></div>
      <div className="video-dock-controls">
        <button type="button" className="video-dock-button" onClick={onClose}
          title="Arrêter et fermer" aria-label="Arrêter le mix et fermer le lecteur"><X size={18} /></button>
      </div>
    </div>
    {source
      ? <audio key={item.id} className="mix-dock-audio" src={source}
          autoPlay controls preload="metadata" onError={() => setFailed(true)} />
      : <iframe key={item.id} className="mix-dock-soundcloud"
          title={'Écouter ' + item.title + ' sur SoundCloud'}
          src={soundcloud} allow="autoplay" loading="eager" />}
    {failed && <p className="mix-dock-error" role="status">Lecture indisponible ici. Tu peux ouvrir l’épisode à sa source.</p>}
    <div className="video-dock-foot">
      <span>La lecture continue pendant la navigation.</span>
      <a href={item.url} target="_blank" rel="noopener noreferrer">Source <ArrowUpRight size={13} /></a>
    </div>
  </aside>;
}

function Artwork({ item, index = 0 }: { item: Recommendation; index?: number }) {
  const [failed, setFailed] = useState(false);
  const [thumbnailAttempt, setThumbnailAttempt] = useState(0);
  const thumbnails = youtubeThumbnailCandidates(item.embed?.provider === 'youtube' ? item.embed.id : undefined);
  // Use the actual video ID for every YouTube item. Live sessions previously
  // had no artwork, and hqdefault (4:3) often leaves thick black letterboxing.
  const artworkUrl = thumbnails.length ? thumbnails[thumbnailAttempt] : item.artwork;
  const handleArtworkError = () => {
    if (thumbnails.length && thumbnailAttempt < thumbnails.length - 1) {
      setThumbnailAttempt(attempt => attempt + 1);
    } else {
      setFailed(true);
    }
  };
  return <div className={`artwork ${item.format === 'Album' ? 'artwork-album' : ''} artwork-${index % 3}`}>
    {artworkUrl && !failed
      ? <img key={artworkUrl} src={artworkUrl} alt="" loading="lazy" onError={handleArtworkError} />
      : <Disc3 size={91} strokeWidth={0.65} aria-hidden="true" />}
  </div>;
}

function Section({ label, title, children, id }: { label?: string; title: string; children: ReactNode; id?: string }) {
  return <section className="editorial-section" id={id}>
    <header className="section-heading">{label && <p className="eyebrow">{label}</p>}<h2>{title}</h2></header>
    {children}
  </section>;
}

export default function Journal() {
  const [page, setPage] = useState<Page>('rotation');
  const [issue, setIssue] = useState(issues[0]);
  const [archivedEditionDate, setArchivedEditionDate] = useState<string | null>(null);
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [ready, setReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [activeVideo, setActiveVideo] = useState<Recommendation | null>(null);
  const [activeMix, setActiveMix] = useState<Recommendation | null>(null);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [station, setStation] = useState(stations[0]);
  const [radioOpen, setRadioOpen] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const radioAudioRef = useRef<HTMLAudioElement>(null);
  const [playlistError, setPlaylistError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [curator, setCurator] = useState('');
  const [genre, setGenre] = useState('');
  const [season, setSeason] = useState('');
  const [shelfMood, setShelfMood] = useState('');
  const [libraryView, setLibraryView] = useState('Saved');
  const [format, setFormat] = useState('');
  const [mood, setMood] = useState('');
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState('');
  const modal = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const readHash = () => {
      const hash = location.hash.slice(1);
      const match = pages.find(([name]) => name === hash);
      const editionDate = hash.startsWith('editions/') ? hash.slice('editions/'.length) : null;
      const archived = editionDate && issues.some(edition => edition.startsOn === editionDate);
      setArchivedEditionDate(archived ? editionDate : null);
      setPage(editionDate ? 'editions' : hash === 'archive' || hash === 'preferences' ? hash : match?.[0] ?? 'rotation');
      setMobileOpen(false);
      if (match || editionDate || hash === 'archive' || hash === 'preferences') window.scrollTo({ top: 0, behavior: 'instant' });
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    const updateEdition = () => setIssue(selectEdition(issues) ?? issues[0]);
    updateEdition();
    const editionTimer = setInterval(updateEdition, 1000);
    window.addEventListener('focus', updateEdition);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLibrary(restoreLibrary(JSON.parse(raw), bundledRecommendations) as Library);
    } catch {
      setStorageMessage('Impossible de lire ta collection dans ce navigateur.');
    }
    setReady(true);
    return () => {
      window.removeEventListener('hashchange', readHash);
      window.removeEventListener('focus', updateEdition);
      clearInterval(editionTimer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify(library)); }
    catch { setStorageMessage('Ce navigateur n’a pas pu enregistrer les changements apportés à ta collection.'); }
  }, [library, ready]);

  useEffect(() => {
    const dialog = modal.current;
    if (selected && !dialog?.open) {
      dialog?.showModal();
      dialog?.querySelector('button')?.focus();
    }
    if (!selected && dialog?.open) dialog.close();
  }, [selected]);

  const updateEntry = (id: string, update: (entry: Entry) => Entry) => {
    setLibrary(state => ({ ...state, entries: { ...state.entries, [id]: update(state.entries[id] ?? {}) } }));
  };
  const toggleReaction = (id: string, reaction: 'Loved' | 'Not for me') => {
    updateEntry(id, entry => ({...entry, reaction: entry.reaction === reaction ? undefined : reaction}));
  };

  const save = (item: Recommendation) => setLibrary(state => toggleSaved(state, item) as Library);

  const currentRadioTrack = ({ title, artist, artwork }: OnAir, sourceName: string): Recommendation => ({
    id: 'radio-track:' + JSON.stringify([title, artist ?? ''].map(value => value.trim().normalize().toLowerCase())),
    title,
    creator: artist,
    format: 'Track',
    artwork,
    source: sourceName,
    url: 'https://open.spotify.com/search/' + encodeURIComponent([title, artist].filter(Boolean).join(' ')),
  });
  const favoriteCurator = (name: string) => setLibrary(state => ({
    ...state, curators: state.curators.includes(name) ? state.curators.filter(value => value !== name) : [...state.curators, name],
  }));

  const shelf = editionShelf(issues, issue, 'playlists', [...playlists, ...library.playlists]);
  const liveShelf = editionShelf(issues, issue, 'live', live);

  const addPlaylist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    const id = parsePlaylist(field('url'));
    if (!id) return setPlaylistError('Saisis un lien de playlist Spotify depuis open.spotify.com.');
    if (shelf.some(item => parsePlaylist(item.url) === id)) {
      return setPlaylistError('Cette playlist figure déjà dans ta sélection.');
    }
    const item = personalPlaylist(id, field('title'), field('curator'), field('mood'), field('season'), field('genre'));
    setLibrary(state => ({ ...state, playlists: [...state.playlists, item] }));
    setShowAdd(false);
    setPlaylistError('');
    setCurator(''); setGenre(''); setSeason(''); setShelfMood('');
  };

  // Keep the audio element mounted before a user clicks « Écouter »:
  // calling play() in that same trusted event enables one-click listening.
  const stopRadio = () => {
    const audio = radioAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setRadioOpen(false);
  };

  const startVideo = (item: Recommendation) => {
    if (item.embed?.provider !== 'youtube' || !playableYouTubeId(item.embed.id)) return;
    const id = item.embed.id;
    // Starting the same video again must not remount the iframe and lose position.
    setActiveVideo(current => current?.embed?.provider === 'youtube' && current.embed.id === id ? current : item);
    setVideoExpanded(false);
    setActiveMix(null);
    stopRadio();
    setSelected(null);
  };

  const startMix = (item: Recommendation) => {
    if (!item.audio) return;
    setActiveMix(current => current?.id === item.id ? current : item);
    setActiveVideo(null);
    setVideoExpanded(false);
    stopRadio();
    setSelected(null);
  };

  const tune = (next: typeof station) => {
    const audio = radioAudioRef.current;
    // Invoke play() synchronously from the click/change event, not in an effect
    // after the panel mounts: otherwise browsers may require a second click.
    if (audio) {
      audio.pause();
      if (next.stream) {
        if (audio.getAttribute('src') !== next.stream) audio.src = next.stream;
        void audio.play().catch(() => setAudioError(true));
      } else {
        audio.removeAttribute('src');
        audio.load();
      }
    }
    setActiveVideo(null);
    setActiveMix(null);
    setStation(next);
    setAudioError(false);
    setRadioOpen(true);
  };

  const saveButton = (item: Recommendation, className = 'icon-button', showTrackLabel = false) => {
    const saved = !!library.entries[item.id]?.saved;
    return <button type="button" className={className} onClick={() => save(item)}
      aria-label={saved ? 'Retirer des favoris : ' + item.title : 'Ajouter aux favoris : ' + item.title} aria-pressed={saved}
      disabled={!ready}>
      <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
      {showTrackLabel && <span>{saved ? 'Morceau enregistré' : 'Enregistrer le morceau'}</span>}
      {className === 'hero-save' && <span>{saved ? 'Enregistré' : 'Enregistrer'}</span>}
    </button>;
  };

  const reactionButtons = (item: Recommendation) => {
    const reaction = library.entries[item.id]?.reaction;
    return <div className="reaction-buttons" role="group" aria-label={'Ton avis sur ' + item.title}>
      <button type="button" className="reaction-button reaction-love" title="Coup de cœur"
        aria-label={'Coup de cœur : ' + item.title} aria-pressed={reaction === 'Loved'}
        disabled={!ready} onClick={() => toggleReaction(item.id, 'Loved')}>
        <Heart size={18} fill={reaction === 'Loved' ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      <button type="button" className="reaction-button reaction-dislike" title="Je n’aime pas"
        aria-label={'Je n’aime pas : ' + item.title} aria-pressed={reaction === 'Not for me'}
        disabled={!ready} onClick={() => toggleReaction(item.id, 'Not for me')}>
        <ThumbsDown size={18} fill={reaction === 'Not for me' ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </div>;
  };

  const cards = (items: Recommendation[], withPlayers = false, compact = false) => <div className={compact ? 'card-grid card-grid-compact' : 'card-grid'}>
    {items.map((item, index) => <article className={compact ? 'music-card music-card-compact' : 'music-card'} key={item.id}>
      {item.embed?.provider === 'youtube' && playableYouTubeId(item.embed.id)
        ? <button type="button" className="video-launch" onClick={() => startVideo(item)}
            aria-label={'Lire ' + item.title + ' dans le lecteur YouTube persistant'}
            aria-pressed={activeVideo?.embed?.provider === 'youtube' && activeVideo.embed.id === item.embed.id}>
            <Artwork item={item} index={index} />
            <span className="video-launch-overlay"><span className="video-launch-play"><Play size={23} fill="currentColor" /></span>Lire ici</span>
          </button>

        : item.audio
        ? <button type="button" className="video-launch mix-launch" onClick={() => startMix(item)}
            aria-label={'Lire ' + item.title + ' dans le lecteur de mix persistant'}
            aria-pressed={activeMix?.id === item.id}>
            <Artwork item={item} index={index} />
            <span className="video-launch-overlay"><span className="video-launch-play"><Play size={23} fill="currentColor" /></span>Écouter ici</span>
          </button>
        : withPlayers && item.embed ? <Player item={item} /> : item.format === 'Album' && item.url.startsWith('https://open.spotify.com/album/')
        ? <a className="album-cover-link" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={'Écouter '+item.title+' sur Spotify'}><Artwork item={item} index={index} /></a>
        : <Artwork item={item} index={index} />}
      <div className="card-body">
        <div className="flex justify-between items-center gap-2">
          <p className="eyebrow">{recommendationLabel(item)}</p>
          <div className="card-feedback">{reactionButtons(item)}{saveButton(item)}</div>
        </div>
        <h3>{item.format === 'Album' ? <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={'Écouter '+item.title+' sur Spotify'}>{item.title}</a> : <button onClick={() => setSelected(item)}>{item.title}</button>}</h3>
        {item.creator && <p className="creator">{[item.creator, item.publisher].filter(Boolean).join(' · ')}</p>}
        {(item.date || item.minutes) && <p className="metadata">{[item.date && dateLabel(item.date), item.minutes && displayMinutes(item.minutes)].filter(Boolean).join(' · ')}</p>}
        {item.note && <p className="card-note">{item.note}</p>}
        {item.format === 'Album' && item.editorialSource && <p className="metadata">Recommandé par {item.editorialUrl ? <a href={item.editorialUrl} target="_blank" rel="noopener noreferrer">{item.editorialSource}</a> : item.editorialSource}</p>}
        {(item.mood || item.season || item.genre) && <p className="tags">{[item.genre, item.mood, item.season].filter(Boolean).join(' · ')}</p>}
        <div className="card-actions">
          <button onClick={() => setSelected(item)} className="text-link">Infos tracks <ArrowRight size={14} /></button>
          <SourceLink item={item}>{item.format === 'Track' ? 'Rechercher sur Spotify' : item.format === 'Album' ? 'Écouter sur Spotify' : item.embed?.provider==='youtube' ? 'Ouvrir sur YouTube' : item.source}</SourceLink>
        </div>
      </div>
    </article>)}
  </div>;

  const options = (items: Recommendation[], key: 'mood' | 'source' | 'creator' | 'season' | 'genre') =>
    [...new Set(items.flatMap(item => item[key] ? [item[key]] : []))].sort((a, b) => a.localeCompare(b));
  const filter = (label: string, value: string, set: (v: string) => void, values: string[]) =>
    <label className="filter">{label}<select value={value} onChange={event => set(event.target.value)}>
      <option value="">Tout</option>{values.map(option => <option key={option} value={option}>{option in formatLabels ? formatLabels[option as Format] : option}</option>)}
    </select></label>;

  const all = collectionRecommendations(
    [...bundledRecommendations, ...library.playlists, ...Object.values(library.radioTracks)],
    library.savedItems,
  ) as Recommendation[];
  const shelfResults = shelf.filter(item => (!curator || (curator === '★ Créateurs favoris'
    ? library.curators.includes(item.creator ?? '') : item.creator === curator))
    && (!genre || item.genre === genre) && (!season || item.season === season) && (!shelfMood || item.mood === shelfMood));
  const libraryResults = all.filter(item => {
    const entry = library.entries[item.id];
    const inView = libraryView === 'All discoveries' || (libraryView === 'Saved' && entry?.saved)
      || entry?.reaction === libraryView;
    return inView && (!format || item.format === format) && (!mood || item.mood === mood)
      && (!source || item.source === source) && (!duration || (item.minutes != null && item.minutes <= Number(duration)));
  });
  // Published editions are immutable snapshots, not a collection of mutable recommendations.
  // Include the active week as well, so visitors can open an issue directly by date.
  const browsableEditions = issues.filter(edition => edition.startsOn <= issue.startsOn)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const archivedIssue = browsableEditions.find(edition => edition.startsOn === archivedEditionDate);
  const featured = issue.featured;

  return <>
    <a className="skip-link" href="#main-content">Aller au contenu</a>
    <header className="masthead">
      <div className="shell nav-inner">
        <a className="brand" href="#rotation" aria-label="Accueil Bonnes Ondes"><img className="brand-mark" src={(process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/bonnes-ondes-mark.svg'} alt="" width="33" height="33" />Bonnes Ondes<span className="brand-dot">.</span></a>
        <button className="menu-button icon-button" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-controls="main-nav" aria-label="Afficher ou masquer le menu">{mobileOpen ? <X /> : <Menu />}</button>
        <nav id="main-nav" aria-label="Navigation principale" className={mobileOpen ? 'nav-open' : ''}>
          {pages.map(([key, label]) => <a href={'#' + key} key={key} aria-current={page === key || ((page === 'preferences' || page === 'archive') && key === 'library') ? 'page' : undefined}
            className={key === 'library' ? 'library-nav' : undefined}>
            {key === 'library' && <Bookmark size={15} />}{label}
          </a>)}
        </nav>
      </div>
    </header>

    <main className="shell" id="main-content">
      {storageMessage && <p className="empty" role="status">{storageMessage}</p>}
      {page === 'rotation' && <>
        <div className="issue-line"><span>Journal musical</span><span>N° {issue.number} <b> / </b> <a className="issue-date-link" href={"#editions/" + issue.startsOn} aria-label={"Voir l’édition du " + dateLabel(issue.startsOn)}>{issue.label}</a></span></div>
        <header className="intro">
          <h1>Bonnes Ondes<span>.</span></h1>
          <div className="intro-aside"><h2>La sélection de la semaine</h2><p>Des disques, des radios et des concerts choisis chaque semaine.</p>
            <a className="text-link" href="#essential-albums">Voir la sélection <ArrowDown size={15} /></a></div>
        </header>
        <article className="feature">
          <div className="feature-art"><img src={(process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/art/mix-semaine.jpg'} alt="Illustration d’un chien DJ à une platine vinyle" /></div>
          <div className="feature-copy">
            <p className="eyebrow">Mix de la semaine</p>
            <h2>{featured.title}</h2>
            <p className="feature-meta">{featured.source} {featured.date && ' / ' + dateLabel(featured.date)}</p>
            <p className="feature-note">{featured.note}</p>
            <div className="flex flex-wrap gap-3 items-center">
              {featured.audio
                ? <button className="primary" type="button" onClick={() => startMix(featured)}><Play size={15} fill="currentColor" /> Écouter le mix</button>
                : featured.embed?.provider === 'youtube' && playableYouTubeId(featured.embed.id)
                ? <button className="primary" type="button" onClick={() => startVideo(featured)}><Play size={15} fill="currentColor" /> Écouter le mix</button>
                : <a className="primary" href={featured.url} target="_blank" rel="noopener noreferrer"><Play size={15} fill="currentColor" /> Écouter le mix</a>}
              {saveButton(featured, 'hero-save')}
              {reactionButtons(featured)}
            </div>
            <button className="text-link feature-notes" onClick={() => setSelected(featured)}>Infos tracks <ArrowRight size={14} /></button>
          </div>
        </article>
        <Section label="DISQUES" title="Trois albums essentiels" id="essential-albums">{cards(issue.albums)}</Section>
        <Section label="SUR LES ONDES" title="Mix de la semaine">{cards(issue.mixes, true)}</Section>
        <Section label="SUR SPOTIFY" title="Les playlists de la semaine">{cards(issue.playlists, true)}</Section>
        <Section label="LIVE" title="Performances à découvrir">{cards(issue.live.slice(0, 3), true)}</Section>
      </>}

      {page === 'editions' && <>
        <PageHeading label="LES ÉDITIONS" title="Archives des éditions" />
        {archivedIssue ? <>
          <a className="text-link editions-back" href="#editions"><ArrowRight className="editions-back-icon" size={16} /> Toutes les éditions</a>
          <div className="edition-detail-heading">
            <p className="eyebrow">ÉDITION N° {archivedIssue.number}{archivedIssue.startsOn === issue.startsOn ? ' · ÉDITION ACTUELLE' : ''}</p>
            <h2>Semaine du {dateLabel(archivedIssue.startsOn)}</h2>
            <p>{archivedIssue.label}</p>
          </div>
          <Section label="DISQUES" title="Albums recommandés">{cards(archivedIssue.albums)}</Section>
          <Section label="SUR LES ONDES" title="Mix de la semaine">
            <p className="edition-featured-note">Mix de la semaine : <strong>{archivedIssue.featured.title}</strong></p>
            {cards(archivedIssue.mixes, true)}
          </Section>
          <Section label="SUR SPOTIFY" title="Playlists">{cards(archivedIssue.playlists, true)}</Section>
          <Section label="LIVE" title="Performances à découvrir">{cards(archivedIssue.live, true)}</Section>
        </> : <>
          <div className="edition-list" role="list" aria-label="Éditions classées par date, de la plus récente à la plus ancienne">
            {browsableEditions.map(edition => <a role="listitem" key={edition.startsOn}
              className="edition-list-item" href={'#editions/' + edition.startsOn}
              aria-label={'Voir l’édition du ' + dateLabel(edition.startsOn)}>
              <span className="edition-list-number">N° {edition.number}</span>
              <span className="edition-list-main">
                <strong>{dateLabel(edition.startsOn)}</strong>
                <span>{edition.label}</span>
              </span>
              
              {edition.startsOn === issue.startsOn && <span className="edition-list-current">En cours</span>}
              <ArrowRight size={19} aria-hidden="true" />
            </a>)}
          </div>
        </>}
      </>}

      {page === 'radio' && <>
        <PageHeading label="EN DIRECT" title="Radios" />
        <div className="station-grid">
          {stations.map(item => <article className="station" key={item.name}>
            <Radio size={22} /><p className="eyebrow">{item.label}</p><h2>{item.name}</h2>
            {item.metadata
              ? <RadioTrack metadata={item.metadata} compact
                  saveTrack={track => saveButton(currentRadioTrack(track, item.name), 'text-link radio-save', true)} />
              : <p className="station-description">{item.description}</p>}
            {item.stream || item.embed
              ? <button className="text-link" onClick={() => tune(item)}><Play size={14} /> Écouter</button>
              : <SourceLink item={item}>Écouter sur le site de la radio</SourceLink>}
          </article>)}
        </div>
      </>}

      {page === 'playlists' && <>
        <PageHeading label="SÉLECTIONS INDÉPENDANTES" title="Playlists" />
        <div className="shelf-toolbar">
          <div className="filters">
            {filter('Créateur', curator, setCurator, ['★ Créateurs favoris', ...options(shelf, 'creator')])}
            {filter('Genre', genre, setGenre, options(shelf, 'genre'))}
            {filter('Ambiance', shelfMood, setShelfMood, options(shelf, 'mood'))}
            {filter('Saison', season, setSeason, options(shelf, 'season'))}
          </div>
          <button className="primary" onClick={() => setShowAdd(!showAdd)} aria-expanded={showAdd} disabled={!ready}><Plus size={17} /> Ajouter une playlist</button>
        </div>
        {showAdd && <form className="add-form" onSubmit={addPlaylist}>
          <label className="wide">Lien de la playlist Spotify<input name="url" type="url" required placeholder="https://open.spotify.com/playlist/…" /></label>
          <label>Titre<input name="title" maxLength={120} /></label><label>Créateur<input name="curator" maxLength={80} /></label>
          <label>Genre<input name="genre" maxLength={40} /></label><label>Ambiance<input name="mood" maxLength={40} /></label>
          <label>Saison<input name="season" maxLength={40} /></label>
          {playlistError && <p role="alert" className="wide form-error">{playlistError}</p>}
          <div className="wide"><button type="submit" className="primary">Ajouter à la collection</button></div>
        </form>}
        {library.curators.length > 0 && <div className="favorite-list"><strong>Créateurs favoris</strong>
          {library.curators.map(name => <button className="tag-button" key={name} onClick={() => setCurator(name)}>{name}</button>)}
        </div>}
        {shelfResults.length ? cards(shelfResults, true) : <p className="empty">Aucune playlist ne correspond à ces filtres.</p>}
      </>}

      {page === 'live' && <>
        <PageHeading label="SESSIONS ET REPRISES" title="Live" />
        {cards(liveShelf, true)}
      </>}

      {page === 'mix' && <>
        <PageHeading label="SUR LES ONDES" title="Mix" />
        {cards(issue.mixes, true)}
      </>}

      {page === 'archive' && <>
        <PageHeading label="À RÉÉCOUTER" title="Historique d’écoute" />
        {archive.length ? cards(archive, false, true) : <p className="empty">Aucun contenu dans l’historique pour le moment.</p>}
      </>}

      {page === 'library' && <>
        <PageHeading label="TES FAVORIS" title="Ma collection" />
        <div className="collection-layout">
          <section className="collection-content" aria-label="Tes découvertes enregistrées">
            <a className="text-link" href="#preferences">Modifier mon profil musical <ArrowRight size={14} /></a>
            <div className="filters library-filters">
              <label className="filter">Afficher<select value={libraryView} onChange={event => setLibraryView(event.target.value)}>
                {['Saved', 'All discoveries', ...reactions].map(value => <option key={value} value={value}>{viewLabels[value]}</option>)}
              </select></label>
              {filter('Format', format, setFormat, [...new Set(all.map(item => item.format))])}
              {filter('Ambiance', mood, setMood, options(all, 'mood'))}
              {filter('Source', source, setSource, options(all, 'source'))}
              <label className="filter">Durée d’écoute<select value={duration} onChange={event => setDuration(event.target.value)}>
                <option value="">Toutes les durées</option><option value="15">Jusqu’à 15 min</option>
                <option value="60">Jusqu’à 1 h</option><option value="180">Jusqu’à 3 h</option>
              </select></label>
            </div>
            {libraryResults.length ? cards(libraryResults, false, true) : <p className="empty">{libraryView === 'Saved' && !Object.values(library.entries).some(entry => entry.saved) ? 'Utilise le marque-page d’une recommandation pour la retrouver ici.' : 'Aucune découverte ne correspond à ces filtres.'}</p>}
          </section>
          <aside className="history-panel" aria-labelledby="history-panel-title">
            <div className="history-panel-heading">
              <p className="eyebrow">À RÉÉCOUTER</p>
              <h2 id="history-panel-title">Historique d’écoute</h2>
              <p>Les sélections conservées dans les anciennes archives.</p>
            </div>
            {archive.length ? <ol className="history-list" aria-label="Historique d’écoute défilant">
              {archive.map((item, index) => <li key={item.id}>
                <button type="button" className="history-entry" onClick={() => setSelected(item)}>
                  <span className="history-art"><Artwork item={item} index={index} /></span>
                  <span className="history-entry-copy">
                    <strong>{item.title}</strong>
                    <span>{item.creator || item.source}</span>
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </li>)}
            </ol> : <p className="history-empty">Aucun contenu archivé pour le moment.</p>}
            <a className="text-link history-full-link" href="#archive">Voir tout l’historique <ArrowRight size={15} /></a>
          </aside>
        </div>
      </>}
      {page === 'preferences' && <>
        <PageHeading title="Mon profil musical" label="PRÉFÉRENCES" />
        <TastePreferences library={library} recommendations={all} libraryReady={ready} />
      </>}
    </main>

    <div className="shell"><ProfileSync library={library} recommendations={all} ready={ready} visible={page === 'preferences'} /></div>
    <footer className="shell footer"><a className="brand" href="#rotation"><img className="brand-mark" src={(process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/bonnes-ondes-mark.svg'} alt="" width="30" height="30" />Bonnes Ondes<span className="brand-dot">.</span></a><span>JOURNAL MUSICAL INDÉPENDANT</span></footer>

    <PersistentMixPlayer key={activeMix?.id ?? 'empty'} item={activeMix} onClose={() => setActiveMix(null)} />
    <PersistentYouTubePlayer item={activeVideo} expanded={videoExpanded}
      onResize={() => setVideoExpanded(value => !value)} onClose={() => { setActiveVideo(null); setVideoExpanded(false); }} />

    <aside className={'radio-dock' + ((activeVideo || activeMix) ? ' radio-dock-with-video' : '')} aria-label="Lecteur radio">
      <div className="dock-expanded" hidden={!radioOpen}>
        {radioOpen && <>
          <div className="flex gap-2 items-center justify-between"><strong>{station.name}</strong><button className="icon-button" onClick={stopRadio} aria-label="Fermer le lecteur radio"><X size={18} /></button></div>
          <label className="filter">Station<select value={station.name} onChange={event => {
            const next = stations.find(item => item.name === event.target.value);
            if (next) tune(next);
          }}>{stations.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
          {station.metadata && <RadioTrack key={station.name} metadata={station.metadata}
            saveTrack={track => saveButton(currentRadioTrack(track, station.name), 'text-link radio-save', true)} />}
        </>}
        <audio ref={radioAudioRef} controls preload="none" hidden={!radioOpen || !station.stream}
          onError={() => setAudioError(true)} />
        {radioOpen && <>
          {!station.stream && station.embed && <iframe className="radio-frame" title={station.name + ' en direct'} src={station.embed} allow="autoplay" />}
          {audioError && <p role="status">Le flux n’a pas démarré. Utilise Play dans le lecteur ou essaie le site de la station.</p>}
          <SourceLink item={station}>Ouvrir le site de la radio</SourceLink>
        </>}
      </div>
      {!radioOpen && <button className="dock-toggle" onClick={() => tune(station)}><Headphones size={18} /> Lecteur radio <Plus size={15} /></button>}
    </aside>

    <dialog ref={modal} onClose={() => setSelected(null)} onClick={event => {
      if (event.target === event.currentTarget) setSelected(null);
    }} aria-labelledby="listening-title">
      {selected && <div className="dialog-content">
        <button className="icon-button close-dialog" onClick={() => setSelected(null)} aria-label="Fermer les infos tracks" autoFocus><X size={22} /></button>
        <p className="eyebrow">{recommendationLabel(selected)}</p>
        <h2 id="listening-title">{selected.title}</h2>
        {selected.creator && <p className="creator">{[selected.creator, selected.publisher].filter(Boolean).join(' · ')}</p>}
        {(selected.date || selected.minutes) && <p className="metadata">{[selected.date && dateLabel(selected.date), selected.minutes && displayMinutes(selected.minutes)].filter(Boolean).join(' · ')}</p>}
        {selected.note && <p>{selected.note}</p>}
        {selected.reason && <div className="why"><p className="eyebrow">POURQUOI ON L’A CHOISI</p><p>{selected.reason}</p></div>}
        {selected.audio
          ? <button className="primary" type="button" onClick={() => startMix(selected)}><Play size={15} fill="currentColor" /> Écouter ici</button>
          : selected.embed?.provider === 'youtube'
          ? <button className="primary" type="button" onClick={() => startVideo(selected)}>
              <Play size={15} fill="currentColor" /> Lire dans le lecteur YouTube
            </button>
          : <Player item={selected} />}
        <div className="dialog-actions"><SourceLink item={selected}>{selected.format === 'Track' ? 'Rechercher sur Spotify' : selected.format === 'Album' ? 'Écouter sur Spotify' : (selected.embed ? 'Ouvrir sur ' : 'Écouter sur ') + selected.source}</SourceLink>
          {selected.format === 'Album' && selected.editorialUrl && <a className="text-link" href={selected.editorialUrl} target="_blank" rel="noopener noreferrer">Lire la recommandation {selected.editorialSource ? '('+selected.editorialSource+')' : ''} <ArrowUpRight size={15} /></a>}
          {saveButton(selected)}</div>
        <div className="feedback">
          <div className="dialog-reactions"><span>Ton avis</span>{reactionButtons(selected)}</div>
          {selected.format === 'Playlist' && selected.creator && <button className="text-link" aria-pressed={library.curators.includes(selected.creator)}
            onClick={() => favoriteCurator(selected.creator!)}><Music2 size={16} />{library.curators.includes(selected.creator) ? 'Retirer ce créateur des favoris' : 'Ajouter ce créateur aux favoris'}</button>}
        </div>
      </div>}
    </dialog>
  </>;
}

function PageHeading({ label, title }: { label: string; title: string }) {
  return <header className="page-heading"><p className="eyebrow">{label}</p><h1>{title}<span>.</span></h1></header>;
}
