import { useCallback, useEffect, useRef, useState } from 'react';

import { apiConfig } from '@/lib/api/config';
import type { MyShareLink } from '@/lib/api/links';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { partagerLien, portailDuNavigateur } from '@/lib/view/invitation';
import { useLiveAnnouncer, type Announcer } from '@/lib/view/use-live-announcer';

import { copyLinkText, LINK_ANNOUNCE_MS } from './link-copy';
import { displayNameOf, joinUrlOf } from './view';
import { webOriginOf } from './web-origin';

/**
 * **COPIER ET PARTAGER UN LIEN, AVEC UN RETOUR VISIBLE** (#6361) — miroir
 * `ShareLinkDetailView.actionsBar` : le glyphe « copier » devient une coche
 * deux secondes, et l'issue s'annonce dans une région `role="status"` VISIBLE
 * quatre secondes (iOS : haptique + annonce VoiceOver). Un presse-papier
 * indisponible ou refusé se DIT : un geste sans effet ne se tait pas.
 */

const COPIED_MS = 2000;

export { copyLinkText, LINK_ANNOUNCE_MS, type CopyOutcome } from './link-copy';

export type LinkSharing = {
  readonly announcer: Announcer;
  readonly copiedId: string | null;
  readonly origin: string;
  readonly copy: (link: MyShareLink) => void;
  readonly share: (link: MyShareLink) => void;
};

export function useLinkSharing(language: InterfaceLanguage): LinkSharing {
  const announcer = useLiveAnnouncer(LINK_ANNOUNCE_MS);
  const { announce } = announcer;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = webOriginOf(apiConfig.base, window.location.origin);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    (link: MyShareLink) => {
      void copyLinkText(joinUrlOf(link, origin), portailDuNavigateur()).then((outcome) => {
        if (outcome !== 'copied') {
          announce(translate(language, 'links.announce.copyFailed'));
          return;
        }
        announce(translate(language, 'links.announce.copied'));
        setCopiedId(link.linkId);
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopiedId(null), COPIED_MS);
      });
    },
    [announce, language, origin],
  );

  const share = useCallback(
    (link: MyShareLink) => {
      const name = displayNameOf(link);
      void partagerLien({ title: name, text: name, url: joinUrlOf(link, origin) }).then((outcome) => {
        if (outcome === 'copie') announce(translate(language, 'links.announce.copied'));
        if (outcome === 'indisponible') announce(translate(language, 'links.announce.shareUnavailable'));
      });
    },
    [announce, language, origin],
  );

  return { announcer, copiedId, origin, copy, share };
}
