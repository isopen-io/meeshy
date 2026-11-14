import type { CallMember } from './call-store';
import { hasVideo } from './call-view';

/**
 * **LA MISE À LA UNE D'UN APPEL DE GROUPE** (#8392) — la règle, pure.
 *
 * - Sans choix : un membre qui partage son écran (et dont la piste arrive)
 *   monte seul à la une ; sinon, la grille.
 * - Un toucher sur une vignette est un choix MANUEL : il l'emporte sur la
 *   montée automatique, tant que ce participant est là (parti, la règle
 *   reprend).
 * - « Grille » est aussi un choix manuel, mais il ne vaut que pour le partage
 *   qu'il a congédié : dès que ce partage finit (ou qu'un autre commence), la
 *   règle reprend la main — sans effet à rejouer, parce que le choix NOMME le
 *   partage qu'il écarte.
 * - Un partage qui COMMENCE fait tomber tout choix (#18180) : `choiceAfterSharerChange`.
 *
 * - MA tuile passe à la une comme les autres (#9098, `featuresLocal` sur
 *   iOS) : `featured` nul dit « moi », tous les pairs passent en bandeau.
 *
 * Le choix est LOCAL : il ne quitte jamais cet écran.
 */

export type SpotlightChoice = null | { readonly kind: 'member'; readonly userId: string } | { readonly kind: 'self' } | { readonly kind: 'grid'; readonly dismissedSharer: string | null };

export type SpotlightView = {
  /** Le membre à la une — `null` : MA tuile. */
  readonly featured: CallMember | null;
  readonly others: readonly CallMember[];
  /** La une montre l'ÉCRAN partagé (entier, `contain`), pas la caméra. */
  readonly screen: boolean;
  /** Montée par la règle, pas par un toucher. */
  readonly automatic: boolean;
};

type SpotlightInput = {
  readonly members: readonly CallMember[];
  readonly choice: SpotlightChoice;
  readonly remoteStreams: Readonly<Record<string, MediaStream>>;
};

const showsScreen = (member: CallMember, streams: SpotlightInput['remoteStreams']): boolean => member.screenSharing && hasVideo(streams[member.userId]);

/** Celui dont l'écran monterait seul — le premier qui partage ET dont la piste arrive. */
export function autoSharer(members: readonly CallMember[], streams: SpotlightInput['remoteStreams']): CallMember | null {
  return members.find((member) => showsScreen(member, streams)) ?? null;
}

const featuring = (featured: CallMember, input: SpotlightInput, automatic: boolean): SpotlightView => ({
  featured,
  others: input.members.filter((member) => member.userId !== featured.userId),
  screen: showsScreen(featured, input.remoteStreams),
  automatic,
});

export function resolveSpotlight(input: SpotlightInput): SpotlightView | null {
  const { choice } = input;
  const sharer = autoSharer(input.members, input.remoteStreams);
  if (choice?.kind === 'self') return { featured: null, others: input.members, screen: false, automatic: false };
  const chosen = choice?.kind === 'member' ? input.members.find((member) => member.userId === choice.userId) : undefined;
  if (chosen !== undefined) return featuring(chosen, input, false);
  if (choice?.kind === 'grid' && choice.dismissedSharer === (sharer?.userId ?? null)) return null;
  return sharer === null ? null : featuring(sharer, input, true);
}

/**
 * Un partage qui COMMENCE prend la une, même après un choix manuel (#18180, loi 15) : tout choix tombe. « Grille » ne
 * vaut que pour le partage qu'il a congédié : sa fin rend aussi la main à la règle. Une vignette épinglée, ou ma tuile,
 * restent quand le partage FINIT — miroir de `GroupCallSpotlight.choiceAfterSharerChanged` d'Android (#18248).
 */
export const choiceAfterSharerChange = (choice: SpotlightChoice, from: string | null, to: string | null): SpotlightChoice => {
  if (from === to) return choice;
  if (to !== null || choice?.kind === 'grid') return null;
  return choice;
};

/**
 * Les niveaux du plein écran de la une (loi 15, #17961) : `full` (U2) range l'en-tête, la pilule et les bannières et
 * GARDE les caméras des autres ; `total` (U2b) ne montre que l'écran partagé — miroir de `GroupCallFullScreenLevel`.
 */
export type FullScreenLevel = 'off' | 'full' | 'total';

/** Le niveau total est réservé à un écran partagé : une caméra à la une n'en a qu'un (#17961, 2026-11-14). */
export const fullScreenLevelFor = (level: FullScreenLevel, screen: boolean): FullScreenLevel => (level === 'total' && !screen ? 'full' : level);
