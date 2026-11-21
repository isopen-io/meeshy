import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { InactivityAlertState, InactivityAnnouncement } from '@meeshy/shared/types/inactivity-check';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { loadInactivitySnapshot } from '@/lib/api/inactivity';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { loadInactivityCatalog } from '@/lib/i18n-inactivity-catalog';
import { bindInactivityLive } from '@/lib/inactivity/inactivity-live';
import { announceInactivityOnPill } from '@/lib/inactivity/inactivity-pill';
import { inactivityAnnouncementText } from '@/lib/inactivity/inactivity-view';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

/**
 * **L'ALERTE D'INACTIVITÉ DE MES SANGS, REÇUE SUR CET ONGLET** (#18738, TEL-02) — même forme que l'hôte du téléphone
 * injoignable (`phone-reachability-host.tsx`) : il s'accroche à la socket vivante (et à chacune des suivantes) pour
 * `inactivity:alert` et `inactivity:cleared`, rattrape à chaque accroche, et confie chaque annonce servie à la
 * pastille, nommée par la liste des conversations déjà en cache. Il ne peint rien : l'en-tête, la fiche et le profil
 * lisent le cache.
 */

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

const snapshotOf = (): Promise<ApiResult<readonly InactivityAlertState[]>> => loadInactivitySnapshot(apiDeps);

export function announceInactivity({
  client,
  store,
  language,
  userId,
  announcement,
  now,
}: {
  readonly client: QueryClient;
  readonly store: PillAnnouncementStoreApi;
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly announcement: InactivityAnnouncement;
  readonly now: number;
}): Promise<void> {
  return loadInactivityCatalog(language).then(
    () => {
      const person = knownPersonByIdInConversations(client, userId);
      const name = person === null ? null : (person.displayName ?? person.username);
      announceInactivityOnPill({ store, userId, text: inactivityAnnouncementText(language, { name, announcement }), kind: announcement.kind, now });
    },
    () => undefined,
  );
}

export function InactivityHost({
  client = appQueryClient,
  store = pillAnnouncementStore,
  watch = watchRealtime,
  snapshot = snapshotOf,
  language = currentInterfaceLanguage,
}: {
  readonly client?: QueryClient;
  readonly store?: PillAnnouncementStoreApi;
  readonly watch?: WatchRealtime;
  readonly snapshot?: () => Promise<ApiResult<readonly InactivityAlertState[]>>;
  readonly language?: () => InterfaceLanguage;
}) {
  useEffect(
    () =>
      watch((socket) =>
        bindInactivityLive({
          socket,
          client,
          viewerId: viewerIdOf,
          snapshot,
          announce: (userId, announcement) => void announceInactivity({ client, store, language: language(), userId, announcement, now: Date.now() }),
        }),
      ),
    [watch, client, store, snapshot, language],
  );
  return null;
}
