import type { ShareLinkStats } from './link-stats';

/**
 * **LES STATISTIQUES DU LECTEUR DE RECETTE** (#7797) — servies par le même
 * chemin que la passerelle (`link-stats.ts`, garde `__FIXTURES__`), élaguées
 * de tout build `VITE_DATA_SOURCE=gateway`. « Équipe déploiement » porte tout
 * ce que la page sait montrer ; « Annonces produit » n'a encore vu personne ;
 * les autres liens rendent `null` — la route qui n'est pas encore servie.
 */

const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

export function fixtureShareLinkStats(linkId: string): ShareLinkStats | null {
  if (linkId === 'mshy_equipe-deploiement_7f3a') {
    return {
      visits: 1284,
      arrivals: 412,
      anonymousArrivals: 157,
      arrivalsByLanguage: [
        { code: 'fr', count: 120 },
        { code: 'es', count: 86 },
        { code: 'ko', count: 74 },
        { code: 'ja', count: 58 },
        { code: 'pt', count: 45 },
        { code: 'ar', count: 29 },
      ],
      arrivalsByCountry: [
        { country: 'SN', count: 96 },
        { country: 'FR', count: 88 },
      ],
      recentArrivals: [
        { participantId: 'p-priya', displayName: 'Priya', avatar: null, isAnonymous: true, country: 'IN', language: 'en', joinedAt: minutesAgo(2) },
        { participantId: 'p-kwame', displayName: 'Kwame', avatar: null, isAnonymous: false, country: 'GH', language: 'en', joinedAt: minutesAgo(60) },
        { participantId: 'p-amara', displayName: 'Amara', avatar: null, isAnonymous: true, country: 'SN', language: 'fr', joinedAt: minutesAgo(26 * 60) },
      ],
    };
  }
  if (linkId === 'mshy_annonces_2b91') {
    return { visits: 12, arrivals: 0, anonymousArrivals: 0, arrivalsByLanguage: [], arrivalsByCountry: [], recentArrivals: [] };
  }
  return null;
}
