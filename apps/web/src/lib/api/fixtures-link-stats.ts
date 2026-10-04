import type { ShareLinkArrivalsPage } from './link-arrivals';
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

const FIXTURE_NAMES = ['Priya', 'Kwame', 'Amara', 'Yuki', 'Lucía', 'Omar', 'Inès', 'João', 'Min-jun', 'Fatou', 'Lena', 'Malik'] as const;
const FIXTURE_ORIGINS = [['IN', 'en'], ['GH', 'en'], ['SN', 'fr'], ['JP', 'ja'], ['ES', 'es'], ['MA', 'ar'], ['FR', 'fr'], ['BR', 'pt'], ['KR', 'ko'], ['SN', 'fr'], ['DE', 'de'], [null, null]] as const;
const FIXTURE_PAGE = 30;

/**
 * TOUTES LES ARRIVÉES du lien de recette (#7813) — autant que ses statistiques
 * en annoncent, page par page ; le curseur est le rang de la suivante.
 */
export function fixtureShareLinkArrivals(linkId: string, cursor: string | null): ShareLinkArrivalsPage {
  const total = fixtureShareLinkStats(linkId)?.arrivals ?? 0;
  const start = cursor === null ? 0 : Number(cursor);
  const end = Math.min(start + FIXTURE_PAGE, total);
  const arrivals = Array.from({ length: Math.max(end - start, 0) }, (_, offset) => {
    const rank = start + offset;
    const [country, language] = FIXTURE_ORIGINS[rank % FIXTURE_ORIGINS.length] ?? [null, null];
    return {
      displayName: `${FIXTURE_NAMES[rank % FIXTURE_NAMES.length] ?? 'Invité'} ${rank + 1}`,
      isAnonymous: rank % 3 !== 1,
      country,
      language,
      joinedAt: minutesAgo(2 + rank * 47),
    };
  });
  return { arrivals, nextCursor: end < total ? String(end) : null };
}
