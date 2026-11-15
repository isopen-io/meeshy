import { createContext, useContext } from 'react';

import type { Attachment, Message } from '@/lib/api/types';

import type { RecentMediaProtection } from './recent-media-policy';
import { recentMediaProtectionOf } from './recent-media-protection';
import { useRememberSeenMedia, type Remember } from './use-remember-seen-media';

/**
 * LA SURFACE QUI CONNAÎT LE MESSAGE DÉCLARE CE QUI SE GARDE (#12052). Les
 * lecteurs (tuile vidéo, vocal, pages de la visionneuse) ne reçoivent que la
 * pièce ; la bulle et la visionneuse du fil savent à quel message elle
 * appartient. Elles posent ce contexte, et les lecteurs le lisent par
 * l'identifiant de leur pièce.
 *
 * Le défaut est FAIL-CLOSED : hors d'une surface qui déclare, aucune pièce
 * n'est gardée. `remember` n'est remplacé que par les témoins.
 */
export type RecentMediaScope = {
  readonly protectionOf: (attachmentId: string) => RecentMediaProtection;
  readonly remember?: Remember;
};

const FAIL_CLOSED: RecentMediaScope = { protectionOf: () => 'protected' };

export const RecentMediaScopeContext = createContext<RecentMediaScope>(FAIL_CLOSED);

/** Les pièces SERVIES de chaque message, par identifiant de pièce. */
export function messagesRecentMediaScope({
  outer,
  entries,
  conversationEncrypted,
  now,
}: {
  readonly outer: RecentMediaScope;
  readonly entries: readonly { readonly message: Message; readonly attachment: Attachment }[];
  readonly conversationEncrypted: boolean;
  readonly now: number;
}): RecentMediaScope {
  const verdicts = new Map(entries.map(({ message, attachment }) => [attachment.id, recentMediaProtectionOf({ message, attachment, conversationEncrypted, now })] as const));
  return { ...outer, protectionOf: (attachmentId) => verdicts.get(attachmentId) ?? 'protected' };
}

/**
 * Un lecteur de pièce jointe : la garde n'est sollicitée qu'au premier
 * `playing` de l'élément visible, et JAMAIS pour une pièce protégée. `src` est
 * l'adresse que l'élément lit (une piste traduite pour un vocal).
 */
export function useRememberSeenAttachment({
  element,
  attachmentId,
  src,
  active,
}: {
  readonly element: HTMLMediaElement | null;
  readonly attachmentId: string;
  readonly src: string;
  readonly active: boolean;
}): void {
  const scope = useContext(RecentMediaScopeContext);
  const protection = scope.protectionOf(attachmentId);
  useRememberSeenMedia({
    element,
    src,
    protection,
    active: active && protection === 'none' && src !== '',
    ...(scope.remember !== undefined ? { remember: scope.remember } : {}),
  });
}
