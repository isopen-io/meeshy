import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { FallState } from '@meeshy/shared/types/fall-detection';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { loadFallSnapshot } from '@/lib/api/fall';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { bindFallLive, type FallPillKind } from '@/lib/fall/fall-live';
import { announceFallOnPill } from '@/lib/fall/fall-pill';
import { fallAnnouncementText } from '@/lib/fall/fall-view';
import { loadFallCatalog } from '@/lib/i18n-fall-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

/**
 * **LA CHUTE DÉTECTÉE DE MES SANGS, REÇUE SUR CET ONGLET** (#18748, SAN-01) — même forme que l'hôte de l'alerte
 * d'inactivité (`inactivity-host.tsx`) : il s'accroche à la socket vivante (et à chacune des suivantes) pour
 * `fall:detected` et `fall:cleared`, rattrape à chaque accroche, et confie chaque annonce à la pastille, nommée par la
 * liste des conversations déjà en cache. Il ne peint rien : l'en-tête, la fiche et le profil lisent le cache.
 */

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

const snapshotOf = (): Promise<ApiResult<readonly FallState[]>> => loadFallSnapshot(apiDeps);

export function announceFall({
  client,
  store,
  language,
  userId,
  kind,
  now,
}: {
  readonly client: QueryClient;
  readonly store: PillAnnouncementStoreApi;
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly kind: FallPillKind;
  readonly now: number;
}): Promise<void> {
  return loadFallCatalog(language).then(
    () => {
      const person = knownPersonByIdInConversations(client, userId);
      const name = person === null ? null : (person.displayName ?? person.username);
      announceFallOnPill({ store, userId, text: fallAnnouncementText(language, { name, kind }), kind, now });
    },
    () => undefined,
  );
}

export function FallHost({
  client = appQueryClient,
  store = pillAnnouncementStore,
  watch = watchRealtime,
  snapshot = snapshotOf,
  language = currentInterfaceLanguage,
}: {
  readonly client?: QueryClient;
  readonly store?: PillAnnouncementStoreApi;
  readonly watch?: WatchRealtime;
  readonly snapshot?: () => Promise<ApiResult<readonly FallState[]>>;
  readonly language?: () => InterfaceLanguage;
}) {
  useEffect(
    () =>
      watch((socket) =>
        bindFallLive({
          socket,
          client,
          viewerId: viewerIdOf,
          snapshot,
          announce: (userId, kind) => void announceFall({ client, store, language: language(), userId, kind, now: Date.now() }),
        }),
      ),
    [watch, client, store, snapshot, language],
  );
  return null;
}
