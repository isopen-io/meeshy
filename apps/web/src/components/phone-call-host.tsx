import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { PhoneCallAnnouncement, PhoneCallState } from '@meeshy/shared/types/phone-call';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { loadPhoneCallSnapshot } from '@/lib/api/phone-call';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { loadPhoneCallCatalog } from '@/lib/i18n-phone-call-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { bindPhoneCallLive } from '@/lib/phone-call/phone-call-live';
import { announcePhoneCallOnPill } from '@/lib/phone-call/phone-call-pill';
import { phoneCallAnnouncementText } from '@/lib/phone-call/phone-call-view';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

/**
 * **« EN APPEL » DE MES SANGS, REÇU SUR CET ONGLET** (#18753, ACT-01) — même forme que l'hôte de l'alerte d'inactivité
 * (`inactivity-host.tsx`) : il s'accroche à la socket vivante (et à chacune des suivantes) pour `phone-call:started`
 * et `phone-call:ended`, rattrape à chaque accroche, et confie chaque annonce servie à la pastille, nommée par la
 * liste des conversations déjà en cache. Il ne peint rien : l'en-tête, la fiche et le profil lisent le cache.
 *
 * Le web ne RAPPORTE rien : un navigateur ne voit pas les appels. Aucune notification : la feature n'en a pas.
 */

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

const snapshotOf = (): Promise<ApiResult<readonly PhoneCallState[]>> => loadPhoneCallSnapshot(apiDeps);

export function announcePhoneCall({
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
  readonly announcement: PhoneCallAnnouncement;
  readonly now: number;
}): Promise<void> {
  return loadPhoneCallCatalog(language).then(
    () => {
      const person = knownPersonByIdInConversations(client, userId);
      const name = person === null ? null : (person.displayName ?? person.username);
      announcePhoneCallOnPill({ store, userId, text: phoneCallAnnouncementText(language, { name, announcement }), kind: announcement.kind, now });
    },
    () => undefined,
  );
}

export function PhoneCallHost({
  client = appQueryClient,
  store = pillAnnouncementStore,
  watch = watchRealtime,
  snapshot = snapshotOf,
  language = currentInterfaceLanguage,
}: {
  readonly client?: QueryClient;
  readonly store?: PillAnnouncementStoreApi;
  readonly watch?: WatchRealtime;
  readonly snapshot?: () => Promise<ApiResult<readonly PhoneCallState[]>>;
  readonly language?: () => InterfaceLanguage;
}) {
  useEffect(
    () =>
      watch((socket) =>
        bindPhoneCallLive({
          socket,
          client,
          viewerId: viewerIdOf,
          snapshot,
          announce: (userId, announcement) => void announcePhoneCall({ client, store, language: language(), userId, announcement, now: Date.now() }),
        }),
      ),
    [watch, client, store, snapshot, language],
  );
  return null;
}
