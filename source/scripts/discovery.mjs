import { canonicalUrl, isoDate, sourceUrl } from '../editorial/edition.mjs';
import { editorialFeed, parseFeed, reviewedArtist, spotifyCandidate, text } from './discovery-feeds.mjs';

import { linkedReleaseSources } from './weekly-evidence.mjs';
import { livePerformer } from './recommendation-policy.mjs';
import { bandcampLinks } from './bandcamp-albums.mjs';

const formats = ['Album', 'Radio show', 'Playlist', 'Live session'];
const label = value => text(value).normalize('NFC').toLowerCase();
const excludedVideo = /\b(?:shorts?|interview|behind the scenes|behind (?:the|.+ like a) version|teaser|trailer|sneak peek|official music video|preview|highlight(?:s)?|extrait)\b/i;

// NTS exposes genre links on the individual episode page, not consistently
// in the episode-list API. Restrict extraction to the matching H1 header,
// before the description / related programmes so tags cannot bleed across.
export function ntsEpisodePageGenres(html,title){
  if(typeof html!=='string')return [];
  const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
  const head=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].find(m=>label(plain(m[1]))===label(title));
  if(!head)return [];
  const section=html.slice(head.index+head[0].length,head.index+head[0].length+16000).split(/<h[1-4]\b|You Might Also Like|Tracklist/i)[0];
  return [...new Set([...section.matchAll(/<a\b[^>]*href=["'](?:https:\/\/www\.nts\.live)?\/explore\/genre\/[a-z0-9-]+\/?["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>plain(m[1])).filter(x=>x&&x.length<=80))].slice(0,20);
}

function ntsCandidates(payload, source) {
  const episodes = payload?.results;
  if (!Array.isArray(episodes)) throw new Error('Liste des épisodes NTS absente.');
  return episodes.filter(episode => episode?.status === 'published').slice(0, 8).flatMap(episode => {
    const { show_alias: show, episode_alias: alias } = episode;
    const title = text(episode.name);
    const date = text(episode.broadcast).slice(0, 10);
    if (!title || !isoDate(date) || ![show, alias].every(value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value))) {
      return [];
    }
    const tracklist = sourceUrl(episode.links?.find(link => link.rel === 'tracklist')?.href);
    const tracklistPath = '/api/v2/shows/' + show + '/episodes/' + alias + '/tracklist';
    return {
      ...(tracklist?.origin === 'https://www.nts.live' && tracklist.pathname === tracklistPath && { tracklistUrl: tracklist.href }),
      id: 'nts-' + alias, title, creator:source.curator, format: 'Radio show', source: 'NTS Radio', date,
      dateKind: 'broadcast', broadcastAt: text(episode.broadcast),
      tags: [...new Set([...(Array.isArray(episode.genres)?episode.genres:[]),...(Array.isArray(episode.embeds?.genres)?episode.embeds.genres:[])].map(g=>typeof g==='string'?g:g?.name??g?.title).filter(g=>typeof g==='string'&&g.length<=80))].slice(0,20),
      url: 'https://www.nts.live/shows/' + show + '/episodes/' + alias,
      artwork: sourceUrl(episode.media?.picture_medium)?.href,
    };
  });
}

function youtubeCandidates(xml, source) {
  const feed = parseFeed(xml).feed;
  const feedChannel = feed?.['yt:channelId'];
  if (![source.channelId, source.channelId.slice(2)].includes(feedChannel)) {
    throw new Error('Chaîne YouTube non confirmée.');
  }
  return (feed.entry ?? []).filter(entry => {
    const title = text(entry.title);
    const alternate = sourceUrl(entry.link?.['@_href']);
    return !alternate?.pathname.startsWith('/shorts/') && !excludedVideo.test(title)
      && (!source.titleContains || label(title).includes(label(source.titleContains)))
      && (!source.titleMatchesAny || source.titleMatchesAny.some(marker => label(title).includes(label(marker))));
  }).slice(0, 15).flatMap(entry => {
    const id = entry['yt:videoId'];
    const title = text(entry.title);
    const publishedAt = text(entry.published);
    const date = publishedAt.slice(0, 10);
    if (entry['yt:channelId'] !== source.channelId || !/^[a-zA-Z0-9_-]{11}$/.test(id ?? '') || !title || !isoDate(date)) {
      return [];
    }
    return {
      id: 'youtube-' + id, title, format: 'Live session', source: source.name,
      url: 'https://www.youtube.com/watch?v=' + id, creator: livePerformer(title, source.artist), date, dateKind: 'published', publishedAt,
      videoKind: /\b(?:covers?|reprise)\b/i.test(title) ? 'cover' : 'live',
      performanceKey: source.channelId + ':' + label(title).replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
    };
  });
}

export function deduplicate(candidates, existing = []) {
  const ids = new Set(existing.map(item => item.id));
  const links = new Set(existing.map(item => canonicalUrl(item.url)).filter(Boolean));
  const performances = new Set(existing.map(item => item.performanceKey).filter(Boolean));
  const fresh = [];
  const duplicates = [];
  for (const item of candidates) {
    const key = canonicalUrl(item.url);
    if ((item.id && ids.has(item.id)) || (key && links.has(key)) || (item.performanceKey && performances.has(item.performanceKey))) {
      duplicates.push(item);
    } else {
      fresh.push(item);
      if (item.id) ids.add(item.id);
      if (key) links.add(key);
      if (item.performanceKey) performances.add(item.performanceKey);
    }
  }
  return { candidates: fresh, duplicates };
}

function requester(fetcher) {
  const pending = new Map();
  const limited = new Set();
  return async url => {
    const target = sourceUrl(url);
    if (!target) throw new Error('URL HTTPS invalide.');
    const origin = target.origin;
    const next = (pending.get(origin) ?? Promise.resolve()).then(async () => {
      if (limited.has(origin)) throw new Error('Limite HTTP 429 atteinte pour cet hôte.');
      let response;
      try {
        response = await fetcher(url, { signal: AbortSignal.timeout(10_000), redirect: 'follow' });
      } catch {
        throw new Error('Réseau indisponible ou délai dépassé.');
      }
      if (response.status === 429) limited.add(origin);
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('HTTP ' + response.status);
      }
      if (response.url && !sourceUrl(response.url)) {
        await response.body?.cancel();
        throw new Error('Redirection vers une URL non HTTPS.');
      }
      return response;
    });
    pending.set(origin, next.catch(() => {}));
    return next;
  };
}

function prioritize(sources, profile) {
  if (!profile) return sources.filter(source => !source.onlyWhenFollowed);
  const preferences = new Set([
    ...profile.favoriteArtists, ...profile.favoriteRadios, ...profile.favoritePublications, ...profile.spotify.map(entry=>entry.name).filter(Boolean),
  ].map(label));
  const follows = profile.spotify.slice(0, 12).map((item, index) => ({
    id: 'spotify-follow-' + (index + 1), name: item.name ?? 'Spotify · lien suivi',
    method: item.kind === 'playlist' ? 'spotify-playlist' : 'Profil suivi. Son catalogue nécessite un accès Spotify autorisé.',
    mode: item.kind === 'playlist' ? 'automatic' : 'limited',
    url: item.url, format: 'Playlist', provider: 'Spotify', priority: 2,
  }));
  const enabled = sources.filter(source => !source.onlyWhenFollowed || preferences.has(label(source.artist)));
  return [...enabled, ...follows].sort((a, b) => {
    const score = item => item.priority ?? Number([item.provider, item.name, item.artist, item.curator].some(name => preferences.has(label(name))));
    return score(b) - score(a);
  });
}

async function verifyCandidate(item, source, request) {
  if (item.format === 'Playlist') {
    const metadata = await (await request('https://open.spotify.com/oembed?url=' + encodeURIComponent(item.url))).json();
    const iframe = sourceUrl(metadata.iframe_url);
    if (!text(metadata.title) || metadata.provider_name !== 'Spotify'
      || iframe?.origin !== 'https://open.spotify.com' || iframe.pathname !== '/embed/playlist/' + item.embed.id) {
      throw new Error('Destination de playlist non confirmée.');
    }
    return { ...item, title: text(metadata.title), creator: source.curator, source: 'Spotify', provider: source.provider, playlistOrigin: source.method === 'spotify-playlist' ? (source.priority === 2 ? 'followed' : 'configured') : 'publisher-discovered' };
  }
  if (source.method === 'youtube-atom') {
    const metadata = await (await request('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(item.url))).json();
    if (!text(metadata.title) || excludedVideo.test(metadata.title)) throw new Error('Vidéo non confirmée.');
    return { ...item, title: text(metadata.title), creator: livePerformer(text(metadata.title), source.artist) ?? item.creator,
      videoSourceUrl: item.url, officialVideo: true, embed: { provider: 'youtube', id: item.id.slice(8) } };
  }
  if (source.id === 'fip-tape') {
    const url = sourceUrl(item.url);
    if (!url || !/^\/fip\/podcasts\/fip-tape\/la-mixtape-de-[a-z0-9-]+-\d+\/?$/.test(url.pathname))
      throw new Error('Épisode FIP Tape non confirmé.');
    const response = await request(item.url);
    const resolved = response.url && sourceUrl(response.url);
    await response.body?.cancel();
    if (resolved && (resolved.hostname.replace(/^www\./,'') !== 'radiofrance.fr' || resolved.pathname !== url.pathname))
      throw new Error('Épisode FIP Tape redirigé hors de sa fiche.');
  }
  if (source.method === 'nts-episodes') {
    const response=await request(item.url);
    const resolved=response.url&&sourceUrl(response.url);
    if(resolved&&(resolved.origin!=='https://www.nts.live'||resolved.pathname!==new URL(item.url).pathname)){
      await response.body?.cancel();throw new Error('Épisode NTS redirigé hors de sa fiche.');
    }
    const tags=ntsEpisodePageGenres(await response.text(),item.title);
    return {...item,tags:[...new Set([...(item.tags??[]),...tags])]};
  }
  if (source.method === 'bandcamp-notes' && item.format === 'Album') {
    let links = item.bandcampUrls ?? [];
    try {
      const article = await (await request(item.url)).text();
      links = [...new Set([...links,...bandcampLinks(article,item.url)])].slice(0,8);
    } catch { /* RSS provenance remains, but an unavailable article is not an endorsement. */ }
    return { ...item, bandcampUrls:links,
      ...(links.length && {editorialKind:'curator-pick',editorialUrl:item.url,editorialSource:'Bandcamp Notes',editorialClaim:'I Love This Record'}) };
  }
  if (source.method === 'pitchfork-rss') {
    const response = await request(item.url);
    const url = response.url && sourceUrl(response.url);
    if (url && url.hostname.replace(/^www\./, '') !== 'pitchfork.com') {
      await response.body?.cancel();
      throw new Error('Critique redirigée hors de Pitchfork.');
    }
    const html = await response.text();
    return { ...item, creator: reviewedArtist(html, item.title), primaryReleaseUrls: linkedReleaseSources(html),
      ...(source.id === 'pitchfork-best' && {editorialSource:'Pitchfork',editorialUrl:item.url,editorialKind:'critic-pick',editorialClaim:'Best New Albums'}) };
  }
  return item;
}

async function collect(source, request, collectedAt) {
  const sourceId = source.id ?? source.name;
  if (source.mode !== 'automatic') {
    return { sourceId, name: source.name, feed: source.url, format: source.format, provider: source.provider,
      status: source.mode, note: source.method, items: [], leads: [], errors: [] };
  }
  const feed = source.method === 'youtube-atom'
    ? 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(source.channelId)
    : source.feed ?? source.url;
  const outcome = { sourceId, name: source.name, feed, format: source.format, provider: source.provider,
    status: 'ok', items: [], leads: [], errors: [] };
  try {
    let items;
    switch (source.method) {
      case 'nts-episodes': items = ntsCandidates(await (await request(feed)).json(), source); break;
      case 'youtube-atom': items = youtubeCandidates(await (await request(feed)).text(), source); break;
      case 'spotify-playlist': items = [spotifyCandidate(source.url, source.provenance ?? feed)].filter(Boolean); break;
      case 'curator-page': {
        const response = await request(feed);
        if (response.url && new URL(response.url).origin !== new URL(feed).origin) {
          await response.body?.cancel();
          throw new Error('Page de curateur redirigée hors de sa source.');
        }
        const html = await response.text();
        const captures = html.matchAll(/(?:href|src)\s*=\s*["'](https:\/\/open\.spotify\.com\/(?:embed\/)?playlist\/[a-zA-Z0-9]{22})(?=[?/#"'])/gi);
        items = [...new Set([...captures].map(match => match[1].replace('/embed/playlist/', '/playlist/')))]
          .slice(0, 8).map(url => spotifyCandidate(url, feed)).filter(Boolean);
        break;
      }
      case 'podcast-rss':
      case 'pitchfork-rss':
      case 'label-atom':
      case 'bandcamp-notes': {
        const parsed = editorialFeed(await (await request(feed)).text(), source);
        items = parsed.candidates;
        outcome.leads = parsed.leads.map(item => ({
          ...item, sourceId, source: source.name, sourceUrl: feed, collectedAt, verificationStatus: 'editorial-lead',
        }));
        break;
      }
      default: throw new Error('Connecteur inconnu.');
    }
    for (const item of items.slice(0, source.method === 'youtube-atom' ? 15 : 8)) {
      let verified = item;
      try {
        verified = await verifyCandidate(item, source, request);
      } catch (error) {
        outcome.errors.push(error instanceof SyntaxError ? 'Réponse fournisseur invalide.' : error.message);
        if (source.method !== 'pitchfork-rss') continue;
      }
      outcome.items.push({
        source: source.name, ...verified, provider: verified.provider ?? source.provider, sourceId, sourceUrl: verified.sourceUrl ?? feed, collectedAt,
        ...(source.format === 'Radio show' && source.mixKind === 'dj-set' && {
          mixKind:'dj-set',...(source.mixSelection && {novaMixVerified:true}),
        }),
        ...(source.id === 'fip-tape' && {mixKind:'editorial-mixtape'}),
        verificationStatus: verified.verificationStatus ?? 'source-verified',
      });
    }
    outcome.status = outcome.errors.length
      ? outcome.items.length || outcome.leads.length ? 'partial' : 'error'
      : outcome.items.length || outcome.leads.length ? 'ok' : 'empty';
  } catch (error) {
    outcome.status = 'error';
    outcome.errors.push(error instanceof SyntaxError ? 'Réponse fournisseur invalide.' : error.message);
  }
  return outcome;
}

export async function discover({ sources, manual = [], existing = [], profile, fetcher = fetch, now = new Date() }) {
  const collectedAt = now.toISOString();
  const request = requester(fetcher);
  const ordered = prioritize(sources, profile);
  const outcomes = await Promise.all(ordered.map(source => collect(source, request, collectedAt)));
  const manualErrors = [];
  const manualItems = [];
  for (const [index, item] of manual.entries()) {
    if (!item || !text(item.id) || !text(item.title) || !text(item.source) || !sourceUrl(item.url)
      || !sourceUrl(item.sourceUrl) || !formats.includes(item.format)
      || item.verified !== true || (item.date !== undefined && !isoDate(item.date))
      || (item.format === 'Album' && !isoDate(item.date))) {
      manualErrors.push('Candidat manuel invalide à la ligne de liste ' + (index + 1) + '.');
      continue;
    }
    manualItems.push({ ...item, sourceId: item.sourceId ?? 'manual', collectedAt, verificationStatus: 'editor-verified',
      ...(item.format === 'Album' && { dateKind: 'release', releaseDate: item.date }) });
  }
  const { candidates, duplicates } = deduplicate([...manualItems, ...outcomes.flatMap(outcome => outcome.items)], existing);
  const leads = deduplicate(outcomes.flatMap(outcome => outcome.leads)).candidates;
  const coverage = Object.fromEntries(formats.map(format => {
    const items = candidates.filter(item => item.format === format);
    return [format, {
      count: items.length,
      needsReleaseDate: items.filter(item => item.verificationStatus === 'release-date-needed').length,
      sources: outcomes.filter(source => source.format === format || source.items.some(item => item.format === format)).map(({ sourceId, status }) => ({ sourceId, status })),
    }];
  }));
  return {
    collectedAt, candidates, duplicates, leads, coverage, manualErrors,
    sources: outcomes.map(({ items, leads, ...source }) => ({ ...source, count: items.length, leads: leads.length })),
  };
}

export function renderReport(result) {
  const clean = value => String(value).replace(/[\r\n]/g, ' ').replace(/[<\[\]`]/g, '\\$&');
  const dates = { broadcast: 'diffusion', published: 'publication du lien', release: 'sortie originale' };
  const status = { ok: 'actif', partial: 'partiel', empty: 'aucun résultat', error: 'en erreur', manual: 'manuel', limited: 'limité' };
  const lines = items => items.length ? items.map(item =>
    '- ' + clean(item.title) + ' · ' + clean(item.source) + (item.date ? ' · ' + item.date + (dates[item.dateKind] ? ' (' + dates[item.dateKind] + ')' : '') : '')
    + (item.verificationStatus === 'release-date-needed' ? ' · date originale à vérifier' : '')
    + ' · <' + item.url + '> · Source <' + item.sourceUrl + '>'
  ).join('\n') : 'Aucun.';
  return [
    '# Rapport de découverte', 'Collecte : ' + result.collectedAt,
    '## Couverture par format',
    Object.entries(result.coverage).map(([format, data]) =>
      '- ' + format + ' · ' + data.count + ' nouveau(x)' +
      (data.needsReleaseDate ? ' · ' + data.needsReleaseDate + ' date(s) de sortie à vérifier' : '') +
      (data.sources.length ? ' · ' + data.sources.map(source => clean(source.sourceId) + ' (' + status[source.status] + ')').join(', ') : '')
    ).join('\n'),
    '## Nouveaux candidats (' + result.candidates.length + ')', lines(result.candidates),
    '## Pistes éditoriales (' + result.leads.length + ')', lines(result.leads),
    '## Doublons (' + result.duplicates.length + ')', lines(result.duplicates),
    '## État des sources',
    result.sources.map(source => '- ' + clean(source.name) + ' · ' + status[source.status] + ' · ' + source.count
      + ' candidat(s), ' + source.leads + ' piste(s)' + (source.feed ? ' · <' + source.feed + '>' : '')
      + (source.note ? ' · ' + clean(source.note) : '')
      + source.errors.map(error => '\n  - Indisponibilité : ' + clean(error)).join('')).join('\n'),
    ...result.manualErrors.map(error => '- ' + error),
  ].join('\n\n') + '\n';
}
