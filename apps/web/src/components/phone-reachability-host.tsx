import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { PhoneReachabilityAnnouncement, PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { loadPhoneReachabilitySnapshot } from '@/lib/api/phone-reachability';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { loadPhoneReachabilityCatalog } from '@/lib/i18n-phone-reachability-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { handPhoneReachabilityAnnouncer } from '@/lib/notifications/in-app-banner';
import { bindPhoneReachabilityLive } from '@/lib/phone-reachability/phone-reachability-live';
import { announcePhoneReachabilityNotification, announcePhoneReachabilityOnPill } from '@/lib/phone-reachability/phone-reachability-pill';
import { phoneReachabilityAnnouncementText } from '@/lib/phone-reachability/phone-reachability-view';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

/**
 * **LE TÉLÉPHONE INJOIGNABLE DE MES PROCHES ET DE MES SANGS, REÇU SUR CET ONGLET** (#18737, TEL-01) — même forme que
 * l'hôte de la batterie (`battery-host.tsx`) : il s'accroche à la socket vivante (et à chacune des suivantes),
 * rattrape à chaque accroche, et confie chaque annonce servie à la pastille, nommée par la liste des conversations
 * déjà en cache. Il ne peint rien : les avatars, l'en-tête, la fiche et le profil lisent le cache.
 *
 * Le web ne répond à aucune sonde : `device_probe` ne vise que le téléphone suivi.
 */

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

const snapshotOf = (): Promise<ApiResult<readonly PhoneReachabilityState[]>> => loadPhoneReachabilitySnapshot(apiDeps);

export function announcePhoneReachability({
  client,
  store,
  language,
  userId,
  announcement,
  state,
  now,
}: {
  readonly client: QueryClient;
  readonly store: PillAnnouncementStoreApi;
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly announcement: PhoneReachabilityAnnouncement;
  readonly state: PhoneReachabilityState | null;
  readonly now: number;
}): Promise<void> {
  return loadPhoneReachabilityCatalog(language).then(
    () => {
      const person = knownPersonByIdInConversations(client, userId);
      const name = person === null ? null : (person.displayName ?? person.username);
      announcePhoneReachabilityOnPill({
        store,
        userId,
        text: phoneReachabilityAnnouncementText(language, { name, announcement, since: state?.unreachableSince ?? null, now }),
        kind: announcement.kind,
        now,
      });
    },
    () => undefined,
  );
}

export function PhoneReachabilityHost({
  client = appQueryClient,
  store = pillAnnouncementStore,
  watch = watchRealtime,
  snapshot = snapshotOf,
  language = currentInterfaceLanguage,
}: {
  readonly client?: QueryClient;
  readonly store?: PillAnnouncementStoreApi;
  readonly watch?: WatchRealtime;
  readonly snapshot?: () => Promise<ApiResult<readonly PhoneReachabilityState[]>>;
  readonly language?: () => InterfaceLanguage;
}) {
  useEffect(
    () =>
      watch((socket) =>
        bindPhoneReachabilityLive({
          socket,
          client,
          viewerId: viewerIdOf,
          snapshot,
          announce: (userId, announcement, state) =>
            void announcePhoneReachability({ client, store, language: language(), userId, announcement, state, now: Date.now() }),
        }),
      ),
    [watch, client, store, snapshot, language],
  );
  useEffect(() => handPhoneReachabilityAnnouncer((notification) => void announcePhoneReachabilityNotification(notification, { store })), [store]);
  return null;
}
