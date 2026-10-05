import { useCallback, useEffect, useRef, useState } from 'react';

import { apiConfig } from '@/lib/api/config';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { partagerLien, portailDuNavigateur } from '@/lib/view/invitation';
import { useLiveAnnouncer, type Announcer } from '@/lib/view/use-live-announcer';

import { copyLinkText, LINK_ANNOUNCE_MS } from './link-copy';
import { webOriginOf } from './web-origin';

/**
 * **COPIER ET PARTAGER UNE ADRESSE, AVEC UN RETOUR VISIBLE** — le geste commun
 * aux quatre familles de « Mes liens » (partage #6361, suivi #6408,
 * parrainage #6409, communauté #6410), miroir des `actionsBar` d'iOS : le
 * glyphe « copier » devient une coche deux secondes, et l'issue s'annonce dans
 * une région `role="status"` VISIBLE quatre secondes. Un presse-papier
 * indisponible ou refusé se DIT : un geste sans effet ne se tait pas.
 *
 * `id` nomme la ligne qui porte la coche — un lien de partage, un jeton, une
 * communauté : la clé est opaque ici.
 */

const COPIED_MS = 2000;

export type UrlSharing = {
  readonly announcer: Announcer;
  readonly copiedId: string | null;
  readonly origin: string;
  readonly copy: (id: string, url: string) => void;
  readonly share: (title: string, url: string) => void;
};

export function useUrlSharing(language: InterfaceLanguage): UrlSharing {
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
    (id: string, url: string) => {
      void copyLinkText(url, portailDuNavigateur()).then((outcome) => {
        if (outcome !== 'copied') {
          announce(translate(language, 'links.announce.copyFailed'));
          return;
        }
        announce(translate(language, 'links.announce.copied'));
        setCopiedId(id);
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopiedId(null), COPIED_MS);
      });
    },
    [announce, language],
  );

  const share = useCallback(
    (title: string, url: string) => {
      void partagerLien({ title, text: title, url }).then((outcome) => {
        if (outcome === 'copie') announce(translate(language, 'links.announce.copied'));
        if (outcome === 'indisponible') announce(translate(language, 'links.announce.shareUnavailable'));
      });
    },
    [announce, language],
  );

  return { announcer, copiedId, origin, copy, share };
}
