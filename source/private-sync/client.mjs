import { parseTasteProfile } from '../editorial/taste-profile.mjs';

/** @param {string} url */
export function projectOrigin(url) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(target.hostname)
    || target.username || target.password || target.port) throw new Error('Projet Supabase invalide.');
  return target.origin;
}

/** @param {{url:string,publicKey:string}} config @param {string} operation @param {unknown} body @param {Record<string,string>} headers @param {typeof fetch} fetcher */
export async function syncRpc(config, operation, body, headers, fetcher = fetch) {
  if (!['bo_profile_read','bo_profile_save','bo_profile_delete','bo_runner_read','bo_runner_state_save'].includes(operation)) throw new Error('Opération inconnue.');
  const response = await fetcher(projectOrigin(config.url) + '/rest/v1/rpc/' + operation, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {'Content-Type': 'application/json', apikey: config.publicKey, ...headers},
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = /** @type {{message?:string}} */ (await response.json().catch(() => ({})));
    throw new Error(error.message === 'Revision conflict' ? 'Conflit de synchronisation. Recharge le profil distant avant de reprendre.' : 'Synchronisation indisponible. Vérifie la connexion et les droits.');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** @param {{url:string,publicKey:string}} config @param {string} token @param {typeof fetch} fetcher */
export async function readRunnerProfile(config, token, fetcher = fetch) {
  const value = await syncRpc(config, 'bo_runner_read', {}, {'x-bo-runner': token}, fetcher);
  if (!value?.profile || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error('Profil synchronisé absent.');
  return {...value, profile: parseTasteProfile(JSON.stringify(value.profile))};
}
