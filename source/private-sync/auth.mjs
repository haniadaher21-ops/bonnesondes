import { projectOrigin } from './client.mjs';

export const pendingKey = 'off-frequency.sync-pkce.v1';
export const sessionKey = 'off-frequency.sync-session.v1';
export const callbackUrl = 'https://haniadaher21-ops.github.io/bonnesondes/';
const lifetime = 60 * 60 * 1000;
const retry = 'Lien invalide ou expiré. Demande un nouveau lien et ouvre-le dans le navigateur utilisé pour la demande.';
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

export async function authRequest(config, path, body, fetcher = fetch) {
  const response = await fetcher(projectOrigin(config.url) + '/auth/v1/' + path, {
    method:'POST', headers:{apikey:config.publicKey, 'Content-Type':'application/json'},
    body:JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Connexion impossible. Demande un nouveau lien et réessaie.');
  return response.json();
}

export function sessionFromResponse(value, now = Date.now()) {
  if (typeof value?.access_token !== 'string' || !value.access_token ||
      typeof value.refresh_token !== 'string' || !value.refresh_token ||
      !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new Error(retry);
  return {access_token:value.access_token, refresh_token:value.refresh_token, expires_at:now + value.expires_in * 1000};
}

export async function sendMagicLink(config, email, storage, fetcher = fetch, cryptoApi = crypto, now = Date.now()) {
  const verifier = base64url(cryptoApi.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  // localStorage deliberately allows the email to open another tab in the same browser.
  storage.setItem(pendingKey, JSON.stringify({verifier, issuedAt:now}));
  try {
    await authRequest(config, 'otp?redirect_to=' + encodeURIComponent(callbackUrl), {
      email, create_user:false, code_challenge:challenge, code_challenge_method:'s256',
    }, fetcher);
  } catch (error) {
    const current = JSON.parse(storage.getItem(pendingKey) ?? 'null');
    if (current?.verifier === verifier) storage.removeItem(pendingKey);
    throw error;
  }
}

// Returns null for ordinary navigation. Scrub credentials before any async work.
export function consumeMagicLink(config, href, storage, replaceUrl, fetcher = fetch, now = Date.now()) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const sensitive = ['code','error','error_code','error_description','access_token','refresh_token','token_hash'];
  const hasCallback = sensitive.some(key => url.searchParams.has(key) || fragment.has(key));
  if (!hasCallback) return null;
  replaceUrl('/bonnesondes/#preferences');
  const raw = storage.getItem(pendingKey);
  storage.removeItem(pendingKey);
  return (async () => {
    let pending;
    try { pending = JSON.parse(raw ?? 'null'); } catch { throw new Error(retry); }
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.getAll('code').length !== 1 || code.length > 2048 ||
        sensitive.filter(key => key !== 'code').some(key => url.searchParams.has(key) || fragment.has(key)) ||
        !pending || !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier) ||
        !Number.isFinite(pending.issuedAt) || now < pending.issuedAt || now - pending.issuedAt > lifetime) throw new Error(retry);
    const value = await authRequest(config, 'token?grant_type=pkce', {auth_code:code, code_verifier:pending.verifier}, fetcher);
    const session = sessionFromResponse(value, now);
    storage.setItem(sessionKey, JSON.stringify(session));
    return session;
  })();
}
