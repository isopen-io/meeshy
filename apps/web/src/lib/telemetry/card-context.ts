import type {
  EventSurface,
  InteractionAction,
  ListingContext,
  NegativeAction,
  PrismContext,
  ShareDestination,
  SocialEventV2Input,
  TargetKind,
} from '@/lib/api/social-events-v2-types';

/**
 * **OÙ ET COMMENT UNE CARTE ÉTAIT MONTRÉE QUAND ON Y A TOUCHÉ** (#10502) —
 * l'écran, la place dans le listing et ce que le Prisme servait, notés quand
 * la carte s'affiche, relus quand un geste aboutit. Les gestes (`usePostGesture`)
 * ne connaissent que l'identifiant : c'est ici qu'ils retrouvent leur contexte.
 * Registre borné : les plus anciennes cartes sortent les premières.
 */
export type CardContext = {
  readonly targetKind: TargetKind;
  readonly surface?: EventSurface;
  readonly listing?: ListingContext;
  readonly prism?: PrismContext;
  readonly shownAt: number;
};

export const CARD_CONTEXT_CAP = 300;

const contexts = new Map<string, CardContext>();

export function rememberCard(postId: string, context: CardContext): void {
  contexts.delete(postId);
  contexts.set(postId, context);
  if (contexts.size <= CARD_CONTEXT_CAP) return;
  const oldest = contexts.keys().next().value;
  if (oldest !== undefined) contexts.delete(oldest);
}

export const cardContextOf = (postId: string): CardContext | undefined => contexts.get(postId);

const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

/** Ce que le Prisme a servi sur la carte — seulement si les langues sont lisibles. */
export function prismOf(text: { readonly language: string; readonly originalLanguage: string; readonly translated: boolean } | undefined): PrismContext | undefined {
  if (text === undefined || !LANGUAGE.test(text.language)) return undefined;
  return {
    displayedLanguage: text.language,
    ...(LANGUAGE.test(text.originalLanguage) ? { originalLanguage: text.originalLanguage } : {}),
    translated: text.translated,
    ...(text.translated ? { translationSource: 'server' as const } : {}),
  };
}

function located(postId: string, now: number) {
  const context = cardContextOf(postId);
  return {
    target: { kind: context?.targetKind ?? 'post', id: postId },
    ...(context?.surface === undefined ? {} : { surface: context.surface }),
    ...(context?.listing === undefined ? {} : { listing: context.listing }),
    ...(context?.prism === undefined ? {} : { prism: context.prism }),
    ...(context === undefined ? {} : { dwellBeforeMs: Math.max(0, Math.round(now - context.shownAt)) }),
  };
}

/** Un geste ABOUTI sur une carte — la mutation REST a déjà compté ; ceci dit où et comment. */
export function interactionOf(
  postId: string,
  action: InteractionAction,
  extra: { readonly destination?: ShareDestination } = {},
  now: number = Date.now(),
): SocialEventV2Input {
  return { type: 'interaction', action, ...located(postId, now), ...extra };
}

/** Un geste ABOUTI dans un COMMENTAIRE — la cible est le commentaire, la publication son parent. */
export function commentInteractionOf(postId: string, commentId: string, action: InteractionAction, now: number = Date.now()): SocialEventV2Input {
  return { type: 'interaction', action, ...commentTarget(postId, commentId, now) };
}

function commentTarget(postId: string, commentId: string, now: number) {
  const { target, ...where } = located(postId, now);
  return { target: { kind: 'comment' as const, id: commentId, parent: target }, ...where };
}

export function negativeOf(postId: string, action: NegativeAction, extra: { readonly reasonCode?: string; readonly visibleMs?: number } = {}, now: number = Date.now()): SocialEventV2Input {
  const { dwellBeforeMs: _dwell, ...where } = located(postId, now);
  return { type: 'negative', action, ...where, ...extra };
}

/** Un signal négatif posé sur un COMMENTAIRE — sans durée de lecture, comme `negativeOf`. */
export function commentNegativeOf(postId: string, commentId: string, action: NegativeAction, extra: { readonly reasonCode?: string } = {}, now: number = Date.now()): SocialEventV2Input {
  const { dwellBeforeMs: _dwell, ...where } = commentTarget(postId, commentId, now);
  return { type: 'negative', action, ...where, ...extra };
}
