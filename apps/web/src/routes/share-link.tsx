import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand/react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiDeps } from '@/lib/api/deps';
import {
  performDeleteShareLink,
  performSetShareLinkActive,
  performUpdateShareLink,
  type LinkActionDeps,
  type ShareLinkActionOutcome,
  type ShareLinkUpdateOutcome,
} from '@/lib/api/link-actions';
import { shareLinkStatsQueryOptions } from '@/lib/api/link-stats';
import { shareLinksQueryOptions, type MyShareLink, type ShareLinkPatch } from '@/lib/api/links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useLinkSharing } from '@/lib/links/use-link-sharing';
import { displayNameOf, findShareLink, joinUrlOf, shareLinkDetailState } from '@/lib/links/view';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useTapGate } from '@/lib/view/tap-gate';
import { LinksAnnouncement, LinksHeader, LinksLoadError, LinksOfflineNotice, ShareLinkDetailSkeleton, ShareLinkRefused } from '@/routes/links-parts';
import { href, navigate } from '@/routes/route-table';
import { ArrivalLanguages, ConfigurationCard, InviteLinkCard, LinkBreadcrumb, LinkStatTiles, RecentArrivals } from '@/routes/share-link-detail-parts';
import { EditLinkForm } from '@/routes/share-link-edit';

/**
 * **LA PAGE DU CRÉATEUR D'UN LIEN D'INVITATION** (#7797, maquette validée) —
 * détails ET édition, ouverte depuis Liens › Liens de conversation › le lien.
 *
 * Deux colonnes au-delà de 768 px (les détails à gauche, l'édition à
 * droite), empilement iOS en dessous (`IosLienDetail`) : carte du lien,
 * Visites / Arrivées / Sans compte, langues des arrivants, arrivés récemment,
 * configuration en lecture, puis le formulaire.
 *
 * **Le lien se lit dans la liste de SES liens, jamais par identifiant
 * public** (D-63) : ouvert depuis la liste, il se peint sans attendre ; ouvert
 * par une adresse directe, les pages se chargent jusqu'à trouver son `linkId`.
 * Un lien d'un autre compte n'est dans aucune page : il rend le refus.
 *
 * **Cache d'abord, partout.** Le lien vient du cache persisté de la liste, les
 * statistiques du leur (`link-stats.ts`) : aucune roue sur un cache non vide,
 * et une statistique que la passerelle ne sert pas encore se dessine « — ».
 * Une ligne lue avant `?expand=policy` (cache d'avant #7797) se relit une fois
 * en silence pour gagner sa politique.
 *
 * **Enregistrer, Désactiver et Supprimer sont optimistes**, avec retour arrière
 * (`link-actions.ts`).
 */

type ToggleKey = 'links.announce.offline' | 'links.announce.toggleFailed';
const TOGGLE_FAILURE: Readonly<Record<Exclude<ShareLinkActionOutcome, 'done' | 'busy'>, ToggleKey>> = {
  offline: 'links.announce.offline',
  failed: 'links.announce.toggleFailed',
};

const SAVE_ANNOUNCE = {
  done: 'linkDetail.announce.saved',
  failed: 'linkDetail.announce.saveFailed',
  offline: 'linkDetail.announce.offline',
  unchanged: 'linkDetail.edit.unchanged',
} as const satisfies Readonly<Record<ShareLinkUpdateOutcome, string>>;

export default function ShareLinkScreen() {
  const { link: linkId } = useParams<'/links/share/$link'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const enabled = apiDeps.source === 'fixtures' || signedIn;
  const list = useInfiniteQuery({ ...shareLinksQueryOptions(apiDeps), enabled }, appQueryClient);
  const stats = useQuery({ ...shareLinkStatsQueryOptions(apiDeps, linkId), enabled }, appQueryClient);
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

  const { fetchNextPage, refetch } = list;
  useEffect(() => {
    if (state === 'searching') void fetchNextPage();
  }, [state, fetchNextPage]);

  const missingPolicy = link !== undefined && link.policy === null;
  useEffect(() => {
    if (missingPolicy && online) void refetch();
  }, [missingPolicy, online, refetch]);

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

  const save = useCallback(
    async (current: MyShareLink, patch: ShareLinkPatch): Promise<ShareLinkUpdateOutcome> => {
      const outcome = await performUpdateShareLink({ link: current, patch, deps });
      announce(translateInvite(language, SAVE_ANNOUNCE[outcome]), outcome === 'failed' || outcome === 'offline' ? 'error' : 'neutral');
      return outcome;
    },
    [announce, deps, language],
  );

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useCallback(
    async (current: MyShareLink) => {
      setDeleting(true);
      const outcome = await performDeleteShareLink({ link: current, deps });
      setDeleting(false);
      setConfirming(false);
      if (outcome === 'done') {
        navigate(href('shareLinks'), true);
        return;
      }
      announce(translateInvite(language, outcome === 'offline' ? 'linkDetail.announce.offline' : 'linkDetail.announce.deleteFailed'), 'error');
    },
    [announce, deps, language],
  );

  const now = new Date();
  const title = link === undefined ? translate(language, 'links.hub.share.title') : displayNameOf(link);
  const served = stats.data === undefined && stats.isError ? null : stats.data;

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="md:hidden">
        <LinksHeader language={language} back="shareLinks" backLabel={translate(language, 'links.detail.back')} title={title} />
      </div>
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe md:px-10">
        <div className="mx-auto grid max-w-xl gap-5 pb-24 pt-2 md:max-w-[1200px] md:gap-4 md:pt-7">
          <LinkBreadcrumb language={language} name={title} />
          <h1 className="hidden text-screen font-extrabold tracking-tight md:block" style={{ color: 'var(--color-ios-ink)' }}>
            {translateInvite(language, 'linkDetail.title')}
          </h1>
          {online ? null : <LinksOfflineNotice language={language} />}
          {link !== undefined ? (
            <div data-share-link-layout className="grid gap-5 md:grid-cols-2 md:items-start md:gap-7">
              <div className="grid gap-3.5">
                <InviteLinkCard
                  language={language}
                  link={link}
                  url={joinUrlOf(link, sharing.origin)}
                  copied={sharing.copiedId === link.linkId}
                  onShare={() => sharing.share(link)}
                  onCopy={() => sharing.copy(link)}
                />
                <LinkStatTiles language={language} stats={served} />
                {served === null || served === undefined ? null : (
                  <>
                    <ArrivalLanguages language={language} stats={served} />
                    <RecentArrivals language={language} stats={served} now={now} />
                  </>
                )}
                <ConfigurationCard language={language} link={link} policy={link.policy} />
              </div>
              {link.policy === null ? null : (
                <EditLinkForm
                  key={link.linkId}
                  language={language}
                  link={link}
                  policy={link.policy}
                  now={() => new Date()}
                  onSave={(patch) => save(link, patch)}
                  onToggleActive={() => toggle(link)}
                  onDelete={() => setConfirming(true)}
                />
              )}
              {/* **UNE SEULE CONFIRMATION, PARTOUT** (revue-correction #6149,
                  défaut majeur 2, issue #7858) — `ConfirmDelete` était la
                  TROISIÈME copie divergente, et la seule avec un rayon écrit
                  à la main. `busy` reste posé : cet écran attend encore la
                  réponse réseau avant de fermer (#6411). */}
              {confirming ? (
                <ConfirmDialog
                  name="deleteShareLink"
                  title={translateInvite(language, 'linkDetail.delete.title')}
                  body={translateInvite(language, 'linkDetail.delete.body')}
                  cancelLabel={translateInvite(language, 'linkDetail.delete.cancel')}
                  confirmLabel={translateInvite(language, 'linkDetail.delete.confirm')}
                  tone="destructive"
                  busy={deleting}
                  onConfirm={() => void remove(link)}
                  onCancel={() => setConfirming(false)}
                />
              ) : null}
            </div>
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
