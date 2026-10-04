import { useCallback } from 'react';

import type { MyShareLink } from '@/lib/api/links';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { Announcer } from '@/lib/view/use-live-announcer';

import { useUrlSharing } from './use-url-sharing';
import { displayNameOf, joinUrlOf } from './view';

/**
 * **COPIER ET PARTAGER UN LIEN DE PARTAGE** (#6361) — la projection, pour un
 * `MyShareLink`, du geste commun aux quatre familles (`use-url-sharing.ts`) :
 * la coche se pose sur son `linkId`, l'adresse est `joinUrlOf`.
 */

export { copyLinkText, LINK_ANNOUNCE_MS, type CopyOutcome } from './link-copy';

export type LinkSharing = {
  readonly announcer: Announcer;
  readonly copiedId: string | null;
  readonly origin: string;
  readonly copy: (link: MyShareLink) => void;
  readonly share: (link: MyShareLink) => void;
};

export function useLinkSharing(language: InterfaceLanguage): LinkSharing {
  const sharing = useUrlSharing(language);
  const { origin, copy: copyUrl, share: shareUrl } = sharing;
  const copy = useCallback((link: MyShareLink) => copyUrl(link.linkId, joinUrlOf(link, origin)), [copyUrl, origin]);
  const share = useCallback((link: MyShareLink) => shareUrl(displayNameOf(link), joinUrlOf(link, origin)), [shareUrl, origin]);
  return { announcer: sharing.announcer, copiedId: sharing.copiedId, origin, copy, share };
}
