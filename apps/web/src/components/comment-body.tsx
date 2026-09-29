import type { ReactNode } from 'react';

import { MessageEffectsHost } from '@/components/message-effects-host';
import { ProtectedContent } from '@/components/protected-content';
import type { PostComment } from '@/lib/api/publication-comments';
import { isBlurredComment } from '@/lib/view/comment-reply-target';

import '@/styles/thread-protection.css';

/**
 * **LE CORPS D'UN COMMENTAIRE ET SES EFFETS** (#8583) — miroir de
 * `commentBody(effects:)` (`CommentSwipeToReply.swift`) : le voile du FLOU,
 * puis les effets d'apparition et persistants par le MÊME rendu que les
 * messages (`MessageEffectsHost`, `effectPlaybackPlanOf`). Directive porteur
 * du 2026-09-28 : « les effets autorisés sur les commentaires doivent
 * s'appliquer », partout où un commentaire se lit.
 *
 * Le composeur iOS OFFRE ces effets à un commentaire (`ComposerMode.comment`)
 * et la passerelle les stocke (`PostComment.effectFlags`) ; le web les
 * recevait et les jetait — un commentaire flouté s'affichait EN CLAIR.
 *
 * **LE VOILE NE COUVRE QUE LE CORPS** — l'auteur, l'heure et les gestes
 * restent lisibles, comme dans une bulle protégée. Et c'est le voile du FIL,
 * pas une imitation : `ProtectedContent` en `veiled` — le texte masqué
 * n'ENTRE PAS dans le DOM avant le toucher (un `filter: blur()` sur le vrai
 * texte serait la protection annoncée et non appliquée, cycle 124), se révèle
 * au toucher, à Entrée ou à Espace (c'est un `<button>`), et se referme seul
 * après la fenêtre de lecture, comme un message.
 *
 * **Un commentaire SANS effet ne paie rien** : `MessageEffectsHost` ne rend
 * que ses enfants, et le voile n'est monté que pour un commentaire flouté.
 */
export function CommentBody({
  comment,
  contentLength,
  children,
}: {
  readonly comment: Pick<PostComment, 'id' | 'effectFlags'>;
  /** La longueur du texte SERVI — le substitut du voile en dérive sa forme. */
  readonly contentLength: number;
  readonly children: ReactNode;
}) {
  const effectFlags = typeof comment.effectFlags === 'number' ? comment.effectFlags : undefined;
  const body = isBlurredComment(comment) ? (
    <ProtectedContent
      messageId={`comment-${comment.id}`}
      kind="veiled"
      isViewOnce={false}
      contentLength={contentLength}
      attachments={undefined}
      surface="row"
    >
      {children}
    </ProtectedContent>
  ) : (
    children
  );
  return <MessageEffectsHost effectFlags={effectFlags}>{body}</MessageEffectsHost>;
}
