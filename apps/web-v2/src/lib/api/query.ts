import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { conversationStore } from '@/lib/conversation-store';
import { railStoryGroups, type RailEntry, type RailSelfEntry } from '@/lib/lens/rail-policy';
import { performSend, retrySend, type Draft } from '@/lib/send/perform-send';
import { outboxStore } from '@/lib/send/outbox-store';
import type { RowActionId } from '@/lib/view/row-actions';

import { ApiError, httpTransport } from './client';
import { apiConfig } from './config';
import { performRowAction } from './conversation-actions';
import { conversationQuery, conversationsQuery, type ConversationsDeps } from './conversations';
import type { Conversation, Participant } from './types';
import { messagesQuery } from './messages';
import { appQueryClient } from './query-client';
import { performReaction, type PerformReactionResult } from './reactions';
import {
  hasUnviewedStories,
  isGroupFullyExpired,
  latestStoryOf,
  statusesQuery,
  storyTrayQuery,
  type StoryGroup,
} from './stories';

/**
 * `apiDeps` — LA `ConversationsDeps` DE MODULE (#5650, F2/F3 ; #5652
 * revue-correction défaut 4) : la source est figée à la CONSTRUCTION
 * (`VITE_DATA_SOURCE`), jamais relue à l'exécution — donc jamais recalculée
 * à chaque rendu. EXPORTÉE pour que tout appelant qui a besoin d'une
 * `ConversationsDeps` (un port sous `lib/api/*` déjà typé ainsi) l'IMPORTE
 * d'ici plutôt que de reconstruire `{ source: apiConfig.source, transport:
 * httpTransport }` à son propre site — c'est exactement la jumelle que
 * `list-header.tsx` et `conversation-new.tsx` recomposaient avant ce
 * correctif ; les deux l'importent désormais. Ce n'est PAS encore le SEUL
 * site qui lit `apiConfig.source` du dépôt : `summary-host.tsx`,
 * `use-reader.ts`, `progression.tsx`/`progression-page.tsx`, `realtime.ts`,
 * `main.tsx`, `conversations.tsx` et `thread.tsx` la lisent chacun pour leur
 * propre requête ou décision — leur convergence vers cet export, ou la
 * preuve qu'elle ne s'applique pas, est #6151 ; ne pas rouvrir cette
 * exclusivité tant que #6151 n'est pas close.
 */
export const apiDeps: ConversationsDeps = { source: apiConfig.source, transport: httpTransport };

export function useConversations() {
  return useQuery(conversationsQuery(apiDeps));
}

/**
 * `useConversationsSnapshot` — LA LISTE POUR UN AUTRE ÉCRAN (#5650,
 * revue-correction) : la MÊME fabrique, le MÊME cache, la MÊME clé — mais
 * `enabled: false`, donc JAMAIS de requête. Un écran qui n'est pas la liste
 * (le fil et son compteur « non lus ailleurs ») en OBSERVE le contenu et se
 * re-rend quand il change, au lieu d'en prendre un instantané figé par
 * `queryClient.getQueryData()` au premier rendu — un instantané pris sur un
 * cache encore vide (lien direct vers `/c/:id`) ne se remplissait jamais, et
 * une conversation marquée lue ailleurs gardait son compte pour toujours.
 */
export function useConversationsSnapshot(): readonly Conversation[] | undefined {
  return useQuery({ ...conversationsQuery(apiDeps), enabled: false }).data;
}

export function useConversation(id: string) {
  const queryClient = useQueryClient();
  return useQuery(conversationQuery(apiDeps, id, { queryClient }));
}

export function useMessages(id: string) {
  return useQuery(messagesQuery(apiDeps, id));
}

export type ThreadDataStatus = 'pending' | 'success' | 'refused' | 'error';

function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

/**
 * `useThreadData` — compose les DEUX requêtes du fil. `status: 'refused'`
 * (D-6) dès que L'UNE des deux porte un `ApiError` 403/404 — un id qui
 * n'existe pas OU dont le lecteur n'est pas membre rend le MÊME refus,
 * jamais le contenu d'une autre conversation (F8 : plus de repli sur
 * `CONVERSATIONS[0]`).
 *
 * `conversationId` (revue-correction #5793, défaut MAJEUR 3) — LE paramètre
 * de route n'est qu'un moyen de CHARGER (`GET /conversations/:id`, qui
 * accepte « ID or identifier », `core-detail.ts:250`) : la passerelle
 * NORMALISE tout identifiant lisible en ObjectId AVANT de diffuser quoi que
 * ce soit (`normalizeConversationId`, `MeeshySocketIOManager.ts:2879`), donc
 * `message:new`/`conversation:updated`/`message:translation` portent
 * TOUJOURS l'ObjectId — jamais l'identifiant de la route. Clé le fil sur le
 * paramètre de route AVANT que `conversation.data` n'arrive (rien à perdre,
 * la passerelle résout aussi les deux formes pour `GET …/messages`), puis
 * BASCULE sur `conversation.data.id` dès qu'il est connu : un lien direct
 * `/c/<identifiant>` recevait alors ses temps réel sur une clé de cache que
 * PERSONNE ne lisait, le fil ouvert restant muet et la Lentille ne se
 * réordonnant jamais. Un lien déjà canonique (le cas nominal, navigation
 * depuis la Lentille) ne change pas de clé : `conversation.data.id === id`,
 * aucune requête de plus.
 */
export function useThreadData(id: string) {
  const conversation = useConversation(id);
  const conversationId = conversation.data?.id ?? id;
  const messages = useMessages(conversationId);

  const error = conversation.error ?? messages.error ?? null;
  const refused = isRefusal(conversation.error) || isRefusal(messages.error);
  const failed = conversation.isError || messages.isError;
  const ready = conversation.data !== undefined && messages.data !== undefined;

  const status: ThreadDataStatus = refused ? 'refused' : failed ? 'error' : ready ? 'success' : 'pending';

  return {
    conversationId,
    conversation: conversation.data,
    messages: messages.data?.messages ?? [],
    hasOlder: messages.data?.hasOlder ?? false,
    status,
    error,
    refetch: (): void => {
      void conversation.refetch();
      void messages.refetch();
    },
    /**
     * `typing` A DISPARU D'ICI (#5793) — c'était un BOOLÉEN DE SOURCE
     * (`apiConfig.source === 'fixtures'`), jamais une donnée : il valait
     * `true` en fixtures quel que soit ce qui se passait, `false` en
     * gateway quoi qu'il arrive. La frappe RÉELLE vit désormais dans
     * `typing-store.ts`, alimenté par `api/socket.ts` (`typing:start`/
     * `typing:stop`) et lu par `useTypists()` (`api/use-typists.ts`) —
     * `routes/thread.tsx` la consomme directement, ce hook n'a plus à la
     * transporter.
     */
  };
}

const EMPTY_STORY_GROUPS: readonly StoryGroup[] = [];
const EMPTY_MOODS: Readonly<Record<string, string>> = {};

export type StoryRailData = {
  readonly selfEntry: RailSelfEntry | undefined;
  readonly entries: readonly RailEntry[];
  /** Cache VIDE ET requête en vol — jamais « une requête est en cours » (le
   * même critère que `loading` dans `routes/conversations.tsx`). */
  readonly loading: boolean;
};

/**
 * `useStoryRail` — L'ADAPTATEUR ENTRE LE PORT (`stories.ts`) ET LA LOI
 * (`rail-policy.ts`), #5652 bloc B « la fusion moi ». Compose DEUX requêtes
 * (`storyTrayQuery`, `statusesQuery`) exactement comme `useThreadData`
 * compose `useConversation`/`useMessages` : chacune sert son propre corpus,
 * cet adaptateur les FOND en `RailEntry[]`/`RailSelfEntry` — jamais une
 * troisième requête réseau.
 *
 * `isLive` reste `false` PARTOUT (miroir iOS, `ConversationListView.swift:
 * 1405-1410` — aucun appel en direct n'existe encore sur aucune plateforme).
 * `now` est recalculé à chaque nouveau CORPUS (`groups` change de référence à
 * chaque requête réussie), pas à la minute : une story dure 24 h, la
 * précision de la minute n'y change rien d'observable — contrairement aux
 * sections temporelles de la Lentille (`useMinute`), qui, elles, basculent au
 * changement de jour.
 */
export function useStoryRail(viewer: {
  readonly id: string | null;
  readonly displayName: string;
  readonly avatar?: string | null;
}): StoryRailData {
  const stories = useQuery(storyTrayQuery(apiDeps));
  const statuses = useQuery(statusesQuery(apiDeps));
  const loading = (stories.data === undefined && !stories.isError) || (statuses.data === undefined && !statuses.isError);
  const groups = stories.data ?? EMPTY_STORY_GROUPS;
  const moods = statuses.data ?? EMPTY_MOODS;
  const viewerId = viewer.id ?? '';
  const viewerAvatar = viewer.avatar ?? undefined;

  return useMemo(() => {
    const now = new Date();
    const myGroup = groups.find((g) => g.id === viewerId);
    const myStory = myGroup === undefined || isGroupFullyExpired(myGroup, now) ? undefined : myGroup;
    const myMood = moods[viewerId];
    /**
     * L'ENTRÉE « MOI » N'EXISTE QUE QUAND ELLE DIT QUELQUE CHOSE (revue
     * #5652). iOS la rend dès qu'un compte est connecté — parce que c'est un
     * BOUTON à deux portes (« Gérer mes stories », « Ajouter une story ») :
     * la pastille y est un CONTRÔLE, et un contrôle a sa place même vide. Sur
     * web-v2 aucune de ces portes n'existe encore (§ `stories-rail.tsx`,
     * règle #5765) : une pastille « moi » sans story ne porterait NI
     * information NI geste — juste mon propre avatar sous un anneau sourd, et
     * une bande volée à l'écran de démarrage (MESURÉ : `check-gateway-build
     * .mjs` bloc 4, décalage de l'état vide 163 px contre 139 px peuplé —
     * l'état « Aucune conversation pour l'instant » repoussé d'autant, alors
     * que l'invariant du dépôt veut qu'il RÉCUPÈRE cette bande).
     *
     * Elle apparaît donc dès que l'une des deux conditions est vraie : une
     * story active, ou une humeur publiée — les deux étant des INFORMATIONS.
     * Et elle redeviendra inconditionnelle, comme iOS, le jour où le
     * composeur de story lui rendra son geste. La LOI (`rail-policy.ts`)
     * reste le miroir exact d'iOS : c'est l'ADAPTATEUR qui déclare ce que la
     * v3.1 a à montrer, jamais la loi qui se réécrit.
     */
    const selfEntry: RailSelfEntry | undefined =
      viewer.id === null || (myStory === undefined && myMood === undefined)
        ? undefined
        : {
            displayName: viewer.displayName,
            accentColor: colorForName(viewer.displayName),
            hasActiveStory: myStory !== undefined,
            ...(viewerAvatar === undefined ? {} : { avatarUrl: viewerAvatar }),
            ...(myStory !== undefined && latestStoryOf(myStory)?.previewUrl !== undefined
              ? { previewUrl: latestStoryOf(myStory)!.previewUrl }
              : {}),
            ...(myMood === undefined ? {} : { moodEmoji: myMood }),
          };

    const entries: readonly RailEntry[] =
      viewerId === ''
        ? []
        : railStoryGroups(groups, viewerId, now).map((group) => {
            const latest = latestStoryOf(group);
            const mood = moods[group.id];
            return {
              id: group.id,
              displayName: group.displayName,
              ...(group.avatarUrl === undefined ? {} : { avatarUrl: group.avatarUrl }),
              ...(latest?.previewUrl === undefined ? {} : { previewUrl: latest.previewUrl }),
              ...(mood === undefined ? {} : { moodEmoji: mood }),
              hasUnviewed: hasUnviewedStories(group),
              accentColor: colorForName(group.displayName),
              isLive: false,
            };
          });

    return { selfEntry, entries, loading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, moods, viewerId, viewer.displayName, viewerAvatar, loading]);
}

/**
 * `rowAction` — RÉFÉRENCE DE MODULE STABLE (jamais recréée), ce que
 * `LensRow` (`memo`) exige (`conversations.tsx:31-40`). Liée aux instances
 * PARTAGÉES du magasin optimiste et du client de requêtes.
 */
export function rowAction(conversationId: string, action: RowActionId): void {
  void performRowAction({
    conversationId,
    action,
    deps: { ...apiDeps, store: conversationStore, queryClient: appQueryClient },
  });
}

/**
 * `sendAction`/`retrySendAction` (#5813, étape 6) — RÉFÉRENCES DE MODULE
 * STABLES, motif `rowAction` ci-dessus : liées aux instances PARTAGÉES
 * (`appQueryClient`, `outboxStore`) et à `apiDeps` (la SEULE résolution de
 * `apiConfig.source`, `:20`). `online` est REÇU — ce module n'appelle pas
 * `useOnline()` (un hook), c'est `use-send.ts` qui le fournit.
 */
export function sendAction(params: {
  readonly conversationId: string;
  readonly draft: Draft;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly online: boolean;
}): Promise<void> {
  const { conversationId, draft, viewerId, sender, online } = params;
  return performSend({
    conversationId,
    draft,
    viewerId,
    ...(sender === undefined ? {} : { sender }),
    deps: { ...apiDeps, queryClient: appQueryClient, outbox: outboxStore, online },
  });
}

export function retrySendAction(params: {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly online: boolean;
}): Promise<void> {
  const { conversationId, clientMessageId, online } = params;
  return retrySend({
    conversationId,
    clientMessageId,
    deps: { ...apiDeps, queryClient: appQueryClient, outbox: outboxStore, online },
  });
}

/**
 * `reactAction` (#5814) — RÉFÉRENCE DE MODULE STABLE, motif `rowAction` :
 * liée à l'instance PARTAGÉE `appQueryClient`. Le SITE UNIQUE que le menu du
 * message (`message-menu.tsx`) et son hôte (`routes/thread.tsx`) appellent —
 * jamais une seconde écriture du plan optimiste.
 */
export function reactAction(conversationId: string, messageId: string, emoji: string): Promise<PerformReactionResult> {
  return performReaction({ conversationId, messageId, emoji, deps: { ...apiDeps, queryClient: appQueryClient } });
}
