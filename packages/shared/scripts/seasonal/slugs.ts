/**
 * Les OFFRES SAISONNIÈRES de la boutique (#16270, #16271) : quels packs d'apparence appartiennent à l'offre de
 * Noël et à celle du Nouvel An, et la FENÊTRE (`availability`, #11274) où la boutique les offre. Un module sans
 * dépendance : les compositeurs de Noël (#15553) et des collections Meeshy (#15158) le lisent pour ranger leurs
 * packs sans déplacer ceux que l'offre ajoute en fin de source.
 *
 * La fenêtre est faite de deux INSTANTS (le schéma partagé n'a pas de récurrence annuelle) : celles de la saison
 * 2026-2027, à reporter chaque année. `startsAt` inclus, `endsAt` exclu, en UTC.
 */
import type { PackAvailability } from '../../types/pack-availability.js';

/** Du 1er décembre au 6 janvier inclus. */
export const CHRISTMAS_WINDOW = { startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' } as const satisfies PackAvailability;

/** Du 26 décembre au 15 janvier inclus. */
export const NEW_YEAR_WINDOW = { startsAt: '2026-12-26T00:00:00Z', endsAt: '2027-01-16T00:00:00Z' } as const satisfies PackAvailability;

/** Les cadres de bannière assortis aux trois contours de Noël (`assorted-banners/packs.ts`). */
export const CHRISTMAS_FRAME_SLUGS: readonly string[] = ['bannieres-noel-enneige', 'bannieres-lumieres-noel', 'bannieres-atelier-noel'];

/** Ce que l'offre de Noël AJOUTE : les images de bannière, et la paire fixe des contours et des cadres. */
export const CHRISTMAS_ADDED_SLUGS: readonly string[] = ['noel-bannieres', 'noel-contours-fixes', 'noel-cadres-fixes'];

export const CHRISTMAS_OFFER_SLUGS: readonly string[] = [
  'noel-enneige',
  'lumieres-de-noel',
  'atelier-du-pere-noel',
  ...CHRISTMAS_FRAME_SLUGS,
  'fonds-noel',
  'fonds-noel-vivants',
  ...CHRISTMAS_ADDED_SLUGS,
];

export const NEW_YEAR_OFFER_SLUGS: readonly string[] = [
  'nouvel-an-contours',
  'nouvel-an-contours-vifs',
  'nouvel-an-images',
  'nouvel-an-images-vives',
  'nouvel-an-cadres',
  'nouvel-an-cadres-vifs',
  'nouvel-an-fonds',
  'nouvel-an-fonds-vifs',
];

/** Les packs que l'offre pose EN FIN de source : les autres compositeurs rangent les leurs sans les compter. */
export const SEASONAL_ADDED_SLUGS: readonly string[] = [...CHRISTMAS_ADDED_SLUGS, ...NEW_YEAR_OFFER_SLUGS];

export const SEASONAL_SLUGS: readonly string[] = [...CHRISTMAS_OFFER_SLUGS, ...NEW_YEAR_OFFER_SLUGS];

/** La fenêtre d'un pack de l'offre ; `undefined` hors offre. */
export const availabilityOf = (slug: string): PackAvailability | undefined => {
  if (CHRISTMAS_OFFER_SLUGS.includes(slug)) return CHRISTMAS_WINDOW;
  if (NEW_YEAR_OFFER_SLUGS.includes(slug)) return NEW_YEAR_WINDOW;
  return undefined;
};
