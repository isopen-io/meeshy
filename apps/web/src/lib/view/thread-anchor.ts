/**
 * L'ADRESSE DU FIL NOMME LE MESSAGE OÙ S'OUVRIR (#9294) — `/c/<id>?message=<id>`,
 * miroir du `highlightMessageId` que `navigateToConversationById` iOS remet au
 * routeur. Le fil la lit à l'ouverture (`useThreadOpenScroll`) et la remet au
 * saut de la citation (`useThreadJump`) : défilement, pages plus anciennes,
 * mise en évidence — une seule voie.
 */
export const THREAD_ANCHOR_PARAM = 'message';

export function threadAnchorOf(search: URLSearchParams | undefined): string | null {
  const messageId = search?.get(THREAD_ANCHOR_PARAM) ?? '';
  return messageId === '' ? null : messageId;
}
