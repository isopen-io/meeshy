import type { FastifyRequest } from 'fastify';
import { lookupGeoIp } from '../../services/GeoIPService';

/**
 * Le pays et la ville d'un CLIC sur un lien de suivi (audit 2026-10-04 : la
 * redirection ne les passait jamais à `recordClick`, et les statistiques par
 * pays restaient vides).
 *
 * Deux sources, et aucune invention :
 * 1. l'en-tête `cf-ipcountry` du CDN, s'il est un code ISO réel (`XX` =
 *    inconnu, `T1` = Tor : ce ne sont pas des pays) ;
 * 2. la géolocalisation IP du dépôt (`lookupGeoIp`, mise en cache par IP),
 *    bornée par un délai COURT — une redirection n'attend pas un tiers.
 *
 * Toute panne rend `{}` : le clic est compté sans lieu, jamais refusé.
 */
export const CLICK_GEO_TIMEOUT_MS = 300;

const NON_PAYS = new Set(['XX', 'T1']);

function paysDuCdn(request: FastifyRequest): string | undefined {
  const brut = request.headers['cf-ipcountry'];
  const code = (Array.isArray(brut) ? brut[0] : brut)?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) && !NON_PAYS.has(code) ? code : undefined;
}

export async function clickGeo(
  request: FastifyRequest,
  ipAddress: string | undefined,
): Promise<{ country?: string; city?: string }> {
  const duCdn = paysDuCdn(request);
  let geo: { country?: string | null; city?: string | null } | null = null;
  if (ipAddress) {
    try {
      geo = await lookupGeoIp(ipAddress, { timeoutMs: CLICK_GEO_TIMEOUT_MS });
    } catch {
      geo = null;
    }
  }
  const country = duCdn ?? geo?.country ?? undefined;
  const city = geo?.city ?? undefined;
  return { ...(country ? { country } : {}), ...(city ? { city } : {}) };
}
