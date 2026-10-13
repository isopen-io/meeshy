/**
 * D'OÙ un lecteur ouvre un contenu, et PAR OÙ il est arrivé sur l'écran qui le
 * montre en plein (#10483, demande du porteur 2026-10-13).
 *
 * Deux gestes, deux mots :
 *
 * - **l'ORIGINE** (`OpenOrigin`) — le LISTING où le lecteur a TAPÉ le contenu
 *   (fil, profil, favoris, hashtag, rail de stories…). Le tap envoie
 *   l'événement d'engagement `open` (`POST /social/events`), qui ne compte
 *   AUCUNE vue : la vue est comptée par l'écran ouvert.
 * - **la PROVENANCE** (`ViewProvenance`) — ce qui a amené l'écran DÉTAIL
 *   (détail de post, lecteur de réels, lecteur de story) : un listing de
 *   l'app, une notification, un lien de partage Meeshy (`?via=`), un lien de
 *   suivi Meeshy (`/l/<jeton>`), un lien venu d'ailleurs sans marque, ou rien
 *   (adresse tapée, ouverture sans référent). La vue la porte.
 *
 * Les deux champs sont FACULTATIFS sur le fil et une valeur INCONNUE est
 * ignorée par la passerelle, jamais un refus du lot : un client plus neuf que
 * le serveur ne perd aucun compte. Toute nouvelle valeur s'ajoute ICI.
 */
export const OPEN_ORIGINS = [
  'feed',
  'reels',
  'profile',
  'bookmarks',
  'hashtag',
  'community',
  'nearby',
  'sound',
  'story_rail',
  'mood_avatar',
  'citation',
  'search',
  'notifications',
  'comments',
  'link_preview',
  'status',
] as const;

export type OpenOrigin = (typeof OPEN_ORIGINS)[number];

export const VIEW_PROVENANCES = [
  'listing',
  'notification',
  'shared_link',
  'tracking_link',
  'external',
  'direct',
] as const;

export type ViewProvenance = (typeof VIEW_PROVENANCES)[number];

const ORIGINS: ReadonlySet<string> = new Set(OPEN_ORIGINS);
const PROVENANCES: ReadonlySet<string> = new Set(VIEW_PROVENANCES);

export const isOpenOrigin = (value: unknown): value is OpenOrigin =>
  typeof value === 'string' && ORIGINS.has(value);

export const isViewProvenance = (value: unknown): value is ViewProvenance =>
  typeof value === 'string' && PROVENANCES.has(value);

/**
 * Les agrégats servis sur un `Post` (champs additifs, absents d'un ancien
 * serveur, `null` sur un post antérieur — à lire comme vides) :
 *
 * - `openCountByOrigin` — les engagements `open` par origine ; un `open` sans
 *   origine connue est compté sous `other` ;
 * - `viewCountByProvenance` — les vues COMPTÉES par provenance (une vue d'un
 *   ancien client, sans provenance, n'y entre pas : la somme peut rester sous
 *   `viewCount`) ;
 * - `listingViewCountByOrigin` — parmi les vues `listing`, le listing d'où
 *   l'écran a été ouvert.
 */
export type ReachBreakdown = Readonly<Record<string, number>>;

export const OPEN_ORIGIN_UNKNOWN = 'other';
