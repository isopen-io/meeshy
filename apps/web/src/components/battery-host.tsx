import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { BatteryAnnouncement, BatteryReaderState } from '@meeshy/shared/types/battery';

import { loadBatterySnapshot } from '@/lib/api/battery';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { batteryStateOf, bindBatteryLive } from '@/lib/battery/battery-live';
import { announceBatteryOnPill } from '@/lib/battery/battery-pill';
import { batteryAnnouncementText } from '@/lib/battery/battery-view';
import { loadBatteryCatalog } from '@/lib/i18n-battery-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

/**
 * **LA BATTERIE DE MES PROCHES ET DE MES SANGS, REÇUE SUR CET ONGLET** (#14147) — l'hôte s'accroche à la socket
 * vivante (et à chacune des suivantes), rattrape à chaque accroche, et confie chaque annonce servie à la pastille
 * de synchronisation, nommée par la liste des conversations déjà en cache. Il ne peint rien : les avatars, l'en-tête
 * et les fiches lisent le cache (`use-battery.ts`).
 *
 * Le web REÇOIT, il n'émet pas : `battery:pull-requested` ne vise que le téléphone de l'émetteur, et cet onglet
 * n'écoute pas l'événement.
 */

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

const snapshotOf = (): Promise<ApiResult<readonly BatteryReaderState[]>> => loadBatterySnapshot(apiDeps);

export function announceBattery({
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
  readonly announcement: BatteryAnnouncement;
  readonly now: number;
}): Promise<void> {
  return loadBatteryCatalog(language).then(
    () => {
      const person = knownPersonByIdInConversations(client, userId);
      const name = person === null ? null : (person.displayName ?? person.username);
      const charging = batteryStateOf(client, userId, now)?.charging ?? (announcement.kind === 'charging' || announcement.kind === 'recharged');
      announceBatteryOnPill({
        store,
        userId,
        text: batteryAnnouncementText(language, { name, announcement }),
        kind: announcement.kind,
        level: announcement.level,
        charging,
        now,
      });
    },
    () => undefined,
  );
}

export function BatteryHost({
  client = appQueryClient,
  store = pillAnnouncementStore,
  watch = watchRealtime,
  snapshot = snapshotOf,
  language = currentInterfaceLanguage,
}: {
  readonly client?: QueryClient;
  readonly store?: PillAnnouncementStoreApi;
  readonly watch?: WatchRealtime;
  readonly snapshot?: () => Promise<ApiResult<readonly BatteryReaderState[]>>;
  readonly language?: () => InterfaceLanguage;
}) {
  useEffect(
    () =>
      watch((socket) =>
        bindBatteryLive({
          socket,
          client,
          viewerId: viewerIdOf,
          snapshot,
          announce: (userId, announcement) => void announceBattery({ client, store, language: language(), userId, announcement, now: Date.now() }),
        }),
      ),
    [watch, client, store, snapshot, language],
  );
  return null;
}
