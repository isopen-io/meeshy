import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { publicProfileQueryKey, publicProfileQueryOptions, publicProfileStatsQueryOptions, type PublicProfile } from '@/lib/api/public-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { reportUser, type ReportReason } from '@/lib/api/reports';
import { presenceStore } from '@/lib/api/presence-store';
import { sessionStore } from '@/lib/api/session';
import { statusMoodsQueryOptions } from '@/lib/api/stories';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { KnownPerson } from '@/lib/profile/known-people';
import { knownPersonOrCached } from '@/lib/profile/known-people-cache';
import { profileFailureOf } from '@/lib/profile/failure';
import { profilePresenceLine } from '@/lib/profile/presence-line';
import { actionsFor, pendingRequestFrom, relationFromServed, type ProfileActionKind } from '@/lib/profile/relation';
import { announcementToneOf } from '@/lib/view/announcement-tone';
import { moodsByAuthor } from '@/lib/view/story-tray';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useMinute } from '@/lib/view/use-minute';
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
const seedProfile = (known: KnownPerson): PublicProfile => ({
  id: known.id ?? '',
  username: known.username,
  displayName: known.displayName,
  avatar: known.avatar,
  banner: null,
  bio: null,
  createdAt: null,
});

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

  /* CACHE D'ABORD, SYNCHRO À L'OUVERTURE (#10092) — la fiche en cache se
     peint au premier rendu, et la lecture repart à CHAQUE ouverture, fraîche
     ou non : statistiques et relation bougent sous les gestes des autres. Un
     échec garde la fiche affichée (TanStack conserve `data`). */
  const fetched = useQuery({ ...publicProfileQueryOptions({ ...apiDeps, handle: username }), refetchOnMount: 'always' }, appQueryClient);
  /* UN REFUS DE REVALIDATION REMPLACE LA FICHE EN CACHE (#10740) : un 403/404
     servi alors que la fiche est déjà là (le profil m'a bloqué, ou a disparu)
     ne la garde pas affichée avec son décor périmé — elle sort de l'écran à
     l'instant et du cache persisté, pour qu'un rechargement ne la rende pas. */
  const gone = fetched.isError && profileFailureOf(fetched.error, true) === 'refused';
  useEffect(() => {
    if (gone) appQueryClient.removeQueries({ queryKey: publicProfileQueryKey(username), exact: true });
  }, [gone, username]);
  const view = gone ? { ...fetched, data: undefined } : fetched;
  /* LES COMPTEURS PARTENT DANS LE MÊME TOUR, JAMAIS APRÈS (profil lent dans la
     coque Android) — même adresse, autre `expand` (`public-profile.ts`) : la
     fiche se peint dès que l'identité et la relation sont là, les compteurs
     la rejoignent quand leur calcul, le seul coûteux de la route, a fini. Une
     fiche persistée AVANT cette séparation porte encore ses compteurs : ils
     servent tant que la lecture dédiée n'a rien rendu. */
  const statsQuery = useQuery({ ...publicProfileStatsQueryOptions({ ...apiDeps, handle: username }), refetchOnMount: 'always' }, appQueryClient);
  const stats = statsQuery.data ?? view.data?.stats ?? null;
  const statsLoading = statsQuery.isFetching && stats === null;
  const served = view.data?.relation ?? 'none';
  /* CE QU'ON SAVAIT DE LA PERSONNE amorce une fiche jamais vue : son identité
     seule, jamais une relation ni des gestes devinés. D'abord ce qu'un toucher
     a retenu, sinon ce que la liste des conversations en cache porte déjà
     (`known-people-cache.ts`) — une adresse ouverte sans toucher (lien,
     notification, démarrage de la coque) a enfin un premier rendu. */
  const [known] = useState(() => knownPersonOrCached(appQueryClient, username));
  const seed = view.data === undefined && !view.isError && known !== null ? seedProfile(known) : null;
  const person = view.data?.profile;
  /* LE SUJET, DÈS QU'ON LE CONNAÎT — l'identifiant servi, ou celui que le
     cache portait : les lectures qui prennent un `User.id` (conversations
     partagées) partent avec la fiche au lieu de l'attendre. `''` = inconnu. */
  const subjectId = person?.id ?? seed?.id ?? '';

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

  const shown = person ?? seed ?? undefined;
  const name = shown?.displayName ?? shown?.username ?? `@${username}`;
  /* L'accent ne dépend que de l'identifiant (`authorAccentColor`) : connu par
     le cache, il est déjà le bon, et la bannière ne change pas de couleur à
     l'arrivée de la fiche. */
  const accent = subjectId === '' ? 'var(--color-ios-brand)' : authorAccentColor(subjectId, name);
  /* La présence d'un AMI (#9063) — telle que la passerelle l'a servie, et
     jamais sur une fiche bloquée : la pastille ne survit pas au geste.
     VIVANTE (#10571) : une fiche dont la passerelle sert la présence suit
     ensuite `user:status`, et sa ligne vieillit à la minute (« vu il y a… »). */
  const livePresence = useStore(presenceStore, (state) => (person === undefined ? undefined : state.byUser[person.id]));
  useMinute();
  const servedPresence = view.data?.presence ?? null;
  /* … et jamais sur SA PROPRE fiche (décision porteur 2026-10-21, #11412). */
  const ownProfile = person !== undefined && person.id === viewerId;
  const presence =
    relation.kind === 'blocked' || servedPresence === null || ownProfile
      ? null
      : profilePresenceLine(livePresence ?? servedPresence, new Date(), language);
  /* L'HUMEUR DU MOMENT (#10528) — lue dans le corpus que le rail a déjà chargé
     (même clé, même fraîcheur que `useStatusMoods`) : le serveur décide qui la
     voit, la fiche ne demande rien de plus. Un visiteur sans compte n'a pas de
     corpus ; une fiche bloquée n'en montre rien, comme la présence. */
  const moods = useQuery({ ...statusMoodsQueryOptions(apiDeps), staleTime: 60_000, enabled: signedIn }, appQueryClient);
  const servedMood = useMemo(() => (person === undefined ? undefined : moodsByAuthor(moods.data ?? []).get(person.id)), [moods.data, person]);
  const mood = relation.kind === 'blocked' ? undefined : servedMood;

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
    seed,
    subjectId,
    stats,
    statsLoading,
    name,
    accent,
    presence,
    relation,
    actions,
    mood,
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
