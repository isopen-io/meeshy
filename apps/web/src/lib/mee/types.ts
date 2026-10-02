import type { Motion } from './motion';

/**
 * LE CONTRAT D'UN STICKER MEE (#9034, #9058).
 *
 * Quatre onglets, et la raison de leur découpage :
 * - `mee` et `meo` : un personnage SEUL ;
 * - `duo` (« Mee & Meo ») : les deux ensemble. Une scène d'origine s'y joue
 *   dans les deux sens (`duo-mee-…` : Mee fait le geste, `duo-meo-…` : Meo) et
 *   la réaction du partenaire change : ce ne sont pas deux fois le même sticker ;
 * - `instants` : les stickers DYNAMIQUES, qui écrivent le lieu, l'heure, la
 *   météo ou un message choisis au moment de l'envoi.
 *
 * Dans les trois onglets de personnages, la `section` est une INTENTION — ce
 * que l'utilisateur veut DIRE — et non plus « seul / à deux » : on cherche un
 * sticker pour dire merci ou pour bouder, pas pour sa distribution.
 */

export const MEE_CHARACTER_TABS = ['mee', 'meo', 'duo'] as const;
export type MeeCharacterTab = (typeof MEE_CHARACTER_TABS)[number];
export type MeeTab = MeeCharacterTab | 'instants';

/** Les intentions, dans l'ordre où le panneau les montre. */
export const MEE_INTENTS = ['bonjour', 'amour', 'fete', 'soutien', 'rale', 'coup-de-mou', 'surprise', 'quotidien', 'humour-noir'] as const;
export type MeeIntent = (typeof MEE_INTENTS)[number];

export type MeeInstantSection = 'meteo' | 'moment' | 'lieu' | 'message';

export type MeeSection = MeeIntent | MeeInstantSection;

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

/** Ce qu'un PERSONNAGE exprime — les contextes des dynamiques n'en font pas partie. */
export type MeeCharacterFeeling = Exclude<MeeFeeling, MeeInstantSection>;

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
