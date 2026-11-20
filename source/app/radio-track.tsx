'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RadioMetadata } from './content';
import { parseNovaNowPlaying } from './nova-nowplaying.mjs';

type BroadcastStep = {
  embedType: string;
  start: number;
  end: number;
  title?: string;
  highlightedArtists?: string[];
  performers?: string;
  authors?: string;
};

export type OnAir = { title: string; artist?: string; playedAt?: string };

async function readOnAir(response: Response, metadata: RadioMetadata): Promise<OnAir | null> {
  if (!response.ok) throw new Error('Métadonnées indisponibles');

  if (metadata.provider === 'nova-page') {
    return parseNovaNowPlaying(await response.text());
  }

  if (metadata.provider === 'azuracast') {
    const data: { now_playing?: { song?: OnAir } } = await response.json();
    const song = data.now_playing?.song;
    return song?.title ? { title: song.title, artist: song.artist } : null;
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
  return { title: current.title, artist };
}

export default function RadioTrack({ metadata, saveTrack }: { metadata: RadioMetadata; saveTrack: (track: OnAir) => ReactNode }) {
  const [track, setTrack] = useState<OnAir | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const headers=metadata.provider==='nova-page' ? {
          'X-Respond-With':'html',
          'X-Target-Selector':'.what_was_title .swiper-slide:first-child',
          'X-Cache-Tolerance':'60',
        } : undefined;
        const response = await fetch(metadata.endpoint, { signal: controller.signal, cache: 'no-store', headers });
        const onAir = await readOnAir(response, metadata);
        if (!controller.signal.aborted) setTrack(onAir);
      } catch {
        if (!controller.signal.aborted) setTrack(null);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, metadata.provider === 'nova-page' ? 60_000 : 15_000);
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
  return <div className="radio-track" aria-live="polite">
    <p className="eyebrow">{isNts ? 'Émission en cours' : isNova ? 'Dernier titre identifié chez Nova' : 'À l’antenne'}</p>
    {track ? <><strong>{track.title}</strong>{track.artist && <p>{track.artist}</p>}{track.playedAt && <p>Diffusé à {track.playedAt}, heure de Paris · selon Nova</p>}</>
      : <p>{isNts ? 'Émission indisponible pour le moment.' : isNova ? 'Aucun titre récent confirmé par Nova. Réessaie dans quelques instants.' : 'Titre indisponible pour le moment.'}</p>}
    {!isNts && track && saveTrack(track)}
    {isNova && <a className="text-link" href="https://jina.ai/reader/" target="_blank" rel="noopener noreferrer">Données de Nova via Jina Reader</a>}
    {isNts && <a className="text-link" href="https://www.nts.live/supporters" target="_blank" rel="noopener noreferrer">Titres en direct avec NTS Supporters ↗</a>}
  </div>;
}
