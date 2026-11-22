import legacyCatalog from '../editorial/legacy-catalog.json';
import legacyEdition from '../editorial/legacy.json';
import publishedEditions from '../editorial/editions.json';
import { readPublishedEditions } from '../editorial/edition.mjs';

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
  editorialSource?: string;
  editorialUrl?: string;
  date?: string;
  minutes?: number;
  mixStyle?: 'rnb'|'soul'|'blues'|'pop'|'light-house'|'funk';
  viewCount?: number;
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

export const { albums, mixes, playlists, live, archive } = legacyCatalog as Record<
  'albums' | 'mixes' | 'playlists' | 'live' | 'archive', Recommendation[]
>;

interface Edition {
  number: string;
  startsOn: string;
  label: string;
  featured: Recommendation;
  albums: Recommendation[];
  mixes: Recommendation[];
  playlists: Recommendation[];
  live: Recommendation[];
}

export const issues: Edition[] = [{
  ...legacyEdition, featured: mixes[0], albums, mixes, playlists: playlists.slice(0, 2), live: live.slice(0, 3),
}];

export const catalog = [...new Map([...albums, ...mixes, ...playlists, ...live, ...archive].map(item => [item.id, item])).values()];
const drafts = (Array.isArray(publishedEditions) ? publishedEditions : []) as (Omit<Edition, 'featured'> & { featuredId: string })[];
for (const draft of readPublishedEditions(drafts, legacyEdition, catalog)) {
  const featured = draft.mixes.find(item => item.id === draft.featuredId)!;
  issues.push({ ...draft, featured });
}

export type RadioMetadata =
  | { provider: 'radio-france' | 'azuracast'; endpoint: string }
  | { provider: 'nts'; endpoint: string; channel: '1' | '2' }
  | { provider: 'nova-page'; endpoint: string };

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
  metadata: { provider: 'radio-france', endpoint: 'https://api.radiofrance.fr/livemeta/pull/' + station },
});

export const stations: Station[] = [
  {
    name: 'FIP', label: 'Radio France', description: 'Une radio parisienne à la discothèque éclectique.',
    url: 'https://www.radiofrance.fr/fip',
    stream: 'https://icecast.radiofrance.fr/fip-midfi.mp3?id=openapi',
    metadata: { provider: 'radio-france', endpoint: 'https://api.radiofrance.fr/livemeta/pull/7' },
  },
  { name: 'NTS 1', label: 'NTS', description: 'Le premier canal de NTS en direct.', url: 'https://www.nts.live/', stream: 'https://stream-relay-geo.ntslive.net/stream',
    metadata: { provider: 'nts', endpoint: 'https://www.nts.live/api/v2/live', channel: '1' },
  },
  { name: 'Radio La Belle Aventure', label: 'Indépendante', description: 'Une radio bretonne éclectique, soutenue par ses auditeurs.', url: 'https://www.radiolabelleaventure.com/', stream: 'https://flux.radiolabelleaventure.com/listen/radio_la_belle_aventure/radio.mp3',
    metadata: { provider: 'azuracast', endpoint: 'https://flux.radiolabelleaventure.com/api/nowplaying/radio_la_belle_aventure' },
  },
  { name: 'Radio Nova', label: 'Nova', description: 'Le Grand Mix, de la soul et du reggae au rap et à l’électro.',
    url: 'https://www.nova.fr/radios/radio-nova/', stream: 'https://novazz.ice.infomaniak.ch/novazz-128.mp3',
    metadata: { provider: 'nova-page', endpoint: 'https://r.jina.ai/https://www.nova.fr/radios/radio-nova/' } },
  fip('FIP Groove', 66, 'La soul, le funk et les disques qu’ils ont inspirés.'),
  { name: 'Nouvo Nova', label: 'Nova', description: 'Les nouveautés choisies par l’équipe de Nova.',
    url: 'https://www.nova.fr/radios/nouvo-nova/', stream: 'https://nova-nouvo.ice.infomaniak.ch/nova-nouvo-128.mp3',
    metadata: { provider: 'nova-page', endpoint: 'https://r.jina.ai/https://www.nova.fr/radios/nouvo-nova/' } },
  fip('FIP Rock', 64, 'Le rock, des classiques aux marges.'),
  fip('FIP Jazz', 65, 'Le jazz à travers les époques, les styles et les scènes.'),
  { name: 'Nova la nuit', label: 'Nova', description: 'Grooves rares et versions longues à la nuit tombée.',
    url: 'https://www.nova.fr/radios/nova-lanuit/', stream: 'https://nova-ln.ice.infomaniak.ch/nova-ln-128.mp3',
    metadata: { provider: 'nova-page', endpoint: 'https://r.jina.ai/https://www.nova.fr/radios/nova-lanuit/' } },
  fip('FIP Electro', 74, 'Les musiques électroniques, du downtempo au club.'),
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
