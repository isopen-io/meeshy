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
 *
 * Le choix est LOCAL : il ne quitte jamais cet écran.
 */

export type SpotlightChoice = null | { readonly kind: 'member'; readonly userId: string } | { readonly kind: 'grid'; readonly dismissedSharer: string | null };

export type SpotlightView = {
  readonly featured: CallMember;
  readonly others: readonly CallMember[];
  /** La une montre l'ÉCRAN partagé (entier, `contain`), pas la caméra. */
  readonly screen: boolean;
  /** Montée par la règle, pas par un toucher. */
  readonly automatic: boolean;
};

export const chooseMember = (userId: string): SpotlightChoice => ({ kind: 'member', userId });

export const chooseGrid = (dismissedSharer: string | null): SpotlightChoice => ({ kind: 'grid', dismissedSharer });

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
  const chosen = choice?.kind === 'member' ? input.members.find((member) => member.userId === choice.userId) : undefined;
  if (chosen !== undefined) return featuring(chosen, input, false);
  if (choice?.kind === 'grid' && choice.dismissedSharer === (sharer?.userId ?? null)) return null;
  return sharer === null ? null : featuring(sharer, input, true);
}
