'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RadioMetadata } from './content';
import { parseNovaNowPlaying } from './nova-nowplaying.mjs';
import { radioArtworkUrl } from './radio-artwork.mjs';
import { findNovaCatalogueArtwork } from './nova-catalogue-artwork.mjs';

type BroadcastStep = {
  embedType: string;
  start: number;
  end: number;
  title?: string;
  highlightedArtists?: string[];
  performers?: string;
  authors?: string;
  visual?: string;
};

export type OnAir = { title: string; artist?: string; playedAt?: string; artwork?: string };

async function readOnAir(response: Response, metadata: RadioMetadata): Promise<OnAir | null> {
  if (!response.ok) throw new Error('Métadonnées indisponibles');

  if (metadata.provider === 'nova-page') {
    return parseNovaNowPlaying(await response.text());
  }

  if (metadata.provider === 'azuracast') {
    const data: { now_playing?: { song?: OnAir & { art?: string } } } = await response.json();
    const song = data.now_playing?.song;
    return song?.title ? { title: song.title, artist: song.artist, artwork: radioArtworkUrl(song.art) } : null;
  }

  if (metadata.provider === 'nts') {
    const data: { results?: { channel_name: string; now?: { broadcast_title?: string } }[] } = await response.json();
    const title = data.results?.find(channel => channel.channel_name === metadata.channel)?.now?.broadcast_title;
    return title ? { title } : null;
  }

  const data: { steps?: Record<string, BroadcastStep> } = await response.json();
  const now = Date.now() / 1000;
  const current = Object.values(data.steps ?? {})
    .filter(step => step.embedType === 'song' && step.start <= now && now < step.end)
    .sort((a, b) => b.start - a.start)[0];
  if (!current?.title) return null;
  const artist = current.highlightedArtists?.filter(Boolean).join(', ') || current.performers || current.authors;
  return { title: current.title, artist, artwork: radioArtworkUrl(current.visual) };
}

function BroadcastArtwork({ artwork, title, isNts, onFailure }: {
  artwork: string; title: string; isNts: boolean; onFailure?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="station-cover" src={artwork} alt={isNts ? 'Visuel de l’émission ' + title : 'Pochette du morceau ' + title}
    width={88} height={88} loading="lazy" referrerPolicy="no-referrer" onError={() => { setFailed(true); onFailure?.(); }} />;
}

export default function RadioTrack({ metadata, saveTrack, compact = false }: {
  metadata: RadioMetadata; saveTrack: (track: OnAir) => ReactNode; compact?: boolean;
}) {
  const [track, setTrack] = useState<OnAir | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedArtwork, setFailedArtwork] = useState<{ key: string; urls: string[] }>({key:'',urls:[]});
  const [catalogueArtwork, setCatalogueArtwork] = useState<{
    key: string; result: { artwork: string; storeUrl: string } | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const headers=metadata.provider==='nova-page' ? {
          'X-Respond-With':'html',
          'X-Target-Selector':'.what_was_title .swiper-slide:first-child',
          'X-Cache-Tolerance':'30',
        } : undefined;
        const response = await fetch(metadata.endpoint, { signal: controller.signal, cache: 'no-store', headers });
        const onAir = await readOnAir(response, metadata);
        if (!controller.signal.aborted) { setTrack(onAir); setLoading(false); }
      } catch {
        if (!controller.signal.aborted) { setTrack(null); setLoading(false); }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, metadata.provider === 'nova-page' ? 30_000 : compact ? 30_000 : 15_000);
      }
    }

    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [metadata]);

  const isNts = metadata.provider === 'nts';
  const isNova = metadata.provider === 'nova-page';
  const artKey = metadata.endpoint + '|' + (track?.artist ?? '') + '|' + (track?.title ?? '');
  const failedUrls = failedArtwork.key === artKey ? failedArtwork.urls : [];
  const directArtwork = track?.artwork && !failedUrls.includes(track.artwork) ? track.artwork : undefined;
  const found = catalogueArtwork?.key === artKey ? catalogueArtwork.result : null;
  const matchedArtwork = found?.artwork && !failedUrls.includes(found.artwork) ? found.artwork : undefined;
  const displayedArtwork = directArtwork || matchedArtwork;
  const usingCatalogue = isNova && !directArtwork && !!matchedArtwork;
  const trackForSave = track ? { ...track, artwork: displayedArtwork } : null;

  // A new image is only searched for if Nova has no usable official cover,
  // or if the official image fails to load in the browser.
  useEffect(() => {
    if (!isNova || !track?.artist || directArtwork || catalogueArtwork?.key === artKey) return;
    let mounted = true;
    void findNovaCatalogueArtwork(track.artist, track.title).then(result => {
      if (mounted) setCatalogueArtwork({ key: artKey, result });
    });
    return () => { mounted = false; };
  }, [isNova, track?.artist, track?.title, directArtwork, artKey, catalogueArtwork?.key]);

  const markArtworkFailed = () => {
    if (!displayedArtwork) return;
    setFailedArtwork(prev => ({
      key: artKey,
      urls: prev.key === artKey ? [...new Set([...prev.urls, displayedArtwork])] : [displayedArtwork],
    }));
  };
  const cover = displayedArtwork && <div className="station-cover-group">
    <BroadcastArtwork key={displayedArtwork} artwork={displayedArtwork} title={track?.title ?? ''} isNts={isNts}
      onFailure={markArtworkFailed} />
    {usingCatalogue && found?.storeUrl && <a className="station-cover-store" href={found.storeUrl}
      target="_blank" rel="noopener noreferrer" title="Voir ce morceau sur l’iTunes Store">Sur iTunes</a>}
  </div>;

  if (compact) {
    return <div className="station-now-playing" aria-live="polite">
      <p className="eyebrow">{isNts ? 'ÉMISSION EN DIRECT' : isNova ? 'DERNIER TITRE DIFFUSÉ' : 'EN CE MOMENT'}</p>
      {track ? <div className="station-track-layout">
        {cover}
        <div className="station-track-copy">
          <strong className="station-track-title">{track.title}</strong>
          {!isNts && track.artist && <p className="station-track-artist">{track.artist}</p>}
          {isNova && track.playedAt && <p className="station-track-time">À {track.playedAt}, selon Nova</p>}
          {!isNts && trackForSave && saveTrack(trackForSave)}
        </div>
      </div> : <p className="station-track-unavailable">
        {loading ? 'Chargement du direct…' : isNts ? 'Émission indisponible pour le moment.' : isNova ? 'Dernier titre Nova indisponible pour le moment.' : 'Titre indisponible pour le moment.'}
      </p>}
    </div>;
  }
  return <div className="radio-track" aria-live="polite">
    <p className="eyebrow">{isNts ? 'Émission en cours' : isNova ? 'Dernier titre identifié chez Nova' : 'À l’antenne'}</p>
    {track ? <div className="station-track-layout">
      {cover}
      <div className="station-track-copy"><strong>{track.title}</strong>{track.artist && <p>{track.artist}</p>}{track.playedAt && <p>Diffusé à {track.playedAt}, heure de Paris · selon Nova</p>}</div>
    </div>
      : <p>{isNts ? 'Émission indisponible pour le moment.' : isNova ? 'Aucun titre récent confirmé par Nova. Réessaie dans quelques instants.' : 'Titre indisponible pour le moment.'}</p>}
    {!isNts && trackForSave && saveTrack(trackForSave)}
    {isNova && <a className="text-link" href="https://jina.ai/reader/" target="_blank" rel="noopener noreferrer">Données de Nova via Jina Reader</a>}
    {isNts && <a className="text-link" href="https://www.nts.live/supporters" target="_blank" rel="noopener noreferrer">Titres en direct avec NTS Supporters ↗</a>}
  </div>;
}
