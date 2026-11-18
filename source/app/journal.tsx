'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Disc3, Headphones, Menu, Music2, Play, Plus, Radio, X } from 'lucide-react';
import { archive, catalog, issues, live, parsePlaylist, personalPlaylist, playlists, stations, type Format, type Recommendation } from './content';

import { selectEdition } from '../editorial/edition.mjs';
import { editionShelf } from '../editorial/shelves.mjs';
import RadioTrack, { type OnAir } from './radio-track';

const pages = [
  ['rotation', 'Sélection'], ['radio', 'Radios'], ['playlists', 'Playlists'],
  ['live', 'Live'], ['mix', 'Mix'], ['archive', 'Archives'], ['library', 'Ma collection'],
] as const;
type Page = typeof pages[number][0];
const formatLabels: Record<Format, string> = {
  Album: 'Album', 'Radio show': 'Émission radio', Playlist: 'Playlist', 'Live session': 'Session live', Track: 'Morceau',
};
const viewLabels: Record<string, string> = {
  Saved: 'Favoris', 'All discoveries': 'Toutes les découvertes', Listened: 'Déjà écouté',
  Loved: 'Coup de cœur', Interesting: 'Intéressant', 'Not for me': 'Pas pour moi',
  'Worth revisiting': 'À réécouter',
};
const reactions = ['Loved', 'Interesting', 'Not for me', 'Worth revisiting'] as const;
type Reaction = typeof reactions[number];
type Entry = { saved?: boolean; listened?: boolean; reaction?: Reaction };
type Library = { entries: Record<string, Entry>; playlists: Recommendation[]; radioTracks: Record<string, Recommendation>; curators: string[] };
const emptyLibrary: Library = { entries: {}, playlists: [], radioTracks: {}, curators: [] };
const storageKey = 'off-frequency.library.v1';
const dateLabel = (value: string) => new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium', timeZone: 'UTC',
}).format(new Date(value + 'T12:00:00Z'));
const displayMinutes = (minutes: number) => Math.ceil(minutes) + ' min';
function SourceLink({ item, children }: { item: { url: string }; children: ReactNode }) {
  return <a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={15} /></a>;
}

function Player({ item }: { item: Recommendation }) {
  if (!item.embed) return null;
  const { provider, id } = item.embed;
  const spotify = provider === 'spotify';
  return <iframe className={spotify ? 'spotify-frame' : 'youtube-frame'} loading="lazy"
    title={'Lecteur : ' + item.title}
    src={spotify ? 'https://open.spotify.com/embed/' + (item.format === 'Album' ? 'album/' : 'playlist/') + id + '?locale=fr' : 'https://www.youtube-nocookie.com/embed/' + id + '?hl=fr'}
    allow={spotify ? 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' : 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share'}
    allowFullScreen />;
}

function Artwork({ item, index = 0 }: { item: Recommendation; index?: number }) {
  const [failed, setFailed] = useState(false);
  return <div className={`artwork artwork-${index % 3}`}>
    {item.artwork && !failed
      ? <img src={item.artwork} alt="" loading="lazy" onError={() => setFailed(true)} />
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
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [ready, setReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [station, setStation] = useState(stations[0]);
  const [radioOpen, setRadioOpen] = useState(false);
  const [audioError, setAudioError] = useState(false);
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
      setPage(match?.[0] ?? 'rotation');
      setMobileOpen(false);
      if (match) window.scrollTo({ top: 0, behavior: 'instant' });
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    setIssue(selectEdition(issues) ?? issues[0]);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLibrary({ ...emptyLibrary, ...JSON.parse(raw) });
    } catch {
      setStorageMessage('Impossible de lire ta collection dans ce navigateur.');
    }
    setReady(true);
    return () => window.removeEventListener('hashchange', readHash);
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
  const save = (item: Recommendation) => setLibrary(state => {
    const entry = state.entries[item.id];
    const saved = !entry?.saved;
    return {
      ...state,
      entries: { ...state.entries, [item.id]: { ...entry, saved } },
      radioTracks: item.format === 'Track' && saved && !state.radioTracks[item.id]
        ? { ...state.radioTracks, [item.id]: item }
        : state.radioTracks,
    };
  });

  const currentRadioTrack = ({ title, artist }: OnAir): Recommendation => ({
    id: 'radio-track:' + JSON.stringify([title, artist ?? ''].map(value => value.trim().normalize().toLowerCase())),
    title,
    creator: artist,
    format: 'Track',
    source: station.name,
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

  const tune = (next: typeof station) => {
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

  const cards = (items: Recommendation[], withPlayers = false) => <div className="card-grid">
    {items.map((item, index) => <article className="music-card" key={item.id}>
      {withPlayers && item.embed ? <Player item={item} /> : <Artwork item={item} index={index} />}
      <div className="card-body">
        <div className="flex justify-between items-center gap-2">
          <p className="eyebrow">{formatLabels[item.format]}{item.format !== 'Album' && <> <span aria-hidden="true">·</span> {item.source}</>}</p>
          {saveButton(item)}
        </div>
        <h3><button onClick={() => setSelected(item)}>{item.title}</button></h3>
        {item.creator && <p className="creator">{[item.creator, item.publisher].filter(Boolean).join(' · ')}</p>}
        {(item.date || item.minutes) && <p className="metadata">{[item.date && dateLabel(item.date), item.minutes && displayMinutes(item.minutes)].filter(Boolean).join(' · ')}</p>}
        {item.note && <p className="card-note">{item.note}</p>}
        {(item.mood || item.season || item.genre) && <p className="tags">{[item.genre, item.mood, item.season].filter(Boolean).join(' · ')}</p>}
        <div className="card-actions">
          <button onClick={() => setSelected(item)} className="text-link">Infos tracks <ArrowRight size={14} /></button>
          <SourceLink item={item}>{item.format === 'Track' ? 'Rechercher sur Spotify' : item.format === 'Album' ? 'Écouter sur Spotify' : item.source}</SourceLink>
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

  const all = [...new Map([...catalog, ...issues.flatMap(edition => [
    edition.featured, ...edition.albums, ...edition.mixes, ...edition.playlists, ...edition.live,
  ]), ...library.playlists, ...Object.values(library.radioTracks)].map(item => [item.id, item])).values()];
  const shelfResults = shelf.filter(item => (!curator || (curator === '★ Créateurs favoris'
    ? library.curators.includes(item.creator ?? '') : item.creator === curator))
    && (!genre || item.genre === genre) && (!season || item.season === season) && (!shelfMood || item.mood === shelfMood));
  const libraryResults = all.filter(item => {
    const entry = library.entries[item.id];
    const inView = libraryView === 'All discoveries' || (libraryView === 'Saved' && entry?.saved)
      || (libraryView === 'Listened' && entry?.listened) || entry?.reaction === libraryView;
    return inView && (!format || item.format === format) && (!mood || item.mood === mood)
      && (!source || item.source === source) && (!duration || (item.minutes != null && item.minutes <= Number(duration)));
  });
  const featured = issue.featured;
  const currentEntry = selected ? library.entries[selected.id] : undefined;

  return <>
    <a className="skip-link" href="#main-content">Aller au contenu</a>
    <header className="masthead">
      <div className="shell nav-inner">
        <a className="brand" href="#rotation" aria-label="Accueil Bonnes Ondes"><span className="brand-disc"><Disc3 size={20} /></span>Bonnes Ondes<span className="brand-dot">.</span></a>
        <button className="menu-button icon-button" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-controls="main-nav" aria-label="Afficher ou masquer le menu">{mobileOpen ? <X /> : <Menu />}</button>
        <nav id="main-nav" aria-label="Navigation principale" className={mobileOpen ? 'nav-open' : ''}>
          {pages.map(([key, label]) => <a href={'#' + key} key={key} aria-current={page === key ? 'page' : undefined}
            className={key === 'library' ? 'library-nav' : undefined}>
            {key === 'library' && <Bookmark size={15} />}{label}
          </a>)}
        </nav>
      </div>
    </header>

    <main className="shell" id="main-content">
      {storageMessage && <p className="empty" role="status">{storageMessage}</p>}
      {page === 'rotation' && <>
        <div className="issue-line"><span><span className="signal-dot" /> Journal musical</span><span>N° {issue.number} <b> / </b> {issue.label}</span></div>
        <header className="intro">
          <h1>Bonnes Ondes<span>.</span></h1>
          <div className="intro-aside"><h2>La sélection de la semaine</h2><p>Des disques, des radios et des concerts choisis chaque semaine.</p>
            <a className="text-link" href="#essential-albums">Voir la sélection <ArrowDown size={15} /></a></div>
        </header>
        <article className="feature">
          <div className="feature-art"><img src="/art/disques.jpg" alt="Une personne porte une pile de disques vinyles sous le bras" /></div>
          <div className="feature-copy">
            <p className="eyebrow"><span className="signal-dot" /> Mix de la semaine</p>
            <h2>{featured.title}</h2>
            <p className="feature-meta">{featured.source} {featured.date && ' / ' + dateLabel(featured.date)}</p>
            <p className="feature-note">{featured.note}</p>
            <div className="flex flex-wrap gap-3 items-center">
              <a className="primary" href={featured.url} target="_blank" rel="noopener noreferrer"><Play size={15} fill="currentColor" /> Écouter le mix</a>
              {saveButton(featured, 'hero-save')}
            </div>
            <button className="text-link feature-notes" onClick={() => setSelected(featured)}>Infos tracks <ArrowRight size={14} /></button>
          </div>
        </article>
        <Section label="DISQUES" title="Trois albums essentiels" id="essential-albums">{cards(issue.albums)}</Section>
        <Section label="SUR LES ONDES" title="Radios et mixes">{cards(issue.mixes)}</Section>
        <Section label="SUR SPOTIFY" title="Les playlists de la semaine">{cards(issue.playlists, true)}</Section>
        <Section label="LIVE" title="Deux performances à découvrir">{cards(issue.live, true)}</Section>
      </>}

      {page === 'radio' && <>
        <PageHeading label="EN DIRECT" title="Radios" note="Choisis une station. Le lecteur reste à portée de main pendant que tu navigues." />
        <div className="station-grid">
          {stations.map(item => <article className="station" key={item.name}>
            <Radio size={22} /><p className="eyebrow">{item.label}</p><h2>{item.name}</h2><p>{item.description}</p>
            {item.stream || item.embed
              ? <button className="text-link" onClick={() => tune(item)}><Play size={14} /> Écouter</button>
              : <SourceLink item={item}>Écouter sur le site de la radio</SourceLink>}
          </article>)}
        </div>
      </>}

      {page === 'playlists' && <>
        <PageHeading label="SÉLECTIONS INDÉPENDANTES" title="Playlists" note="Des playlists indépendantes et de saison, auxquelles tu peux ajouter tes trouvailles." />
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
        <PageHeading label="SESSIONS ET REPRISES" title="Live" note="Des performances à regarder, le son bien ouvert." />
        {cards(liveShelf, true)}
      </>}

      {page === 'mix' && <>
        <PageHeading label="SUR LES ONDES" title="Mix" note="Des sets de DJ et des émissions à écouter en replay." />
        {cards(issue.mixes)}
      </>}

      {page === 'archive' && <>
        <PageHeading label="À RÉÉCOUTER" title="Archives" note="Une sélection à réécouter. Retrouve les anciennes playlists et sessions dans leurs rubriques, et les sélections hebdomadaires dans « Ma collection », sous « Toutes les découvertes »." />
        {cards(archive)}
      </>}

      {page === 'library' && <>
        <PageHeading label="TES FAVORIS" title="Ma collection" note="Retrouve tes favoris, tes écoutes et les découvertes auxquelles tu veux revenir." />
        <div className="filters library-filters">
          <label className="filter">Afficher<select value={libraryView} onChange={event => setLibraryView(event.target.value)}>
            {['Saved', 'All discoveries', 'Listened', ...reactions].map(value => <option key={value} value={value}>{viewLabels[value]}</option>)}
          </select></label>
          {filter('Format', format, setFormat, [...new Set(all.map(item => item.format))])}
          {filter('Ambiance', mood, setMood, options(all, 'mood'))}
          {filter('Source', source, setSource, options(all, 'source'))}
          <label className="filter">Durée d’écoute<select value={duration} onChange={event => setDuration(event.target.value)}>
            <option value="">Toutes les durées</option><option value="15">Jusqu’à 15 min</option>
            <option value="60">Jusqu’à 1 h</option><option value="180">Jusqu’à 3 h</option>
          </select></label>
        </div>
        {libraryResults.length ? cards(libraryResults) : <p className="empty">{libraryView === 'Saved' && !Object.values(library.entries).some(entry => entry.saved) ? 'Utilise le marque-page d’une recommandation pour la retrouver ici.' : 'Aucune découverte ne correspond à ces filtres.'}</p>}
      </>}
    </main>

    <footer className="shell footer"><a className="brand" href="#rotation"><Disc3 size={19} /> Bonnes Ondes<span className="brand-dot">.</span></a><span>JOURNAL MUSICAL INDÉPENDANT</span></footer>

    <aside className="radio-dock" aria-label="Lecteur radio">
      {radioOpen && <div className="dock-expanded">
        <div className="flex gap-2 items-center justify-between"><strong>{station.name}</strong><button className="icon-button" onClick={() => setRadioOpen(false)} aria-label="Fermer le lecteur radio"><X size={18} /></button></div>
        <label className="filter">Station<select value={station.name} onChange={event => {
          const next = stations.find(item => item.name === event.target.value);
          if (next) tune(next);
        }}>{stations.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
        {station.metadata && <RadioTrack key={station.name} metadata={station.metadata}
          saveTrack={track => saveButton(currentRadioTrack(track), 'text-link radio-save', true)} />}
        {station.stream && <audio key={station.stream} src={station.stream} controls preload="none" onError={() => setAudioError(true)} />}
        {station.embed && <iframe className="radio-frame" title={station.name + ' en direct'} src={station.embed} allow="autoplay" />}
        {audioError && <p role="status">Le flux n’a pas démarré. Essaie le lecteur de la station.</p>}
        <SourceLink item={station}>Ouvrir le site de la radio</SourceLink>
      </div>}
      {!radioOpen && <button className="dock-toggle" onClick={() => tune(station)}><Headphones size={18} /> Lecteur radio <Plus size={15} /></button>}
    </aside>

    <dialog ref={modal} onClose={() => setSelected(null)} onClick={event => {
      if (event.target === event.currentTarget) setSelected(null);
    }} aria-labelledby="listening-title">
      {selected && <div className="dialog-content">
        <button className="icon-button close-dialog" onClick={() => setSelected(null)} aria-label="Fermer les infos tracks" autoFocus><X size={22} /></button>
        <p className="eyebrow">{formatLabels[selected.format]}{selected.format !== 'Album' && ' · ' + selected.source}</p>
        <h2 id="listening-title">{selected.title}</h2>
        {selected.creator && <p className="creator">{[selected.creator, selected.publisher].filter(Boolean).join(' · ')}</p>}
        {(selected.date || selected.minutes) && <p className="metadata">{[selected.date && dateLabel(selected.date), selected.minutes && displayMinutes(selected.minutes)].filter(Boolean).join(' · ')}</p>}
        {selected.note && <p>{selected.note}</p>}
        {selected.reason && <div className="why"><p className="eyebrow">POURQUOI ON L’A CHOISI</p><p>{selected.reason}</p></div>}
        <Player item={selected} />
        <div className="dialog-actions"><SourceLink item={selected}>{selected.format === 'Track' ? 'Rechercher sur Spotify' : (selected.format === 'Album' || !selected.embed ? 'Écouter sur ' : 'Ouvrir sur ') + selected.source}</SourceLink>{saveButton(selected)}</div>
        <div className="feedback">
          <label><input type="checkbox" checked={!!currentEntry?.listened} onChange={event => {
            const checked = event.target.checked;
            updateEntry(selected.id, entry => ({ ...entry, listened: checked }));
          }} /> Déjà écouté</label>
          <label>Ta réaction<select value={currentEntry?.reaction ?? ''} onChange={event => {
            const reaction = (event.target.value || undefined) as Reaction | undefined;
            updateEntry(selected.id, entry => ({ ...entry, reaction }));
          }}><option value="">Choisir une réaction</option>{reactions.map(value => <option key={value} value={value}>{viewLabels[value]}</option>)}</select></label>
          {selected.format === 'Playlist' && selected.creator && <button className="text-link" aria-pressed={library.curators.includes(selected.creator)}
            onClick={() => favoriteCurator(selected.creator!)}><Music2 size={16} />{library.curators.includes(selected.creator) ? 'Retirer ce créateur des favoris' : 'Ajouter ce créateur aux favoris'}</button>}
        </div>
      </div>}
    </dialog>
  </>;
}

function PageHeading({ label, title, note }: { label: string; title: string; note: string }) {
  return <header className="page-heading"><p className="eyebrow"><span className="signal-dot" /> {label}</p><h1>{title}<span>.</span></h1><p>{note}</p></header>;
}
