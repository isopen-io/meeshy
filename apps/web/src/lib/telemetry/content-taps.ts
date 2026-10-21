import type { InteractionAction } from '@/lib/api/social-events-v2-types';
import { compile, match } from '@/lib/router';
import { ROUTES } from '@/routes/route-table';

/**
 * **QUEL LIEN D'IDENTITÉ A ÉTÉ TOUCHÉ DANS UN CONTENU** (#10502) — l'auteur,
 * une mention, un hashtag. Lu sur la DESTINATION du lien (le motif de la
 * table de routes, jamais son texte) : la carte et le fil de commentaires
 * posent UN écouteur et n'ont rien à câbler chez `Avatar`, `PersonName` ou
 * `RichText`. Une mention est un lien de profil posé DANS un texte enrichi.
 */
export type ContentTap = Extract<InteractionAction, 'profile_tap' | 'hashtag_tap' | 'mention_tap'>;

const PROFILE = compile(ROUTES.userProfile.pattern);
const HASHTAG = compile(ROUTES.hashtag.pattern);

export function contentTapOf(target: EventTarget | null): ContentTap | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest('a[href]');
  const path = link?.getAttribute('href')?.split(/[?#]/)[0];
  if (link === null || link === undefined || path === undefined) return null;
  if (match(HASHTAG, path) !== null) return 'hashtag_tap';
  if (match(PROFILE, path) === null) return null;
  return link.closest('[data-rich-text]') === null ? 'profile_tap' : 'mention_tap';
}

/** Le même tap, posé dans une rangée de commentaire CONFIRMÉE — une rangée provisoire n'a pas d'identifiant serveur. */
export function commentTapOf(target: EventTarget | null): { readonly tap: ContentTap; readonly commentId: string } | null {
  const tap = contentTapOf(target);
  const row = tap === null || !(target instanceof Element) ? null : target.closest('[data-comment-row]');
  const commentId = row?.getAttribute('data-comment-row');
  if (tap === null || row === null || row === undefined || row.hasAttribute('data-comment-pending') || !commentId) return null;
  return { tap, commentId };
}
