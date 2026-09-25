import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { apiDeps } from '@/lib/api/deps';
import { createDirectConversation } from '@/lib/api/conversations';
import {
  performBlock,
  performRespondToRequest,
  performSendRequest,
  performUnblock,
  type FriendActionDeps,
  type FriendActionOutcome,
} from '@/lib/api/friend-actions';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { publicProfileQueryOptions } from '@/lib/api/public-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { reportUser, type ReportReason } from '@/lib/api/reports';
import { sessionStore } from '@/lib/api/session';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { actionsFor, pendingRequestFrom, relationFromServed, type ProfileActionKind } from '@/lib/profile/relation';
import { announcementToneOf } from '@/lib/view/announcement-tone';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { href, navigate } from '@/routes/route-table';

/**
 * L'ISSUE D'UN GESTE, DITE À VOIX HAUTE — les clés de « Découvrir » sont
 * réutilisées telles quelles (même geste, même mot), `userProfile.announce.*`
 * ne portant que ce qui est propre à cet écran.
 *
 * **« Écrire » n'a PAS de `done`, et c'est délibéré** : un geste qui réussit
 * NAVIGUE, et l'écran d'après EST le retour. Lui coller « Demande envoyée »
 * par commodité de table aurait annoncé une autre action que celle posée — un
 * lecteur d'écran aurait entendu le mauvais mot avant de changer d'écran.
 */
const ANNOUNCE = {
  add: {
    done: 'discover.announce.sent',
    failed: 'discover.announce.sendFailed',
  },
  accept: {
    done: 'discover.announce.accepted',
    failed: 'discover.announce.acceptFailed',
  },
  reject: {
    done: 'discover.announce.rejected',
    failed: 'discover.announce.rejectFailed',
  },
  cancel: {
    done: 'discover.announce.cancelled',
    failed: 'discover.announce.cancelFailed',
  },
  block: {
    done: 'userProfile.announce.blocked',
    failed: 'userProfile.announce.blockFailed',
  },
  unblock: {
    done: 'discover.announce.unblocked',
    failed: 'discover.announce.unblockFailed',
  },
  write: { done: null, failed: 'userProfile.announce.writeFailed' },
  /* SIGNALER a ses PROPRES annonces (#7187) : « envoyé » n'est pas « ajouté »,
     et son refus le plus fréquent — le DÉBIT — n'est pas un échec. Les trois
     issues sont distinctes chez le port (`ReportOutcome`) et le restent ici. */
  report: { done: 'report.done', failed: 'report.failed' },
} as const satisfies Readonly<
  Record<
    ProfileActionKind,
    {
      readonly done: InterfaceCatalogKey | null;
      readonly failed: InterfaceCatalogKey;
    }
  >
>;

/**
 * **L'IDENTITÉ ET LES GESTES D'UN PROFIL, UNE SEULE FOIS** — la page
 * `/u/$username` et la feuille qui s'ouvre par-dessus l'écran courant
 * (`components/profile-peek-sheet.tsx`) montrent la même personne et offrent
 * les mêmes gestes (Écrire, Ajouter, Accepter, Bloquer, Signaler) : deux
 * copies de cette mécanique dériveraient à la première correction, exactement
 * comme les familles de Prisme l'ont fait.
 *
 * Ce qui reste à la page : ce qui ne tient que sur un écran entier — les
 * publications, les conversations en commun, les compteurs détaillés.
 */
export function useProfileController(username: string, language: InterfaceLanguage) {
  const { text: announcement, tone: announcementTone, announce } = useLiveAnnouncer();
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  const viewerId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  /* Sous fixtures il n'y a pas de session : les gestes y restent mesurables,
     exactement comme `/me` le fait (`profile.tsx:132`). */
  const signedIn = apiDeps.source === 'fixtures' || viewerId !== null;

  const view = useQuery(publicProfileQueryOptions({ ...apiDeps, handle: username }), appQueryClient);
  const person = view.data?.profile;
  const served = view.data?.relation ?? 'none';

  /**
   * **LE BLOCAGE SE LIT PAR SUJET, SUR LE MÊME FIL QUE L'IDENTITÉ** (#7125) —
   * `blockedByViewer`, servi avec `expand=relation`. Il voyage À CÔTÉ de
   * `relation`, jamais dedans : bloquer n'efface pas la ligne d'amitié, et
   * débloquer doit rendre la relation qu'on avait.
   */
  const blocked = view.data?.blockedByViewer === true;

  /**
   * **LA LIGNE SE BÂTIT DEPUIS LE FIL** (#7122) — la passerelle sert
   * l'identifiant de la demande avec l'identité ; le reste se déduit du SENS de
   * la demande et du sujet de l'écran (`pendingRequestFrom`).
   */
  const pendingRequest = useMemo(
    () =>
      person === undefined
        ? null
        : pendingRequestFrom({
            served,
            requestId: view.data?.relationRequestId ?? null,
            person: {
              id: person.id,
              username: person.username,
              displayName: person.displayName,
              avatar: person.avatar,
            },
            viewerId,
          }),
    [person, served, view.data?.relationRequestId, viewerId],
  );

  const relation = relationFromServed({
    served,
    blocked,
    request: pendingRequest,
  });
  const actions = actionsFor(relation);

  const name = person?.displayName ?? person?.username ?? `@${username}`;
  const accent = person === undefined ? 'var(--color-ios-brand)' : authorAccentColor(person.id, name);

  const deps: FriendActionDeps = useMemo(
    () => ({
      ...apiDeps,
      queryClient: appQueryClient,
      isOnline: () => navigator.onLine,
      viewerId: () => viewerId,
    }),
    [viewerId],
  );

  /* UN ÉCHEC NE SE LIT PAS COMME UNE RÉUSSITE (revue #7083) : le refus et le
     hors-ligne portent l'encre d'erreur. Aucun bouton « Réessayer » ne
     s'ajoute : l'état optimiste a été défait, et le bouton d'action revenu à
     son libellé d'avant EST le geste rejouable (D-11). */
  const report = useCallback(
    (kind: ProfileActionKind, outcome: FriendActionOutcome) => {
      const tone = announcementToneOf(outcome);
      if (outcome === 'offline') return announce(translate(language, 'discover.announce.offline'), tone);
      if (outcome === 'failed') return announce(translate(language, ANNOUNCE[kind].failed), tone);
      const done = ANNOUNCE[kind].done;
      if (done !== null) announce(translate(language, done), tone);
    },
    [announce, language],
  );

  const onAction = useCallback(
    (kind: ProfileActionKind) => {
      if (person === undefined || busy) return;
      const summary: PersonSummary = {
        id: person.id,
        username: person.username,
        displayName: person.displayName,
        avatar: person.avatar,
      };
      setBusy(true);
      const settle = (outcome: FriendActionOutcome) => {
        setBusy(false);
        report(kind, outcome);
      };
      if (kind === 'write') {
        if (!navigator.onLine) return settle('offline');
        void createDirectConversation(apiDeps, person.id).then((result) => {
          if (!result.ok) return settle('failed');
          setBusy(false);
          navigate(href('thread', { conversation: result.data.id }));
        });
        return;
      }
      if (kind === 'report') {
        setBusy(false);
        setReporting(true);
        return;
      }
      if (kind === 'add') return void performSendRequest({ person: summary, deps }).then(settle);
      if (kind === 'block') return void performBlock({ person: summary, deps }).then(settle);
      if (kind === 'unblock') return void performUnblock({ person: summary, deps }).then(settle);
      /* Accepter, refuser, annuler ont besoin de la LIGNE : sans elle, le
         bouton est désactivé et la bannière de contexte le dit — jamais un
         geste qui part dans le vide. */
      if (pendingRequest === null) return settle('failed');
      const action = kind === 'accept' ? 'accept' : kind === 'reject' ? 'reject' : 'cancel';
      void performRespondToRequest({
        request: pendingRequest,
        action,
        deps,
      }).then(settle);
    },
    [busy, deps, pendingRequest, person, report],
  );

  /**
   * SIGNALER OUVRE UNE FEUILLE, IL N'ENVOIE PAS (#7187) — choisir un motif EST
   * la confirmation. L'issue `throttled` a son PROPRE message : dire « échoué »
   * à quelqu'un qui vient de signaler un harcèlement l'enverrait recommencer.
   */
  const onPickReason = useCallback(
    (reason: ReportReason) => {
      if (person === undefined) return;
      setBusy(true);
      void reportUser({ userId: person.id, reason, deps: apiDeps }).then((outcome) => {
        setBusy(false);
        setReporting(false);
        if (outcome === 'offline') return announce(translate(language, 'discover.announce.offline'), 'error');
        if (outcome === 'throttled') return announce(translate(language, 'report.throttled'), 'error');
        if (outcome === 'done') return announce(translate(language, 'report.done'), 'neutral');
        announce(translate(language, 'report.failed'), 'error');
      });
    },
    [announce, language, person],
  );

  const closeReport = useCallback(() => setReporting(false), []);

  return {
    view,
    person,
    name,
    accent,
    relation,
    actions,
    viewerId,
    signedIn,
    busy,
    onAction,
    reporting,
    closeReport,
    onPickReason,
    announce,
    announcement,
    announcementTone,
  } as const;
}
