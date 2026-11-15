// #11257 — la cible d'une charge k6 et son jeton. Une seule règle pour les deux scripts :
// la production est refusée AVANT toute requête ; la charge se joue contre le staging
// (gate.staging.meeshy.me) ou une passerelle locale.
import http from 'k6/http';

const MEESHY_HOST = /(^|\.)meeshy\.me$/;
const STAGING_HOST = /(^|\.)staging\.meeshy\.me$/;

function hostOf(baseUrl) {
  const match = baseUrl.match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i);
  if (!match) throw new Error(`k6: K6_BASE_URL illisible (${baseUrl})`);
  return match[1].toLowerCase().replace(/\.+$/, '');
}

export function targetBaseUrl(env) {
  const baseUrl = (env.K6_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const host = hostOf(baseUrl);
  if (MEESHY_HOST.test(host) && !STAGING_HOST.test(host)) {
    throw new Error(`k6: la production est refusée (${host}) — jouer la charge contre gate.staging.meeshy.me`);
  }
  return baseUrl;
}

export function bearerToken(baseUrl, env) {
  if (env.K6_TOKEN) return env.K6_TOKEN;
  const response = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({ username: env.K6_USERNAME, password: env.K6_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = response.json('data.token');
  if (!token) throw new Error('k6: aucun jeton (K6_TOKEN ou K6_USERNAME/K6_PASSWORD)');
  return token;
}
