export type Format = 'Album' | 'Radio show' | 'Playlist' | 'Live session' | 'Track';

export interface Recommendation {
  id: string;
  title: string;
  creator?: string;
  format: Format;
  source: string;
  publisher?: string;
  url: string;
  artwork?: string;
  date?: string;
  minutes?: number;
  mood?: string;
  season?: string;
  genre?: string;
  note?: string;
  reason?: string;
  embed?: { provider: 'spotify' | 'youtube'; id: string };
}

const playlist = (id: string, title: string, creator: string, details: Partial<Recommendation> = {}): Recommendation => ({
  id: 'spotify-' + id, title, creator, format: 'Playlist', source: 'Spotify',
  url: 'https://open.spotify.com/playlist/' + id, embed: { provider: 'spotify', id }, ...details,
});

export const playlists = [
  playlist('7LXauPdOlnW55FQNDWPotY', '🔮 TRUE JAMS ✨', 'coupdemain', {
    genre: 'Indie / pop', note: 'La playlist de Coup De Main passe de Slow Pulp à Slayyyter et Sophia Stel.',
    reason: 'Pour découvrir les goûts du magazine à travers ses enchaînements.',
  }),
  playlist('2IbPrDIVfPmxZF6akHnj8R', 'oat milk lattes in the mountains', 'kasey gelsomino', {
    mood: 'Matins tranquilles', season: 'Automne', genre: 'Indie folk',
    note: 'Adrianne Lenker, Searows et Neil Young pour un matin tranquille à la maison.',
    reason: 'Notre choix pour un après-midi d’automne où l’on préfère laisser la main à quelqu’un d’autre.',
  }),
  playlist('37i9dQZF1DXdwmD5Q7Gxah', 'Lorem', 'Spotify'),
  playlist('3CjLCri3yLqkSKBZvc8HSR', 'fickleberry FM', 'keni'),
];

const session = (id: string, title: string, creator: string, publisher: string, details: Partial<Recommendation>): Recommendation => ({
  id, title, creator, publisher, format: 'Live session', source: 'YouTube',
  url: 'https://www.youtube.com/watch?v=' + id,
  artwork: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', embed: { provider: 'youtube', id }, ...details,
});

export const live = [
  session('xL1yyEflGlo', 'Doudou (reprise d’Aya Nakamura)', 'INO CASABLANCA', 'Basique', {
    date: '2025-05-04', minutes: 3.2, mood: 'Détente',
    note: 'INO CASABLANCA reprend « Doudou » d’Aya Nakamura pour Basique.',
    reason: 'Écoute comment sa voix et son phrasé déplacent les accents de la mélodie.',
  }),
  session('2scS3s_I050', 'Joy.', 'RAYE feat. Amma & Absolutely', 'The Late Show with Stephen Colbert', {
    note: 'RAYE partage la scène avec Amma et Absolutely.',
    reason: 'Les trois voix se passent le relais, puis se rejoignent.',
  }),
  session('NOvIw8rBK4Q', 'My Moon My Man', 'FINNEAS', 'Canadian Songwriters Hall of Fame', {
    note: 'FINNEAS reprend Feist au Panthéon des auteurs et compositeurs canadiens en 2026.',
  }),
  session('HLaZ38r8ecA', 'Brand New Chanel$', 'Slayyyter', 'triple j Like A Version', {
    note: 'Slayyyter interprète son morceau dans le studio de triple j.',
  }),
  session('iLF0ZNdhNM0', 'YUKON (sur la scène des Grammy Awards 2026)', 'Justin Bieber', 'JustinBieberVEVO', {
    date: '2026-04-16', minutes: 5.15,
    note: 'Justin Bieber interprète « YUKON » lors de la 68e cérémonie des Grammy Awards.',
    reason: 'Un arrangement intime sur une grande scène qui laisse toute la place à la voix.',
  }),
];

export const albums: Recommendation[] = [
  {
    id: 'lahai', title: 'Lahai', creator: 'Sampha', format: 'Album', source: 'Spotify',
    url: 'https://open.spotify.com/album/5GuWww4OaildzkmTTlfMN3', embed: { provider: 'spotify', id: '5GuWww4OaildzkmTTlfMN3' }, date: '2023-10-20', minutes: 42, artwork: 'https://f4.bcbits.com/img/a1179241798_5.jpg',
    mood: 'Introspectif', genre: 'Soul',
    note: 'La voix de Sampha se faufile entre piano, rythmes syncopés et harmonies superposées.',
    reason: 'Commence par « Spirit 2.0 » et suis les percussions à mesure que l’arrangement s’ouvre.',
  },
  {
    id: 'promises', title: 'Promises', creator: 'Floating Points, Pharoah Sanders & The London Symphony Orchestra',
    format: 'Album', source: 'Spotify', url: 'https://open.spotify.com/album/3ShtO5VCYa3ctlR5uzLWBa', embed: { provider: 'spotify', id: '3ShtO5VCYa3ctlR5uzLWBa' },
    date: '2021-03-26', minutes: 47, artwork: 'https://f4.bcbits.com/img/a2975740667_5.jpg', mood: 'Introspectif', genre: 'Jazz',
    note: 'Un motif récurrent relie neuf mouvements pour électronique, saxophone et orchestre.',
    reason: 'Écoute l’album d’une traite, jusqu’aux cordes qui montent derrière Sanders dans « Movement 6 ».',
  },
  {
    id: 'a-la-sala', title: 'A LA SALA', creator: 'Khruangbin', format: 'Album', source: 'Spotify',
    url: 'https://open.spotify.com/album/1PeC1ckDJSzYHkwo6JHbP2', embed: { provider: 'spotify', id: '1PeC1ckDJSzYHkwo6JHbP2' }, date: '2024-04-05', minutes: 39, artwork: 'https://f4.bcbits.com/img/a4088322578_5.jpg',
    mood: 'Matins tranquilles', genre: 'Soul psychédélique',
    note: 'Un disque aéré où guitare, basse et batterie se répondent en permanence.',
    reason: 'Sur « May Ninth », quelques notes de guitare suffisent à installer toute une ambiance.',
  },
];

export const mixes: Recommendation[] = [
  {
    id: 'floating-points-sep', title: 'Floating Points', creator: 'Floating Points',
    format: 'Radio show', source: 'NTS Radio', date: '2026-09-21', mood: 'Fin de soirée', genre: 'Soul / house',
    artwork: 'https://media2.ntslive.co.uk/resize/1600x1600/5f4bfd54-08aa-434c-937e-281638bd1952_1459292400.jpeg',
    url: 'https://www.nts.live/shows/floating-points/episodes/floating-points-21st-september-2026',
    note: 'Soul rare et grooves chaleureux. Dans cette archive de NTS, Sam Shepherd nous emmène doucement vers la piste de danse.',
    reason: 'Reste pour le passage de Larry Young à Lincoln Olivetti. Sam Shepherd change de disque sans rompre l’ambiance.',
  },
  {
    id: 'nova-club', title: 'Sets de HiTech, Logic1000 et Victor Rosado', creator: 'Nova Club avec David Blot',
    format: 'Radio show', source: 'Radio Nova', minutes: 116,
    artwork: 'https://assets.voxeus.com/podcasts/assets/images/rs/episode/1200/97fc6857072b59da3058f34125f5daea0373f28a/61be0085-e2df-438a-8191-566469bd419f/2a2e6900633f82b58ff759df8787e26365a409ac.png', mood: 'Pour danser',
    url: 'https://podcasts.nova.fr/radio-nova-nova-club/202504161240-special-djs-sets-hi-tech-logic1000-et-victor-rosado-du-parad',
    note: 'Trois sets qui relient Detroit, Berlin et New York.',
    reason: 'Trois façons de faire danser une salle dans la même émission.',
  },
  {
    id: 'floating-points-brilliant-corners', title: 'Live from Brilliant Corners',
    creator: 'Floating Points & Four Tet', format: 'Radio show', source: 'NTS Radio',
    date: '2017-07-10', mood: 'Fin de soirée',
    url: 'https://www.nts.live/shows/floating-points/episodes/floating-points-10th-july-2017',
    note: 'Floating Points et Four Tet aux platines de Brilliant Corners, à Londres.',
    reason: 'Un set à deux pour prolonger la sélection NTS du mois de septembre.',
  },
];

export const archive: Recommendation[] = [
  {
    id: 'floating-points-2018', title: 'Floating Points, Jamie XX, Four Tet & Daphni',
    creator: 'Floating Points, Jamie xx, Four Tet & Daphni', format: 'Radio show', source: 'NTS Radio',
    date: '2018-10-29', mood: 'Pour danser',
    url: 'https://www.nts.live/shows/floating-points/episodes/floating-points-four-tet-daphni-and-jamie-xx-29th-october-2018',
    note: 'Quatre DJs se relaient aux platines un lundi à Londres.',
    reason: 'En se passant la main, les DJs laissent à chaque disque la possibilité de faire bifurquer le set.',
  },
  albums[1], playlists[3],
];

export const issues = [{
  number: '001', startsOn: '2026-11-16', label: 'du 16 au 22 novembre 2026',
  featured: mixes[0], albums, mixes, playlists: playlists.slice(0, 2), live: live.slice(0, 2),
}];

export const catalog = [...new Map([...albums, ...mixes, ...playlists, ...live, ...archive].map(item => [item.id, item])).values()];

export type RadioMetadata =
  | { provider: 'radio-france' | 'azuracast'; endpoint: string }
  | { provider: 'nts'; endpoint: string; channel: '1' | '2' };

export interface Station {
  name: string;
  label: string;
  description: string;
  url: string;
  stream?: string;
  metadata?: RadioMetadata;
  embed?: string;
}
const fip = (name: string, station: number, description: string): Station => ({
  name, label: 'Radio France', description, url: 'https://www.radiofrance.fr/fip',
  embed: 'https://embed.radiofrance.fr/fip/player?id_station=' + station,
});

export const stations: Station[] = [
  {
    name: 'FIP', label: 'Radio France', description: 'Une radio parisienne à la discothèque éclectique.',
    url: 'https://www.radiofrance.fr/fip',
    stream: 'https://icecast.radiofrance.fr/fip-midfi.mp3?id=openapi',
    metadata: { provider: 'radio-france', endpoint: 'https://api.radiofrance.fr/livemeta/pull/7' },
  },
  fip('FIP Jazz', 65, 'Le jazz à travers les époques, les styles et les scènes.'),
  fip('FIP Groove', 66, 'La soul, le funk et les disques qu’ils ont inspirés.'),
  fip('FIP Electro', 74, 'Les musiques électroniques, du downtempo au club.'),
  fip('FIP Rock', 64, 'Le rock, des classiques aux marges.'),
  { name: 'Radio Nova', label: 'Nova', description: 'Le Grand Mix, de la soul et du reggae au rap et à l’électro.', url: 'https://www.nova.fr/radios/' },
  { name: 'Nova la nuit', label: 'Nova', description: 'Grooves rares et versions longues à la nuit tombée.', url: 'https://www.nova.fr/radios/nova-lanuit/' },
  { name: 'Nouvo Nova', label: 'Nova', description: 'Les nouveautés choisies par l’équipe de Nova.', url: 'https://www.nova.fr/radios/nouvo-nova/' },
  { name: 'Radio La Belle Aventure', label: 'Indépendante', description: 'Une radio bretonne éclectique, soutenue par ses auditeurs.', url: 'https://www.radiolabelleaventure.com/', stream: 'https://flux.radiolabelleaventure.com/listen/radio_la_belle_aventure/radio.mp3',
    metadata: { provider: 'azuracast', endpoint: 'https://flux.radiolabelleaventure.com/api/nowplaying/radio_la_belle_aventure' },
  },
  { name: 'NTS 1', label: 'NTS', description: 'Le premier canal de NTS en direct.', url: 'https://www.nts.live/', stream: 'https://stream-relay-geo.ntslive.net/stream',
    metadata: { provider: 'nts', endpoint: 'https://www.nts.live/api/v2/live', channel: '1' },
  },
  { name: 'NTS 2', label: 'NTS', description: 'Le deuxième canal de NTS en direct.', url: 'https://www.nts.live/', stream: 'https://stream-relay-geo.ntslive.net/stream2',
    metadata: { provider: 'nts', endpoint: 'https://www.nts.live/api/v2/live', channel: '2' },
  },
];

export function parsePlaylist(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.origin === 'https://open.spotify.com') {
      return url.pathname.match(/^\/(?:intl-[a-z]+\/)?playlist\/([a-zA-Z0-9]{22})\/?$/)?.[1];
    }
  } catch {}
}

export function personalPlaylist(id: string, title: string, curator: string, mood: string, season: string, genre: string) {
  return playlist(id, title || 'Playlist Spotify', curator, { mood, season, genre });
}
