import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { addConversationMembers } from '@/lib/api/conversation-member-actions';
import type { ConversationMember } from '@/lib/api/conversation-members';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { searchUsers } from '@/lib/api/users-search';
import { candidatesFor, friendsOf } from '@/lib/conversation-new/candidates';
import { manageText, type ConversationManageCatalogKey } from '@/lib/i18n-conversation-manage-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { initialsOf } from '@/lib/view/conversation';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';

import { PeerAvatar } from './peer-avatar';
import { Glyph } from './glyph';
import { Sheet } from './sheet';

/**
 * **AJOUTER DES MEMBRES À UN GROUPE** (#10613) — le pendant d'`AddParticipantSheet`
 * (iOS) : les AMIS d'abord, avant toute frappe (le cache persisté les sert sans
 * attendre), puis la recherche de personnes dès deux lettres — la même loi que
 * « Nouvelle conversation » (`conversation-new/candidates.ts`). On choisit
 * plusieurs personnes et UN appel les porte toutes (`userIds`) ; chacune paraît
 * aussitôt dans la liste des membres, et celles que la passerelle refuse en
 * repartent.
 */
const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
const ROW_MIN_HEIGHT = 56;

export function AddMembersSheet({
  conversationId,
  members,
  viewerId,
  accent,
  deps,
  language,
  onClose,
  onDone,
}: {
  readonly conversationId: string;
  readonly members: readonly ConversationMember[];
  readonly viewerId: string;
  readonly accent: string;
  readonly deps: ConversationsDeps;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onDone: (status: string) => void;
}) {
  const t = (key: ConversationManageCatalogKey, params?: Readonly<Record<string, string>>) => manageText(language, key, params);
  const queryClient = useQueryClient();
  const online = useOnline();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [chosen, setChosen] = useState<ReadonlyMap<string, PersonSummary>>(new Map());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const accepted = useInfiniteQuery(friendRequestsQueryOptions(deps, 'accepted'));
  useExhaustPages(accepted, true);
  const friends = useMemo(() => friendsOf({ accepted: flattenFriendRequests(accepted.data), viewerId }), [accepted.data, viewerId]);

  const trimmed = debounced.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;
  const results = useQuery({
    queryKey: ['users', 'search', trimmed],
    queryFn: async () => {
      const result = await searchUsers(deps, trimmed);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: searching,
  });

  const view = candidatesFor({ friends, query, searchResults: searching ? results.data : undefined, viewerId });
  const memberIds = useMemo(() => new Set(members.flatMap((member) => (member.userId === null ? [] : [member.userId]))), [members]);

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
    const outcome = await addConversationMembers({ deps: { ...deps, queryClient }, conversationId, people: [...chosen.values()] });
    setBusy(false);
    if (!outcome.ok) {
      onDone(t(outcome.reason === 'refused' ? 'conversationManage.error.refused' : 'conversationManage.error.failed'));
      onClose();
      return;
    }
    const count = outcome.added.length;
    const added = count === 1 ? t('conversationManage.add.done.one') : t('conversationManage.add.done.other', { count: String(count) });
    onDone(outcome.refused.length > 0 ? `${added} ${t('conversationManage.add.partial')}` : added);
    onClose();
  };

  const submitLabel =
    chosen.size === 0
      ? t('conversationManage.add.submit.none')
      : chosen.size === 1
        ? t('conversationManage.add.submit.one')
        : t('conversationManage.add.submit.other', { count: String(chosen.size) });

  const row = (person: PersonSummary) => {
    const already = memberIds.has(person.id);
    const selected = chosen.has(person.id);
    const name = person.displayName ?? person.username;
    return (
      <li key={person.id}>
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          disabled={already}
          onClick={() => toggle(person)}
          data-add-member-candidate={person.id}
          className="flex w-full items-center gap-3 px-4 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-60"
          style={{ minHeight: ROW_MIN_HEIGHT, outlineColor: 'var(--accent)' }}
        >
          <PeerAvatar presenceKey={person.id} ringRef={person.ring} initials={initialsOf(name)} color={accent} size={40} {...(person.avatar === null ? {} : { src: person.avatar })} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
              {name}
            </span>
            <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {already ? t('conversationManage.add.member') : `@${person.username}`}
            </span>
          </span>
          <span
            aria-hidden
            className="grid shrink-0 place-items-center rounded-chip"
            style={{
              width: 26,
              height: 26,
              color: 'var(--color-ios-on-brand)',
              backgroundColor: selected || already ? 'var(--accent)' : 'transparent',
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
      title={t('conversationManage.add.title')}
      searchLabel={t('conversationManage.add.search')}
      searchPlaceholder={t('conversationManage.add.search')}
      search={query}
      onSearchChange={setQuery}
      dialogData={{ 'data-add-members': conversationId }}
      onClose={onClose}
      accessory={
        <button
          type="button"
          disabled={chosen.size === 0 || busy || !online}
          aria-busy={busy}
          onClick={() => void submit()}
          data-add-members-submit
          className="rounded-chip px-3 text-body font-bold disabled:opacity-50"
          style={{ minHeight: 44, color: 'var(--color-ios-on-brand)', backgroundColor: 'var(--accent)' }}
        >
          {submitLabel}
        </button>
      }
    >
      {online ? null : (
        <li role="status" className="px-4 py-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-add-members-offline>
          {t('conversationManage.add.offline')}
        </li>
      )}
      {view.friends.length > 0 ? heading(t('conversationManage.add.friends')) : null}
      {view.friends.map(row)}
      {view.others.length > 0 ? heading(t('conversationManage.add.others')) : null}
      {view.others.map(row)}
      {searching && results.isFetching && view.others.length === 0 ? (
        <li role="status" className="px-4 py-4 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {t('conversationManage.add.searching')}
        </li>
      ) : nobody ? (
        <li className="px-4 py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }} data-add-members-empty>
          {t('conversationManage.add.empty')}
        </li>
      ) : null}
    </Sheet>
  );
}
