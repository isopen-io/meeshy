import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { performSetShareLinkActive, type LinkActionDeps, type ShareLinkActionOutcome } from '@/lib/api/link-actions';
import { shareLinksQueryOptions, type MyShareLink } from '@/lib/api/links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useLinkSharing } from '@/lib/links/use-link-sharing';
import { displayNameOf, findShareLink, joinUrlOf, shareLinkDetailState } from '@/lib/links/view';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useTapGate } from '@/lib/view/tap-gate';
import {
  LinksAnnouncement,
  LinksHeader,
  LinksLoadError,
  LinksOfflineNotice,
  ShareLinkActions,
  ShareLinkDetailSkeleton,
  ShareLinkHero,
  ShareLinkInformation,
  ShareLinkRefused,
  ShareLinkUsage,
} from '@/routes/links-parts';

/**
 * **UN LIEN DE PARTAGE** (#6361) — miroir `ShareLinkDetailView.swift` : carte
 * d'en-tête (état, conversation, adresse), Copier / Partager / Désactiver,
 * utilisations et maximum, informations.
 *
 * **Le détail se lit dans la liste de SES liens, jamais par identifiant
 * public.** Ouvert depuis la liste, il se peint sans attendre ; ouvert par
 * une adresse directe, il charge les pages de la liste jusqu'à trouver son
 * `linkId`. Un lien d'un autre compte n'est dans aucune page (`createdBy`,
 * passerelle) : il rend le refus, comme un linkId inconnu — aucun oracle.
 *
 * **Désactiver est optimiste** (`performSetShareLinkActive`) : la pastille,
 * la barre d'actions et la ligne de la liste changent au tap et reviennent
 * si la passerelle refuse. « Supprimer » n'est pas repris (D-63).
 */

type ToggleKey = 'links.announce.offline' | 'links.announce.toggleFailed';
const TOGGLE_FAILURE: Readonly<Record<Exclude<ShareLinkActionOutcome, 'done' | 'busy'>, ToggleKey>> = {
  offline: 'links.announce.offline',
  failed: 'links.announce.toggleFailed',
};

export default function ShareLinkScreen() {
  const { link: linkId } = useParams<'/links/share/$link'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const list = useInfiniteQuery({ ...shareLinksQueryOptions(apiDeps), enabled: apiDeps.source === 'fixtures' || signedIn }, appQueryClient);
  const sharing = useLinkSharing(language);
  const { announce } = sharing.announcer;
  const link = findShareLink(list.data, linkId);
  const state = shareLinkDetailState({
    found: link !== undefined,
    loaded: list.data !== undefined,
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    isError: list.isError,
  });

  const { fetchNextPage } = list;
  useEffect(() => {
    if (state === 'searching') void fetchNextPage();
  }, [state, fetchNextPage]);

  const deps: LinkActionDeps = useMemo(() => ({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine }), []);
  const admitTap = useTapGate();
  const toggle = useCallback(
    (current: MyShareLink) => {
      if (!admitTap()) return;
      const next = !current.isActive;
      void performSetShareLinkActive({ link: current, isActive: next, deps }).then((outcome) => {
        if (outcome === 'busy') return;
        announce(translate(language, outcome === 'done' ? (next ? 'links.announce.activated' : 'links.announce.disabled') : TOGGLE_FAILURE[outcome]));
      });
    },
    [admitTap, announce, deps, language],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader
        language={language}
        back="shareLinks"
        backLabel={translate(language, 'links.detail.back')}
        title={link === undefined ? translate(language, 'links.hub.share.title') : displayNameOf(link)}
      />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-5 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          {link !== undefined ? (
            <>
              <ShareLinkHero language={language} link={link} url={joinUrlOf(link, sharing.origin)} />
              <ShareLinkActions
                language={language}
                link={link}
                copied={sharing.copiedId === link.linkId}
                onCopy={() => sharing.copy(link)}
                onShare={() => sharing.share(link)}
                onToggle={() => toggle(link)}
              />
              <ShareLinkUsage language={language} link={link} />
              <ShareLinkInformation language={language} link={link} />
            </>
          ) : state === 'refused' ? (
            <ShareLinkRefused language={language} />
          ) : state === 'error' ? (
            <LinksLoadError language={language} onRetry={() => void (list.data === undefined ? list.refetch() : list.fetchNextPage())} />
          ) : (
            <ShareLinkDetailSkeleton language={language} />
          )}
        </div>
      </main>
      <LinksAnnouncement text={sharing.announcer.text} />
    </div>
  );
}
