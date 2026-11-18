import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { canonicalUrl, isoDate, sourceUrl } from '../editorial/edition.mjs';

const parser = new XMLParser({
  ignoreAttributes: false, parseTagValue: false, isArray: tag => tag === 'entry',
  htmlEntities: false, maxNestedTags: 40,
});
const list = (value, field) => {
  if (!Array.isArray(value)) throw new Error('Champ absent ou invalide : ' + field);
  return value;
};
const text = value => typeof value === 'string' ? value.trim() : '';

function ntsCandidates(payload) {
  const episodes = list(payload?.results, 'results');
  return episodes.filter(episode => episode.status === 'published').slice(0, 6).map(episode => {
    const { show_alias: show, episode_alias: alias } = episode;
    const title = text(episode.name);
    const date = text(episode.broadcast).slice(0, 10);
    if (!title || !isoDate(date) || ![show, alias].every(value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value))) {
      throw new Error('Épisode NTS sans titre, date ou identifiant vérifiable.');
    }
    return {
      id: 'nts-' + alias, title, format: 'Radio show', source: 'NTS Radio', date,
      dateKind: 'broadcast',
      url: 'https://www.nts.live/shows/' + show + '/episodes/' + alias,
      artwork: sourceUrl(episode.media?.picture_medium)?.href,
    };
  });
}

function youtubeCandidates(xml, source) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('Flux Atom invalide.');
  }
  const feed = parser.parse(xml).feed;
  const feedChannel = feed?.['yt:channelId'];
  if (![source.channelId, source.channelId.slice(2)].includes(feedChannel)) {
    throw new Error('Chaîne YouTube non confirmée.');
  }
  return (feed.entry ?? []).filter(entry => !source.titleContains
    || text(entry.title).toLowerCase().includes(source.titleContains.toLowerCase())).slice(0, 6).map(entry => {
    const id = entry['yt:videoId'];
    const title = text(entry.title);
    const publishedAt = text(entry.published);
    const date = publishedAt.slice(0, 10);
    if (entry['yt:channelId'] !== source.channelId || !/^[a-zA-Z0-9_-]{11}$/.test(id ?? '') || !title || !isoDate(date)) {
      throw new Error('Vidéo sans chaîne, titre, date ou identifiant vérifiable.');
    }
    return {
      id: 'youtube-' + id, title, format: 'Live session', source: source.name,
      url: 'https://www.youtube.com/watch?v=' + id, date, dateKind: 'published', publishedAt,
    };
  });
}

export function deduplicate(candidates, existing = []) {
  const ids = new Set(existing.map(item => item.id));
  const links = new Set(existing.map(item => canonicalUrl(item.url)).filter(Boolean));
  const fresh = [];
  const duplicates = [];
  for (const item of candidates) {
    const key = canonicalUrl(item.url);
    if (ids.has(item.id) || (key && links.has(key))) {
      duplicates.push(item);
    } else {
      fresh.push(item);
    }
    ids.add(item.id);
    if (key) links.add(key);
  }
  return { candidates: fresh, duplicates };
}

async function request(fetcher, url) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' (' + url + ')');
  return response;
}

export async function discover({ sources, manual = [], existing = [], fetcher = fetch, now = new Date() }) {
  const collectedAt = now.toISOString();
  const outcomes = await Promise.all(sources.filter(source => source.mode === 'automatic').map(async source => {
    const feed = source.method === 'youtube-atom'
      ? 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(source.channelId)
      : source.feed;
    try {
      const response = await request(fetcher, feed);
      const items = source.method === 'nts-episodes'
        ? ntsCandidates(await response.json())
        : youtubeCandidates(await response.text(), source);
      const verified = await Promise.allSettled(items.map(async item => {
        if (source.method === 'youtube-atom') {
          const metadata = await (await request(fetcher, 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(item.url))).json();
          if (!text(metadata.title)) throw new Error('Vidéo non confirmée : ' + item.url);
        } else {
          await (await request(fetcher, item.url)).body?.cancel();
        }
        return { ...item, sourceUrl: feed, collectedAt };
      }));
      return {
        name: source.name, feed,
        items: verified.flatMap(result => result.status === 'fulfilled' ? [result.value] : []),
        errors: verified.flatMap(result => result.status === 'rejected' ? [String(result.reason)] : []),
      };
    } catch (error) {
      return { name: source.name, feed, items: [], errors: [String(error)] };
    }
  }));
  const manualErrors = [];
  const manualItems = [];
  for (const [index, item] of manual.entries()) {
    if (!item || !text(item.id) || !text(item.title) || !text(item.source) || !sourceUrl(item.url)
      || !sourceUrl(item.sourceUrl) || !['Album', 'Radio show', 'Playlist', 'Live session'].includes(item.format)
      || item.verified !== true || (item.date !== undefined && !isoDate(item.date))
      || (item.format === 'Album' && !isoDate(item.date))) {
      manualErrors.push('Candidat manuel invalide à la ligne de liste ' + (index + 1) + '.');
      continue;
    }
    manualItems.push({ ...item, collectedAt });
  }
  return {
    collectedAt, ...deduplicate([...manualItems, ...outcomes.flatMap(outcome => outcome.items)], existing),
    sources: outcomes.map(({ name, feed, items, errors }) => ({ name, feed, count: items.length, errors })),
    manualErrors,
  };
}

export function renderReport(result) {
  const clean = value => String(value).replace(/[\r\n]/g, ' ').replace(/[<\[\]`]/g, '\\$&');
  const lines = items => items.length ? items.map(item =>
    '- ' + clean(item.title) + ' · ' + clean(item.source) + (item.date ? ' · ' + item.date + (item.dateKind === 'broadcast' ? ' (diffusion)' : '') : '')
    + ' · <' + item.url + '> · Source <' + item.sourceUrl + '>'
  ).join('\n') : 'Aucun.';
  return [
    '# Rapport de découverte', 'Collecte : ' + result.collectedAt,
    '## Nouveaux candidats (' + result.candidates.length + ')', lines(result.candidates),
    '## Doublons (' + result.duplicates.length + ')', lines(result.duplicates),
    '## État des sources',
    result.sources.map(source => '- ' + source.name + ' · ' + source.count + ' vérifié(s) · <' + source.feed + '>\n'
      + source.errors.map(error => '  - Indisponibilité : ' + clean(error)).join('\n')).join('\n'),
    ...result.manualErrors.map(error => '- ' + error),
    'Une candidature reste à vérifier et à sélectionner avant publication.',
  ].join('\n\n') + '\n';
}
