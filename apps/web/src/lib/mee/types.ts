import type { Motion } from './motion';

/**
 * LE CONTRAT D'UN STICKER MEE (#9034).
 *
 * Trois onglets, et la raison de leur découpage :
 * - `mee` et `meo` : un personnage SEUL, puis une partie « à deux » où CE
 *   personnage fait l'action à l'autre. D'un onglet à l'autre, l'acteur
 *   s'inverse ET la réaction du partenaire change : on n'envoie pas le même
 *   sticker depuis l'un ou l'autre côté ;
 * - `instants` : les stickers DYNAMIQUES, qui écrivent le lieu, l'heure, la
 *   météo ou un message choisis au moment de l'envoi.
 */

export type MeeTab = 'mee' | 'meo' | 'instants';

export type MeeSection = 'solo' | 'duo' | 'meteo' | 'moment' | 'lieu' | 'message';

/** Le sentiment qu'un sticker exprime — ou, pour les dynamiques, le contexte qu'il annonce. */
export type MeeFeeling =
  | 'amour'
  | 'joie'
  | 'celebration'
  | 'rejet'
  | 'consolation'
  | 'frustration'
  | 'tristesse'
  | 'morbide'
  | 'colere'
  | 'peur'
  | 'surprise'
  | 'timidite'
  | 'jalousie'
  | 'fatigue'
  | 'fierte'
  | 'gene'
  | 'salut'
  | 'quotidien'
  | 'humour'
  | 'meteo'
  | 'lieu'
  | 'moment'
  | 'message';

/** Ce qui compte comme une ÉMOTION — le reste dit bonjour, raconte le quotidien ou un contexte. */
export const MEE_EMOTIONS: ReadonlySet<MeeFeeling> = new Set<MeeFeeling>([
  'amour',
  'joie',
  'celebration',
  'rejet',
  'consolation',
  'frustration',
  'tristesse',
  'morbide',
  'colere',
  'peur',
  'surprise',
  'timidite',
  'jalousie',
  'fatigue',
  'fierte',
  'gene',
]);

/** Les valeurs qu'un sticker dynamique écrit — les clés sont celles du champ `slots` du message. */
export type MeeSlot = 'message' | 'place' | 'time' | 'weather';
export type MeeSlots = Partial<Readonly<Record<MeeSlot, string>>>;

export type MeeSticker = {
  /** Unique, `[a-z0-9-]` : il devient `mee.<id>` dans le `templateId` du message. */
  readonly id: string;
  readonly tab: MeeTab;
  readonly section: MeeSection;
  readonly title: string;
  readonly feeling: MeeFeeling;
  /** Le repli d'un lecteur qui ne sait pas redessiner le sticker. */
  readonly emoji: string;
  /** `null` : sticker FIXE. */
  readonly motion: Motion | null;
  /** Les valeurs dynamiques que ce sticker écrit, dans l'ordre de leur importance. */
  readonly slots: readonly MeeSlot[];
  /** Les valeurs écrites tant que l'utilisateur n'a rien saisi. */
  readonly defaults: MeeSlots;
  /** Le contenu de la scène 200 × 200 (sans la balise `<svg>`). `uid` rend ses identifiants uniques. */
  readonly scene: (uid: string, slots: MeeSlots) => string;
};
