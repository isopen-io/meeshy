import { useQueries, useQuery } from '@tanstack/react-query';
import type { RelationRequestLevel } from '@meeshy/shared/types/relation';
import { RELATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/relation-event-names';
import { useEffect, useMemo, useState } from 'react';

import { apiDeps } from '@/lib/api/deps';
import type { FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';
import { FRIENDS_QUERY_PREFIX } from '@/lib/api/friends-keys';
import { publicProfileQueryOptions, type PublicProfileView } from '@/lib/api/public-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions, type RelationLink } from '@/lib/api/relations';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { circleSections, listedLinks, pendingRaiseOf, raiseRequests } from '@/lib/relations/circles';
import { coldStateOf } from '@/lib/view/cold-state';
import { Glyph } from '@/components/glyph';
import {
  CircleLinkRow,
  CircleLinkSheet,
  CircleRequestRow,
  CircleSectionHeader,
  CirclesErrorBanner,
  type CircleRequestHandlers,
} from '@/routes/discover-circles-parts';
import { DiscoverEmpty, DiscoverError, DiscoverOfflineNotice, DiscoverSkeleton } from '@/routes/discover-parts';

/**
 * **« MES CERCLES »** (#13938) — l'onglet « Cercles » de Découvrir, miroir de
 * `CirclesTab` + `CirclesViewModel` (`apps/ios/Meeshy/Features/Contacts/`,
 * branche `lot/ui-cercles-ios-13938`) : mes liens par niveau, ce qui manque pour
 * monter, mes demandes de montée.
 *
 * - **Cache d'abord** : `GET /relations` est persisté (`query-client.ts`) et se
 *   peint au premier rendu ; le squelette n'existe que sur cache vide. Un échec
 *   ou un hors-ligne sur cache non vide se dit au-dessus, la liste reste.
 * - **Une source par fait** : les demandes de montée sont une PROJECTION des
 *   paniers que l'onglet « Demandes » lit déjà ; le cran en attente se lit dans
 *   le panier des envoyées, où le geste optimiste l'écrit au tap
 *   (`performSendRequest`).
 * - **Les noms** : `GET /relations` n'en sert aucun (RG-07). Le panier des
 *   contacts et des demandes les porte déjà ; une Connaissance née seule se
 *   nomme par sa fiche publique (`/directory/people/:id`), au plus quarante à
 *   la fois — iso `CirclePeopleDirectory`.
 * - **Le temps réel** : `relation:level-raised` relit la famille `['friends']`
 *   tant que l'onglet est monté (`watchLiveSocket`) ; les quatre événements de
 *   demande la relisent déjà depuis `socket.ts`.
 */

const PROFILE_FETCH_CAP = 40;

const personOfProfile = (view: PublicProfileView | undefined): PersonSummary | null =>
  view === undefined ? null : { id: view.profile.id, username: view.profile.username, displayName: view.profile.displayName, avatar: view.profile.avatar };

/** Qui sait nommer chaque personne d'un lien : les paniers d'abord (aucune requête), puis la fiche publique. */
function useCirclePeople(params: { readonly ids: readonly string[]; readonly rows: readonly FriendRequestRecord[]; readonly enabled: boolean }): ReadonlyMap<string, PersonSummary> {
  const { ids, rows, enabled } = params;
  const known = useMemo(
    () => new Map(rows.flatMap((row) => [row.sender, row.receiver]).flatMap((person) => (person === null ? [] : [[person.id, person] as const]))),
    [rows],
  );
  const missing = useMemo(() => ids.filter((id) => !known.has(id)).slice(0, PROFILE_FETCH_CAP), [ids, known]);
  const profiles = useQueries({ queries: missing.map((id) => ({ ...publicProfileQueryOptions({ ...apiDeps, handle: id }), enabled })) }, appQueryClient);
  return useMemo(() => {
    const fetched = profiles.flatMap((query) => {
      const person = personOfProfile(query.data);
      return person === null ? [] : [[person.id, person] as const];
    });
    return new Map([...known, ...fetched]);
  }, [known, profiles]);
}

/** `relation:level-raised` — le lien a monté (ma demande acceptée, ou le rituel scellé) : la famille se relit. */
function useLevelRaisedLive(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    let stop: (() => void) | null = null;
    const invalidate = (): void => void appQueryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_PREFIX });
    void import('@/lib/api/realtime').then(
      ({ watchLiveSocket }) => {
        if (!live) return;
        stop = watchLiveSocket((socket) => {
          socket.on(RELATION_SERVER_EVENTS.RELATION_LEVEL_RAISED, invalidate);
          return () => socket.off(RELATION_SERVER_EVENTS.RELATION_LEVEL_RAISED, invalidate);
        });
      },
      () => undefined,
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [enabled]);
}

export type CirclesPanelProps = {
  readonly language: InterfaceLanguage;
  readonly enabled: boolean;
  readonly online: boolean;
  readonly now: Date;
  readonly received: readonly FriendRequestRecord[];
  readonly sent: readonly FriendRequestRecord[];
  readonly accepted: readonly FriendRequestRecord[];
  readonly requestHandlers: CircleRequestHandlers;
  readonly onRaise: (person: PersonSummary, target: RelationRequestLevel) => void;
  readonly onFindContacts: () => void;
};

export function CirclesPanel(props: CirclesPanelProps) {
  const { language, enabled, online, now, received, sent, accepted, requestHandlers, onRaise, onFindContacts } = props;
  const catalogReady = useCirclesCatalog(language);
  const query = useQuery({ ...relationLinksQueryOptions(apiDeps), enabled }, appQueryClient);
  useLevelRaisedLive(enabled);
  const links = useMemo(() => listedLinks(query.data ?? []), [query.data]);
  const rows = useMemo(() => [...accepted, ...received, ...sent], [accepted, received, sent]);
  const people = useCirclePeople({ ids: useMemo(() => links.map((link) => link.userId), [links]), rows, enabled });
  const nameOf = (userId: string): string | null => {
    const person = people.get(userId);
    return person === undefined ? null : (person.displayName ?? person.username);
  };
  const sections = circleSections(links, nameOf);
  const raises = raiseRequests({ links, received, sent });
  const [opened, setOpened] = useState<RelationLink | null>(null);
  const personOf = (userId: string): PersonSummary | null => people.get(userId) ?? null;
  const raise = (link: RelationLink, target: RelationRequestLevel): void =>
    onRaise(personOf(link.userId) ?? { id: link.userId, username: '', displayName: null, avatar: null }, target);

  if (!catalogReady) return <DiscoverSkeleton />;
  if (query.data === undefined) {
    const cold = coldStateOf(query);
    if (cold === 'error') return <DiscoverError language={language} online={online} onRetry={() => void query.refetch()} />;
    if (cold === 'offline') return <DiscoverOfflineNotice language={language} cold />;
    return <DiscoverSkeleton />;
  }
  if (links.length === 0) {
    return (
      <section data-circles-empty className="flex flex-1 flex-col">
        <DiscoverEmpty
          data="circles"
          glyph={<Glyph name="users" size={44} />}
          title={translateCircles(language, 'circles.empty.title')}
          subtitle={translateCircles(language, 'circles.empty.subtitle')}
        />
        <div className="flex justify-center pb-10">
          <button
            type="button"
            data-circles-find
            onClick={onFindContacts}
            className="grid place-items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, backgroundColor: 'var(--ios-indigo-600)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translateCircles(language, 'circles.empty.action')}
          </button>
        </div>
      </section>
    );
  }

  const hasRaises = raises.incoming.length > 0 || raises.outgoing.length > 0;
  return (
    <section data-circles className="flex flex-col pb-8">
      {query.isError ? <CirclesErrorBanner language={language} onRetry={() => void query.refetch()} /> : online ? null : <DiscoverOfflineNotice language={language} cold={false} />}
      {hasRaises ? (
        <>
          <h2 className="px-5 pt-4 pb-1.5 text-body font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {translateCircles(language, 'circles.section.requests')}
          </h2>
          <ul data-circle-requests className="flex flex-col">
            {raises.incoming.map((request) => (
              <CircleRequestRow key={request.id} language={language} request={request} direction="incoming" person={request.sender ?? personOf(request.senderId)} handlers={requestHandlers} />
            ))}
            {raises.outgoing.map((request) => (
              <CircleRequestRow key={request.id} language={language} request={request} direction="outgoing" person={request.receiver ?? personOf(request.receiverId)} handlers={requestHandlers} />
            ))}
          </ul>
        </>
      ) : null}
      {sections.map((section) => (
        <div key={section.level}>
          <CircleSectionHeader language={language} level={section.level} count={section.links.length} />
          <ul data-circle-list={section.level} className="flex flex-col">
            {section.links.map((link) => (
              <CircleLinkRow
                key={link.userId}
                language={language}
                link={link}
                person={personOf(link.userId)}
                pendingLevel={pendingRaiseOf(sent, link.userId)}
                now={now}
                onOpen={setOpened}
                onRaise={raise}
              />
            ))}
          </ul>
        </div>
      ))}
      {opened === null ? null : <CircleLinkSheet language={language} link={opened} person={personOf(opened.userId)} now={now} onClose={() => setOpened(null)} />}
    </section>
  );
}
