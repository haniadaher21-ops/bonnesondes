import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  emptyTasteProfile, normalizeTasteProfile, parseTasteProfile, spotifyPreferencesFromText,
  tasteProfileForExport, tasteProfileKey, type TasteProfile,
} from '../editorial/taste-profile.mjs';
import type { Recommendation } from './content';

const fields = [
  { name: 'favoriteArtists', label: 'Artistes favoris', hint: 'Vise 10 à 15 artistes pour commencer.' },
  { name: 'favoriteRadios', label: 'Radios préférées', hint: 'Avec les médias, vise 3 à 5 sources.' },
  { name: 'favoritePublications', label: 'Médias musicaux préférés', hint: 'Revues, sites ou publications que tu suis.' },
  { name: 'explore', label: 'À explorer', hint: 'Genres ou ambiances qui t’intéressent.' },
  { name: 'avoid', label: 'À écarter', hint: 'Genres ou ambiances que tu préfères éviter.' },
] as const;

type Props = {
  library: Parameters<typeof tasteProfileForExport>[1];
  recommendations: Recommendation[];
  libraryReady: boolean;
};

export default function TastePreferences({ library, recommendations, libraryReady }: Props) {
  const [profile, setProfile] = useState(emptyTasteProfile);
  const [formRevision, setFormRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [includeSignals, setIncludeSignals] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(tasteProfileKey);
      if (saved) setProfile(parseTasteProfile(saved));
    } catch {
      setError('Impossible de lire le profil enregistré dans ce navigateur.');
    }
    setReady(true);
  }, []);

  function persist(next: TasteProfile, message: string) {
    try {
      localStorage.setItem(tasteProfileKey, JSON.stringify(next));
      setProfile(next);
      setFormRevision(revision => revision + 1);
      setStatus(message);
    } catch {
      setError('Ce navigateur n’a pas pu enregistrer le profil.');
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('');
    setError('');
    const data = new FormData(event.currentTarget);
    const entry = (name: string) => String(data.get(name) ?? '');
    const values = Object.fromEntries(fields.map(({ name }) => [name, entry(name).split(/\r?\n/).map(value => value.trim()).filter(Boolean)]));
    try {
      persist(normalizeTasteProfile({
        ...profile, ...values, spotify: spotifyPreferencesFromText(entry('spotify')),
      }), 'Profil enregistré sur ce navigateur.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Le profil est invalide.');
    }
  }

  async function importProfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setStatus('');
    setError('');
    try {
      const next = parseTasteProfile(await file.text());
      persist(next, 'Profil importé. Tes favoris et réactions dans Ma collection sont toujours disponibles.');
    } catch {
      setError('Ce fichier ne contient pas un profil Bonnes Ondes version 1 valide.');
    }
  }

  function downloadProfile() {
    setStatus('');
    setError('');
    try {
      const exported = tasteProfileForExport(profile, library, recommendations, includeSignals);
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2) + '\n'], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bonnes-ondes-profil-v1.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Profil téléchargé.');
    } catch {
      setError('Impossible de télécharger le profil.');
    }
  }

  return <div className="taste-profile">
    {ready && <form key={formRevision} className="add-form" onSubmit={save}>
      {fields.map(({ name, label, hint }) =>
        <label key={name}>
          {label}
          <textarea name={name} rows={name === 'favoriteArtists' ? 5 : 3}
            defaultValue={profile[name].join('\n')} placeholder="Une entrée par ligne" aria-describedby={name + '-hint'} />
          <small id={name + '-hint'}>{hint}</small>
        </label>)}
      <label>
        Playlists et profils Spotify
        <textarea name="spotify" rows={3} aria-describedby="spotify-hint"
          defaultValue={profile.spotify.map(item => item.name ? item.name + ' | ' + item.url : item.url).join('\n')}
          placeholder="Un lien par ligne" />
        <small id="spotify-hint">Pour nommer un lien, saisis « Nom | lien Spotify ».</small>
      </label>
      {profile.spotify.length > 0 && <ul className="wide">
        {profile.spotify.map(item => <li key={item.url}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-link">{item.name ?? item.url}</a>
        </li>)}
      </ul>}
      <div className="wide"><button className="primary" type="submit">Enregistrer le profil</button></div>
    </form>}
    {ready && <div className="taste-profile-transfer">
      <h2>Sauvegarder ou transférer le profil</h2>
      <p>Le profil est stocké dans ce navigateur. Le fichier téléchargé contient tes dernières préférences enregistrées. Un import remplace le profil.</p>
      <label><input type="checkbox" checked={includeSignals} onChange={event => setIncludeSignals(event.target.checked)} />
        {' '}Inclure les favoris et réactions de Bonnes Ondes</label>
      <div className="taste-profile-actions">
        <button className="primary" type="button" onClick={downloadProfile} disabled={!libraryReady}>Télécharger le profil</button>
        <label>Importer un profil JSON<input type="file" accept=".json,application/json" onChange={importProfile} /></label>
      </div>
    </div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {status && <p role="status">{status}</p>}
  </div>;
}
