import type { FastifyRequest } from 'fastify';

/**
 * Le pays d'un CLIC sur un lien de suivi (audit 2026-10-04 : la redirection ne
 * le passait jamais à `recordClick`, et les statistiques par pays restaient
 * vides).
 *
 * Une seule source : l'en-tête `cf-ipcountry` du CDN, s'il est un code ISO
 * réel (`XX` = inconnu, `T1` = Tor : ce ne sont pas des pays). L'IP d'un
 * visiteur n'est envoyée à AUCUN service tiers de géolocalisation : la ville
 * reste donc inconnue. Sans en-tête valable, le clic est compté sans lieu.
 */
const NON_PAYS = new Set(['XX', 'T1']);

export function clickGeo(request: FastifyRequest): { country?: string } {
  const brut = request.headers['cf-ipcountry'];
  const code = (Array.isArray(brut) ? brut[0] : brut)?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) && !NON_PAYS.has(code) ? { country: code } : {};
}
