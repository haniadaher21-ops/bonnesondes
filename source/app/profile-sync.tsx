'use client';

import { useEffect, useRef, useState } from 'react';
import { emptyTasteProfile, parseTasteProfile, tasteProfileForExport, tasteProfileKey } from '../editorial/taste-profile.mjs';
import { projectOrigin, syncRpc } from '../private-sync/client.mjs';
import type { Recommendation } from './content';

const config = {url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', publicKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''};
const sessionKey = 'off-frequency.sync-session.v1';
type Session = { access_token: string; refresh_token: string; expires_at: number };
type Library = Parameters<typeof tasteProfileForExport>[1];
type Remote = {revision:number; document: ReturnType<typeof emptyTasteProfile> | null};

export default function ProfileSync({ library, recommendations, ready, visible }: {
  library: Library; recommendations: Recommendation[]; ready: boolean; visible: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);
  const revision = useRef(0);
  const lastSaved = useRef('');
  const [profileChange, setProfileChange] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [remote, setRemote] = useState<Remote | null>(null);
  const chain = useRef(Promise.resolve());
  const generation = useRef(0);

  useEffect(() => {
    if (!config.url || !config.publicKey) return;
    try {
      const value = JSON.parse(localStorage.getItem(sessionKey) ?? 'null');
      if (value?.access_token && value?.refresh_token) setSession(value);
    } catch { setMessage('La connexion doit être renouvelée.'); }
    const changed = () => setProfileChange(value => value + 1);
    const interval = setInterval(() => setPulse(value => value + 1), 20000);
    window.addEventListener('taste-profile-changed', changed);
    window.addEventListener('online', changed);
    return () => {
      clearInterval(interval);
      window.removeEventListener('taste-profile-changed', changed);
      window.removeEventListener('online', changed);
    };
  }, []);

  async function auth(path: string, body: unknown) {
    const response = await fetch(projectOrigin(config.url) + '/auth/v1/' + path, {
      method: 'POST', headers: {apikey: config.publicKey, 'Content-Type':'application/json'},
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Connexion impossible. Vérifie ton code ou renouvelle-le.');
    return response.json();
  }

  function remember(value: {access_token:string;refresh_token:string;expires_in:number}) {
    const next = {access_token:value.access_token, refresh_token:value.refresh_token, expires_at:Date.now() + value.expires_in*1000};
    localStorage.setItem(sessionKey, JSON.stringify(next));
    setSession(next);
    return next;
  }

  useEffect(() => {
    if (!session || session.expires_at > Date.now() + 60000) return;
    let cancelled = false;
    auth('token?grant_type=refresh_token', {refresh_token:session.refresh_token})
      .then(value => {if (!cancelled) remember(value);})
      .catch(() => {if (!cancelled) { setEnabled(false); setMessage('Reconnecte-toi pour synchroniser.'); }});
    return () => {cancelled = true;};
    // Only refresh on session/clock changes, never on individual edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pulse]);

  useEffect(() => {
    if (!session || session.expires_at <= Date.now() + 60000) return;
    let cancelled = false;
    syncRpc(config, 'bo_profile_read', {}, {Authorization:'Bearer ' + session.access_token})
      .then(value => {
        if (cancelled) return;
        setRemote(value);
        const consent = JSON.parse(localStorage.getItem('off-frequency.sync-consent.v1') ?? 'null');
        if (consent?.revision === value.revision && consent?.active) {
          revision.current = value.revision;
          lastSaved.current = consent.signature ?? '';
          setEnabled(true);
        }
      })
      .catch(error => {if (!cancelled) setMessage(error.message);});
    return () => {cancelled=true;};
  }, [session]);

  useEffect(() => {
    if (!enabled || !session || !ready || session.expires_at <= Date.now() + 60000) return;
    const epoch = generation.current;
    const timeout = setTimeout(() => {
      chain.current = chain.current.then(async () => {
        if (epoch !== generation.current) return;
        const stored = localStorage.getItem(tasteProfileKey);
        const profile = stored ? parseTasteProfile(stored) : emptyTasteProfile();
        const document = tasteProfileForExport(profile, library, recommendations, true);
        const signature = JSON.stringify(document);
        if (signature === lastSaved.current) return;
        const result = await syncRpc(config, 'bo_profile_save', {document, expected_revision:revision.current},
          {Authorization:'Bearer ' + session.access_token});
        if (epoch !== generation.current) return;
        revision.current = result.revision;
        lastSaved.current = signature;
        localStorage.setItem('off-frequency.sync-consent.v1', JSON.stringify({active:true, revision:result.revision, signature}));
        setMessage('Préférences et réactions synchronisées.');
      }).catch(error => {
        if (epoch !== generation.current) return;
        setMessage(error.message);
        if (!error.message.startsWith('Conflit')) return;
        setEnabled(false);
        syncRpc(config, 'bo_profile_read', {}, {Authorization:'Bearer ' + session.access_token})
          .then(setRemote).catch(() => {});
      });
    }, 700);
    return () => clearTimeout(timeout);
  }, [enabled, session, ready, library, recommendations, profileChange, pulse]);

  if (!visible || !config.url || !config.publicKey) return null;

  function stop() {
    generation.current++;
    setEnabled(false);
    localStorage.removeItem('off-frequency.sync-consent.v1');
    lastSaved.current = '';
  }

  return <section className="taste-profile-transfer">
    <h2>Synchronisation privée</h2>
    <p>Connecte ton compte pour conserver tes préférences et réactions sur le serveur privé et les rendre accessibles au moteur hebdomadaire.</p>
    {!session ? <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        if (!sent) {
          await auth('otp', {email, create_user:false});
          setSent(true);
          setMessage('Saisis le code reçu par courriel.');
        } else {
          remember(await auth('verify', {email, token:code, type:'email'}));
          setCode('');
        }
      } catch(error) { setMessage(error instanceof Error ? error.message : 'Connexion indisponible.'); }
      finally { setBusy(false); }
    }}>
      <label>Adresse du compte<input type="email" required readOnly={sent} value={email} onChange={event => setEmail(event.target.value)} /></label>
      {sent && <label>Code reçu<input required autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label>}
      <button type="submit" className="primary" disabled={busy}>{sent ? 'Se connecter' : 'Recevoir un code'}</button>
      {sent && <button type="button" className="text-link" disabled={busy} onClick={() => {
        setSent(false); setCode(''); setMessage('');
      }}>Recevoir un nouveau code ou changer d’adresse</button>}
    </form> : <>
      {!enabled && remote && <>
        <p>Choisis le profil à utiliser avant de démarrer la synchronisation.</p>
        <button className="primary" onClick={() => {
          stop(); revision.current = remote.revision; setEnabled(true);
        }}>Synchroniser les préférences de ce navigateur</button>
        {remote.document && <button className="text-link" onClick={() => {
          try {
            const profile = parseTasteProfile(JSON.stringify(remote.document));
            localStorage.setItem(tasteProfileKey, JSON.stringify(profile));
            window.dispatchEvent(new Event('taste-profile-changed'));
            stop(); revision.current = remote.revision; setEnabled(true);
          } catch { setMessage('Profil distant invalide.'); }
        }}>Charger le profil distant et synchroniser</button>}
      </>}
      <button className="text-link" onClick={async () => {
        stop();
        const old = session;
        localStorage.removeItem(sessionKey); setSession(null); setRemote(null); setSent(false); setCode('');
        setMessage('Déconnecté. Le dernier profil synchronisé reste sur le serveur.');
        await fetch(projectOrigin(config.url) + '/auth/v1/logout', {method:'POST',
          headers:{apikey:config.publicKey, Authorization:'Bearer ' + old.access_token}}).catch(() => {});
      }}>Se déconnecter</button>
      <button className="text-link" onClick={async () => {
        stop();
        try {
          await chain.current;
          await syncRpc(config, 'bo_profile_delete', {}, {Authorization:'Bearer ' + session.access_token});
          setRemote({document:null,revision:0}); revision.current = 0;
          setMessage('Profil distant et accès du moteur effacés. Les données locales sont conservées.');
        } catch { setMessage('Effacement distant indisponible. Réessaie après reconnexion.'); }
      }}>Effacer le profil distant et révoquer le moteur</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
