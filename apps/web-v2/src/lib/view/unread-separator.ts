import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { UnreadBoundarySnapshot } from './unread-boundary';

/**
 * « N messages non lus » (#7202, D-L3) — pluriel `.one`/`.other`, même
 * convention que `stories.count.*` / `message-detail.*` (W7) /
 * `feed.newPosts.*`. `translate` jette si le catalogue de la langue n'est
 * pas encore chargé — cet appelant ne rattrape rien, comme les autres
 * consommateurs de `translate()` (le routeur attend déjà le catalogue avant
 * de monter l'écran, `i18n-catalog.ts`, doc-comment).
 */
export function unreadSeparatorLabel(language: InterfaceLanguage, count: number): string {
  return translate(language, count === 1 ? 'thread.unread-separator.one' : 'thread.unread-separator.other', {
    count: String(count),
  });
}

export type ThreadOpenScrollDecision =
  | { readonly kind: 'jump-to-separator'; readonly index: number }
  | { readonly kind: 'pin-to-bottom' };

export type PlacedLike = { readonly message: { readonly id: string } };

/**
 * **D-L2 — sur le séparateur à l'OUVERTURE, toujours ; jamais ensuite.**
 *
 * `isInitialOpen` distingue « ce fil vient de s'ouvrir » d'« un message de
 * plus vient d'arriver pendant la session » — le second cas garde le
 * comportement d'aujourd'hui (ancrage en bas), MÊME quand `unreadBoundary`
 * n'est pas nul : D-L2 gouverne l'ouverture d'un fil, pas ce qui se passe
 * une fois qu'on y est déjà (le bouton « revenir en bas » et le pin sur
 * arrivée restent la loi de `pin-to-bottom.ts`).
 *
 * `unreadBoundary === null` (tout est lu) ⇒ ancrage en bas, comme
 * aujourd'hui — la règle explicite du critère de fin.
 *
 * **Borne assumée (S1)** : si `firstUnreadId` n'est pas dans `placed` (la
 * fenêtre CHARGÉE, `useMessages` ne sert que les 50 derniers messages), il
 * n'y a pas de rangée où sauter — repli sur l'ancrage en bas plutôt qu'un
 * saut vers un index qui n'existe pas.
 */
export function threadOpenScrollDecision(params: {
  readonly isInitialOpen: boolean;
  readonly unreadBoundary: UnreadBoundarySnapshot;
  readonly placed: readonly PlacedLike[];
}): ThreadOpenScrollDecision {
  const { isInitialOpen, unreadBoundary, placed } = params;
  if (isInitialOpen && unreadBoundary !== null) {
    const index = placed.findIndex((p) => p.message.id === unreadBoundary.firstUnreadId);
    if (index !== -1) return { kind: 'jump-to-separator', index };
  }
  return { kind: 'pin-to-bottom' };
}
