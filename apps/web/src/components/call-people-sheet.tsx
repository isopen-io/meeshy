import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { flattenFriendRequests, friendRequestsQueryOptions } from '@/lib/api/friend-requests';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { callActions } from '@/lib/calls/call-actions';
import type { DecodedPerson } from '@/lib/calls/call-decode';
import { invitableFriends, personOf } from '@/lib/calls/call-people';
import type { CallMember } from '@/lib/calls/call-store';
import { friendsOf } from '@/lib/conversation-new/candidates';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES PARTICIPANTS D'UN APPEL, ET QUI Y AJOUTER** (#8433, #8438) — ouvert par
 * « Ajouter » du rail de l'appel. En haut, « Dans l'appel » : moi, puis chaque
 * participant — une personne invitée y apparaît AUSSITÔT, « Sonne… » —, et,
 * pour qui modère, le menu de chacun (remis par l'écran : `renderModeration`).
 * En dessous, « Ajouter des personnes » : mes contacts acceptés qui ne sont pas
 * déjà là, depuis le cache persisté des amitiés (aucune attente quand un écran
 * les a déjà chargées), avec une recherche. « Inviter » part aussitôt ; un
 * refus défait la sonnerie et le dit (`engine-controls.ts`).
 *
 * Chunk à part (`budgets.json` › `call_people_sheet`), chargé au premier
 * « Ajouter » : il n'importe RIEN de `call_overlay`.
 */

type SheetProps = {
  readonly id: string;
  readonly closeGlyph: ReactNode;
  readonly language: InterfaceLanguage;
  readonly members: readonly CallMember[];
  readonly onClose: () => void;
  readonly renderModeration: (member: CallMember) => ReactNode;
  readonly invite?: (person: DecodedPerson) => void;
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('');

function Face({ name, avatar, ringing = false }: { readonly name: string; readonly avatar: string | null; readonly ringing?: boolean }) {
  return (
    <span aria-hidden className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full text-mini font-semibold ${ringing ? 'animate-pulse motion-reduce:animate-none' : ''}`} style={{ background: 'rgb(255 255 255 / 0.16)' }}>
      {avatar === null ? initials(name) : <img src={avatar} alt="" className="size-full object-cover" />}
    </span>
  );
}

const ROW = 'flex min-h-14 items-center gap-3 px-2';

function useInvitable(query: string, members: readonly CallMember[]) {
  const session = useStore(sessionStore, (state) => state.session);
  const enabled = apiDeps.source === 'fixtures' || session.status === 'authenticated';
  const viewerId = resolveViewer({ source: apiDeps.source, session }).id ?? null;
  const accepted = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'accepted'), enabled }, appQueryClient);
  useExhaustPages(accepted, enabled);
  const friends = useMemo(() => friendsOf({ accepted: flattenFriendRequests(accepted.data), viewerId }), [accepted.data, viewerId]);
  const inCall = members.map((member) => member.userId);
  return { loading: accepted.data === undefined && accepted.isPending, all: friends.filter((f) => !inCall.includes(f.id)), shown: invitableFriends({ friends, inCall, query }) };
}

export function CallPeopleSheet({ id, closeGlyph, language, members, onClose, renderModeration, invite = callActions.invite }: SheetProps) {
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `${id}-title`;
  const { loading, all, shown } = useInvitable(query, members);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  const empty = loading ? t(language, 'callControls.people.loading') : all.length === 0 ? t(language, 'callControls.people.empty') : t(language, 'callControls.people.none');

  return (
    <div ref={panel} id={id} role="dialog" aria-labelledby={titleId} onKeyDown={onKeyDown} className="glass-call-prominent mx-auto flex max-h-[min(60vh,32rem)] w-[min(calc(100%-2rem),24rem)] flex-col gap-2 rounded-[28px] p-3 text-white" data-call-people-sheet="">
      <div className="flex items-center justify-between gap-2 pl-2">
        <h2 id={titleId} className="text-body font-semibold">
          {t(language, 'callControls.people.title')}
        </h2>
        <button type="button" aria-label={t(language, 'callControls.close')} title={t(language, 'callControls.close')} onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none">
          {closeGlyph}
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain">
        <section aria-labelledby={`${id}-in`} className="flex flex-col">
          <h3 id={`${id}-in`} className="px-2 text-mini font-semibold" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {t(language, 'callControls.people.inCall')}
          </h3>
          <ul className="flex flex-col" data-call-people-in="">
            <li className={ROW}>
              <Face name={t(language, 'callControls.people.you')} avatar={null} />
              <span className="text-body font-semibold">{t(language, 'callControls.people.you')}</span>
            </li>
            {members.map((member) => {
              const ringing = member.link === 'ringing';
              return (
                <li key={member.userId} className={ROW} data-call-person={member.userId} {...(ringing ? { 'data-call-person-ringing': '' } : {})}>
                  <Face name={member.name} avatar={member.avatar} ringing={ringing} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold">{member.name}</span>
                    {ringing ? <span className="text-mini" style={{ color: 'rgba(255,255,255,0.72)' }}>{t(language, 'callControls.ringing')}</span> : null}
                  </span>
                  {renderModeration(member)}
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-labelledby={`${id}-add`} className="flex flex-col gap-1">
          <h3 id={`${id}-add`} className="px-2 text-mini font-semibold" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {t(language, 'callControls.people.add')}
          </h3>
          <input
            type="search"
            value={query}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            onChange={() => undefined}
            aria-label={t(language, 'callControls.people.search')}
            placeholder={t(language, 'callControls.people.search')}
            className="mx-1 min-h-11 rounded-full border-0 px-4 text-body text-white placeholder:text-white/60 focus-visible:outline-2 focus-visible:outline-white"
            style={{ background: 'rgb(255 255 255 / 0.12)' }}
            data-call-people-search=""
          />
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-mini" role="status" style={{ color: 'rgba(255,255,255,0.72)' }} data-call-people-empty="">
              {empty}
            </p>
          ) : (
            <ul className="flex flex-col" data-call-people-add="">
              {shown.map((friend) => {
                const person = personOf(friend);
                return (
                  <li key={friend.id} className={ROW} data-call-invitable={friend.id}>
                    <Face name={person.name} avatar={person.avatar} />
                    <span className="min-w-0 flex-1 truncate text-body font-semibold">{person.name}</span>
                    <button
                      type="button"
                      aria-label={t(language, 'callControls.people.inviteNamed', { name: person.name })}
                      onClick={() => {
                        invite(person);
                        panel.current?.querySelector<HTMLElement>('[data-call-people-search]')?.focus();
                      }}
                      className="min-h-11 shrink-0 rounded-full px-4 text-mini font-semibold transition-transform active:scale-95 motion-reduce:transition-none"
                      style={{ background: 'white', color: 'var(--ios-indigo-950)' }}
                      data-call-invite={friend.id}
                    >
                      {t(language, 'callControls.people.invite')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
