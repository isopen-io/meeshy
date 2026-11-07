import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand/react';

import { Glyph } from '@/components/glyph';
import { PeerAvatar } from '@/components/peer-avatar';
import { Sheet } from '@/components/sheet';
import type { CommunitySummary } from '@/lib/api/communities';
import type { CommunityActionDeps } from '@/lib/api/community-actions';
import { performInviteMembers } from '@/lib/api/community-invite';
import { communityMembersQueryKey, type CommunityMemberPage } from '@/lib/api/community-members';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { sessionStore } from '@/lib/api/session';
import { searchUsers } from '@/lib/api/users-search';
import { resolveViewer } from '@/lib/api/viewer';
import { candidatesFor, friendsOf } from '@/lib/conversation-new/candidates';
import { communityAccent } from '@/lib/communities/view';
import { translateMembership } from '@/lib/i18n-community-membership-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { initialsOf } from '@/lib/view/conversation';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';

/**
 * **INVITER DANS UNE COMMUNAUTÉ** (#6376) — miroir `CommunityInviteScreen`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Community/`), dans la forme de la
 * feuille « Ajouter des membres » du web (`AddMembersSheet`) : les AMIS
 * d'abord, servis par le cache persisté avant toute frappe, puis la recherche
 * de personnes dès deux lettres. On choisit plusieurs personnes ; chacune
 * paraît aussitôt dans les membres (`performInviteMembers`), et celle que la
 * passerelle refuse en repart.
 *
 * Une personne déjà membre — connue du cache de la liste des membres — est
 * dite « Déjà membre » et ne se choisit pas. La présence est celle du magasin
 * de présence, qui ne tient que ce que la passerelle a servi : rien d’inventé.
 */

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
const ROW_MIN_HEIGHT = 56;

type MembersData = InfiniteData<CommunityMemberPage, number>;

export default function CommunityInviteSheet({
  community,
  deps,
  language,
  onClose,
  onDone,
}: {
  readonly community: CommunitySummary;
  readonly deps: CommunityActionDeps;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onDone: (status: string) => void;
}) {
  const t = translateMembership;
  const online = useOnline();
  const session = useStore(sessionStore, (state) => state.session);
  const viewerId = resolveViewer({ source: deps.source, session }).id ?? null;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [chosen, setChosen] = useState<ReadonlyMap<string, PersonSummary>>(new Map());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const accepted = useInfiniteQuery(friendRequestsQueryOptions(deps, 'accepted'), deps.queryClient);
  useExhaustPages(accepted, true);
  const friends = useMemo(() => friendsOf({ accepted: flattenFriendRequests(accepted.data), viewerId }), [accepted.data, viewerId]);

  const trimmed = debounced.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;
  const results = useQuery(
    {
      queryKey: ['users', 'search', trimmed],
      queryFn: async () => {
        const result = await searchUsers(deps, trimmed);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      enabled: searching,
    },
    deps.queryClient,
  );

  const view = candidatesFor({ friends, query, searchResults: searching ? results.data : undefined, viewerId });
  const members = deps.queryClient.getQueryData<MembersData>(communityMembersQueryKey(community.id));
  const memberIds = useMemo(() => new Set(members?.pages.flatMap((page) => page.members.map((member) => member.userId)) ?? []), [members]);

  const toggle = (person: PersonSummary) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(person.id)) next.delete(person.id);
      else next.set(person.id, person);
      return next;
    });

  const submit = async () => {
    if (chosen.size === 0 || busy) return;
    setBusy(true);
    const outcome = await performInviteMembers({ community, people: [...chosen.values()], deps });
    setBusy(false);
    onClose();
    if (outcome.status === 'offline') {
      onDone(t(language, 'community.invite.offline'));
      return;
    }
    if (outcome.invited === 0) {
      onDone(t(language, outcome.failed > 0 ? 'community.invite.failed' : 'community.invite.refused'));
      return;
    }
    const added =
      outcome.invited === 1 ? t(language, 'community.invite.done.one') : t(language, 'community.invite.done.other', { count: String(outcome.invited) });
    onDone(outcome.refused + outcome.failed > 0 ? `${added} ${t(language, 'community.invite.partial')}` : added);
  };

  const submitLabel =
    chosen.size === 0
      ? t(language, 'community.invite.submit.none')
      : chosen.size === 1
        ? t(language, 'community.invite.submit.one')
        : t(language, 'community.invite.submit.other', { count: String(chosen.size) });

  const row = (person: PersonSummary) => {
    const already = memberIds.has(person.id);
    const selected = chosen.has(person.id);
    const name = person.displayName ?? person.username;
    return (
      <li key={person.id}>
        <button
          type="button"
          role="checkbox"
          aria-checked={selected || already}
          disabled={already}
          onClick={() => toggle(person)}
          data-community-invite-candidate={person.id}
          className="flex w-full items-center gap-3 px-4 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-60"
          style={{ minHeight: ROW_MIN_HEIGHT, outlineColor: 'var(--accent)' }}
        >
          <PeerAvatar presenceKey={person.id} ringRef={person.ring ?? null} initials={initialsOf(name)} color={communityAccent(name)} size={40} {...(person.avatar === null ? {} : { src: person.avatar })} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
              {name}
            </span>
            <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {already ? t(language, 'community.invite.member') : `@${person.username}`}
            </span>
          </span>
          <span
            aria-hidden
            className="grid shrink-0 place-items-center rounded-chip"
            style={{
              width: 26,
              height: 26,
              color: 'var(--color-ios-on-brand)',
              backgroundColor: selected || already ? 'var(--color-ios-brand)' : 'transparent',
              border: selected || already ? 0 : '1.5px solid var(--color-ios-ink-3)',
            }}
          >
            {selected || already ? <Glyph name="check" size={16} /> : null}
          </span>
        </button>
      </li>
    );
  };

  const heading = (label: string) => (
    <li className="px-4 pt-3 pb-1 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }} aria-hidden>
      {label}
    </li>
  );

  const nobody = view.friends.length === 0 && view.others.length === 0;

  return (
    <Sheet
      title={t(language, 'community.invite.title')}
      searchLabel={t(language, 'community.invite.search')}
      searchPlaceholder={t(language, 'community.invite.search')}
      search={query}
      onSearchChange={setQuery}
      dialogData={{ 'data-community-invite': community.id }}
      onClose={onClose}
      accessory={
        <button
          type="button"
          disabled={chosen.size === 0 || busy || !online}
          aria-busy={busy}
          onClick={() => void submit()}
          data-community-invite-submit
          className="rounded-chip px-3 text-body font-bold disabled:opacity-50"
          style={{ minHeight: 44, color: 'var(--color-ios-on-brand)', backgroundColor: 'var(--color-ios-brand)' }}
        >
          {submitLabel}
        </button>
      }
    >
      {online ? null : (
        <li role="status" className="px-4 py-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-community-invite-offline>
          {t(language, 'community.invite.offline')}
        </li>
      )}
      {view.friends.length > 0 ? heading(t(language, 'community.invite.friends')) : null}
      {view.friends.map(row)}
      {view.others.length > 0 ? heading(t(language, 'community.invite.others')) : null}
      {view.others.map(row)}
      {searching && results.isFetching && view.others.length === 0 ? (
        <li role="status" className="px-4 py-4 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {t(language, 'community.invite.searching')}
        </li>
      ) : nobody ? (
        <li className="px-4 py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }} data-community-invite-empty>
          {t(language, 'community.invite.empty')}
        </li>
      ) : null}
    </Sheet>
  );
}
