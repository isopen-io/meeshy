/**
 * Les OFFRES SAISONNIÈRES de la boutique (#16270, #16271) : quels packs d'apparence appartiennent à l'offre de
 * Noël et à celle du Nouvel An, et l'ÉVÉNEMENT que chacun sert. Un module sans dépendance : les compositeurs de
 * Noël (#15553) et des collections Meeshy (#15158) le lisent pour ranger leurs packs sans déplacer ceux que l'offre
 * ajoute en fin de source.
 *
 * Aucune date n'est écrite (décisions porteur du 2026-11-06, #16447 et #16450) : le pack déclare son `event`, ANNUEL,
 * et la loi partagée (`utils/decoration-event-window.ts`, de deux mois avant l'événement à un mois après) calcule
 * l'occurrence en cours ou prochaine — à la génération pour l'instantané `availability`, puis à la date du jour
 * chez la passerelle et les clients. Aucune date n'est à reporter d'une année sur l'autre.
 */
import type { YearlyEventDeclaration } from '../../utils/decoration-event-window.js';

/** Noël, chaque année : du 25 octobre au 24 janvier inclus. */
export const CHRISTMAS_EVENT = { id: 'christmas', recurrence: 'yearly' } as const satisfies YearlyEventDeclaration;

/** Le Nouvel An, chaque année : du 1er novembre au 31 janvier inclus. */
export const NEW_YEAR_EVENT = { id: 'new-year', recurrence: 'yearly' } as const satisfies YearlyEventDeclaration;

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

/** L'événement d'un pack de l'offre ; `undefined` hors offre. */
export const eventOf = (slug: string): YearlyEventDeclaration | undefined => {
  if (CHRISTMAS_OFFER_SLUGS.includes(slug)) return CHRISTMAS_EVENT;
  if (NEW_YEAR_OFFER_SLUGS.includes(slug)) return NEW_YEAR_EVENT;
  return undefined;
};
