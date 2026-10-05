import type { FlameFormKey } from '@meeshy/shared/utils/game/flame';
import type { GloryDivision, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';
import type { TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';
import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';

/**
 * CE QUE LE JEU DIT (#9383, #9379) — les noms, les accords et les phrases de
 * refus. La loi partagée (`@meeshy/shared/utils/game`) ne prononce rien : elle
 * rend des clés stables, ce fichier les habille — même séparation que
 * `progression.ts` pour les axes.
 *
 * DETTE NOMMÉE, la même que `meesh-copy.ts` et `mascot-copy.ts` : l'écran
 * Progression n'appelle pas encore `translate()`, toute sa copie est du
 * français. L'accord passe par `Intl.PluralRules`, jamais par un `=== 1`, et
 * chaque nom vit dans une table `Record<clé, …>` : le jour du catalogue des
 * sept langues, le point de bascule est déjà au bon endroit.
 */

const REGLE_FR = new Intl.PluralRules('fr-FR');
const NOMBRE = new Intl.NumberFormat('fr-FR');

const singulier = (count: number): boolean => REGLE_FR.select(count) === 'one';

export const formatCount = (count: number): string => NOMBRE.format(count);

export const pointsLabel = (count: number): string =>
  singulier(count) ? `${formatCount(count)} point` : `${formatCount(count)} points`;

export const convertiblePointsLabel = (count: number): string =>
  singulier(count) ? `${formatCount(count)} point convertible` : `${formatCount(count)} points convertibles`;

export const meeshCount = (count: number): string =>
  count === 0 ? 'Aucune Meesh' : singulier(count) ? `${formatCount(count)} Meesh` : `${formatCount(count)} Meeshes`;

export const LEVEL_TIER_NAMES: Readonly<Record<LevelTierKey, string>> = {
  etincelle: 'Étincelle',
  lueur: 'Lueur',
  lumiere: 'Lumière',
  eclat: 'Éclat',
  rayon: 'Rayon',
  aurore: 'Aurore',
  comete: 'Comète',
  etoile: 'Étoile',
  constellation: 'Constellation',
  galaxie: 'Galaxie',
};

export const RANK_NAMES: Readonly<Record<GloryRankOrMythic, string>> = {
  murmure: 'Murmure',
  echo: 'Écho',
  voix: 'Voix',
  conteur: 'Conteur',
  passeur: 'Passeur',
  polyglotte: 'Polyglotte',
  ambassadeur: 'Ambassadeur',
  orateur: 'Orateur',
  oracle: 'Oracle',
  legende: 'Légende',
  mythe: 'Mythe',
};

export const TREASURY_NAMES: Readonly<Record<TreasuryTierKey, string>> = {
  bourse: 'Bourse',
  escarcelle: 'Escarcelle',
  coffret: 'Coffret',
  coffre: 'Coffre',
  tresor: 'Trésor',
  reserve: 'Réserve',
};

export const FLAME_FORM_NAMES: Readonly<Record<FlameFormKey, string>> = {
  braise: 'Braise',
  flamme: 'Flamme',
  brasier: 'Brasier',
  astre: 'Astre',
  soleil: 'Soleil',
};

const DIVISIONS: Readonly<Record<GloryDivision, string>> = { 3: 'III', 2: 'II', 1: 'I' };

export const divisionLabel = (division: GloryDivision): string => DIVISIONS[division];

export const rankLabel = (rank: GloryRankOrMythic, division: GloryDivision | null): string =>
  division === null ? RANK_NAMES[rank] : `${RANK_NAMES[rank]} ${divisionLabel(division)}`;

const EDITIONS: Readonly<Record<MeeshEdition, string>> = { silver: 'argent', gold: 'or', prism: 'prisme' };

export const editionName = (edition: MeeshEdition): string => EDITIONS[edition];

export const DIFFICULTY_NAMES = { easy: 'Facile', medium: 'Moyenne', hard: 'Difficile', gold: 'Or' } as const;

type MissionPhrase = (target: number) => string;

const plural = (target: number, one: string, many: string): string => (singulier(target) ? one : many);

const MISSION_PHRASES: Readonly<Record<string, MissionPhrase>> = {
  'react-messages': (n) => `Réagir à ${n} ${plural(n, 'message', 'messages')}`,
  'send-voice': (n) => `Envoyer ${plural(n, 'un message vocal', `${n} messages vocaux`)}`,
  'send-texts': (n) => `Envoyer ${n} ${plural(n, 'message', 'messages')}`,
  'use-stickers': (n) => `Envoyer ${plural(n, 'un sticker', `${n} stickers`)}`,
  'send-attachments': (n) => `Envoyer ${plural(n, 'une pièce jointe', `${n} pièces jointes`)}`,
  'reply-conversations': (n) => `Répondre dans ${n} conversations différentes`,
  'reply-conversations-wide': (n) => `Répondre dans ${n} conversations différentes`,
  'comment-text': (n) => `Écrire ${plural(n, 'un commentaire', `${n} commentaires`)}`,
  'publish-story': (n) => `Publier ${plural(n, 'une story', `${n} stories`)}`,
  'publish-post': (n) => `Publier ${plural(n, 'un post', `${n} posts`)}`,
  'publish-posts': (n) => `Publier ${plural(n, 'un post', `${n} posts`)}`,
  'share-link': (n) => `Partager ${plural(n, 'un lien', `${n} liens`)}`,
  'prism-foreign-messages': (n) => `Écrire ${plural(n, 'un message', `${n} messages`)} dans une autre langue que la tienne`,
  'prism-foreign-exchange': (n) => `Écrire ${n} messages dans une autre langue que la tienne`,
  'voice-comments': (n) => `Laisser ${plural(n, 'un commentaire vocal', `${n} commentaires vocaux`)}`,
  'publish-reel': (n) => `Publier ${plural(n, 'un réel', `${n} réels`)}`,
  'long-chat': (n) => `Envoyer ${n} messages`,
  'gold-replies-received': (n) => `Recevoir des réponses de ${n} personnes différentes`,
  'gold-reply-conversations': (n) => `Répondre dans ${n} conversations différentes`,
};

/** La mission en clair ; un gabarit que ce client ne connaît pas encore reste « Mission du jour ». */
export const missionTitle = (templateKey: string, target: number): string =>
  MISSION_PHRASES[templateKey]?.(target) ?? 'Mission du jour';

const ERRORS: Readonly<Record<string, string>> = {
  [GAME_ERROR_CODES.insufficientPoints]: 'Pas assez de points convertibles pour frapper une Meesh.',
  [GAME_ERROR_CODES.insufficientMeeshes]: 'Il te faut une Meesh de plus pour ça.',
  [GAME_ERROR_CODES.freezeAtMaximum]: 'Tu as déjà deux gels en réserve : c’est le maximum.',
  [GAME_ERROR_CODES.relightNotAllowed]: 'La Flamme ne peut pas être rallumée maintenant.',
  [GAME_ERROR_CODES.missionNotFound]: 'Cette mission n’existe plus : l’écran se remet à jour.',
  [GAME_ERROR_CODES.missionRerollExhausted]: 'Tu as déjà changé une mission aujourd’hui.',
  [GAME_ERROR_CODES.missionRerollUnavailable]: 'Cette mission ne peut pas être changée.',
  [GAME_ERROR_CODES.missionsLocked]: 'Les missions s’ouvrent au niveau 5.',
  [GAME_ERROR_CODES.chestNotReady]: 'Termine d’abord les missions du jour pour ouvrir le coffre.',
};

const GENERIC_ERROR = 'Ça n’a pas abouti — vérifie ta connexion et réessaie.';

export const gameErrorMessage = (code: string | undefined): string =>
  (code === undefined ? undefined : ERRORS[code]) ?? GENERIC_ERROR;
