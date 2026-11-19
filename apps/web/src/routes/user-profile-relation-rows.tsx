import { Suspense, lazy } from 'react';

import type { PersonSummary } from '@/lib/api/friend-requests';
import type { ProfileRelation } from '@/lib/profile/relation';
import type { RelationActionId, RelationActionItem } from '@/lib/profile/relation-face';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { translate } from '@/lib/i18n-catalog';
import { announcementToneOf } from '@/lib/view/announcement-tone';

/* Chaque rangée garde son propre chunk, chargé à la demande (#13940, #13936, #16641, #17055, #18345, #14147, #18737, #18738). */
const ProfileCircleRow = lazy(() => import('@/routes/user-profile-circle').then((m) => ({ default: m.ProfileCircleRow })));
const ProfileBringRow = lazy(() => import('@/routes/user-profile-bring').then((m) => ({ default: m.ProfileBringRow })));
const ProfileTalkieRow = lazy(() => import('@/routes/user-profile-talkie').then((m) => ({ default: m.ProfileTalkieRow })));
const ProfileTogetherRow = lazy(() => import('@/routes/user-profile-together').then((m) => ({ default: m.ProfileTogetherRow })));
const ProfileShareLocationRow = lazy(() => import('@/routes/user-profile-share-location').then((m) => ({ default: m.ProfileShareLocationRow })));
const ProfileBatteryRow = lazy(() => import('@/components/battery-panel').then((m) => ({ default: m.ProfileBatteryRow })));
const ProfilePhoneReachabilityRow = lazy(() => import('@/components/phone-reachability-panel').then((m) => ({ default: m.ProfilePhoneReachabilityRow })));
/* L'inactivité (#18738) se garde elle-même : rien sous Sang, sauf une alerte que le serveur m'a servie. */
const ProfileInactivityRow = lazy(() => import('@/components/inactivity-panel').then((m) => ({ default: m.ProfileInactivityRow })));

export type RelationRowPerson = PersonSummary;

/**
 * **QUELLE RANGÉE EXISTANTE EST OFFERTE** (#18879) — avec le verdict servi (`items`), c'est lui qui
 * décide, FAIL-CLOSED : une action absente ou verrouillée n'est pas rendue (sa rangée verrouillée
 * dit pourquoi). Sans verdict (passerelle plus ancienne), l'ancien critère — l'amitié — reste seul juge :
 * un ancien serveur sert la fiche d'avant.
 */
export const rowOffered = (items: readonly RelationActionItem[] | null, id: RelationActionId, legacy: boolean): boolean =>
  items === null ? legacy : items.some((item) => item.id === id && item.state === 'open');

export function ProfileRelationRows({
  language,
  person,
  relation,
  viewerId,
  items,
  announce,
}: {
  readonly language: InterfaceLanguage;
  readonly person: RelationRowPerson;
  readonly relation: ProfileRelation;
  readonly viewerId: string | null;
  readonly items: readonly RelationActionItem[] | null;
  readonly announce: (message: string, tone: 'neutral' | 'error') => void;
}) {
  const friend = relation.kind === 'friend';
  const summary = { id: person.id, username: person.username, displayName: person.displayName, avatar: person.avatar };
  const named = { id: person.id, username: person.username, displayName: person.displayName };
  const offered = (id: RelationActionId): boolean => rowOffered(items, id, friend);
  const notice = (message: string, failed: boolean) => announce(message, failed ? 'error' : 'neutral');
  return (
    <Suspense fallback={null}>
      <ProfileCircleRow
        language={language}
        person={summary}
        raisable={friend}
        viewerId={viewerId}
        now={new Date()}
        onNotice={(message) => announce(message, 'error')}
        onOutcome={(outcome) =>
          announce(
            translate(language, outcome === 'done' ? 'discover.announce.sent' : outcome === 'offline' ? 'discover.announce.offline' : 'discover.announce.sendFailed'),
            announcementToneOf(outcome),
          )
        }
      />
      {offered('talkie') ? <ProfileTalkieRow language={language} person={summary} onNotice={notice} /> : null}
      {offered('together') ? <ProfileTogetherRow language={language} person={summary} onNotice={notice} /> : null}
      <ProfileInactivityRow language={language} person={named} />
      {offered('unreachable') ? <ProfilePhoneReachabilityRow language={language} viewerId={viewerId} person={named} /> : null}
      {offered('battery') ? <ProfileBatteryRow language={language} viewerId={viewerId} person={named} /> : null}
      <ProfileShareLocationRow language={language} person={summary} offered={offered('location')} onNotice={(message) => announce(message, 'error')} />
      {items !== null && !offered('bring') ? null : (
        <ProfileBringRow language={language} person={summary} friend={offered('bring')} onNotice={(message) => announce(message, 'error')} />
      )}
    </Suspense>
  );
}
