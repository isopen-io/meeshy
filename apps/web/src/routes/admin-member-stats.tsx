import { useQuery } from '@tanstack/react-query';

import { AdminStatStrip, type AdminStatStripItem } from '@/components/admin/fiche';
import { AdminInlineNotice } from '@/components/admin/states';
import { formatCount } from '@/lib/admin/interpret/numbers';
import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_STAT_KEYS, adminUserStatsQueryOptions, type AdminStatKey } from '@/lib/api/admin-user-member';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES QUINZE CHIFFRES D'UN MEMBRE** (#7845, #8005) — le bandeau de la fiche :
 * messages envoyés, conversations, publications, stories, reels, commentaires,
 * réactions données, médias, amis, demandes reçues et envoyées, signalements faits
 * et reçus, sessions actives, communautés.
 *
 * `reportsFiled` vaut `null` pour qui n'a pas `canModerateContent` : ce n'est pas
 * zéro, c'est un chiffre que la passerelle ne sert pas — il se dit « Non
 * communiqué », il ne se tait pas et ne se peint pas « 0 ».
 *
 * Une carte est un lien vers la liste filtrée quand cette liste existe : les
 * demandes envoyées mènent aux demandes de contact de ce membre (`senderId`).
 */
const LABELS = {
  messagesSent: 'admin.stats.messagesSent',
  conversations: 'admin.stats.conversations',
  posts: 'admin.stats.posts',
  reels: 'admin.stats.reels',
  stories: 'admin.stats.stories',
  comments: 'admin.stats.comments',
  reactionsGiven: 'admin.stats.reactionsGiven',
  mediaUploaded: 'admin.stats.mediaUploaded',
  friends: 'admin.stats.friends',
  pendingFriendRequestsIn: 'admin.stats.pendingIn',
  pendingFriendRequestsOut: 'admin.stats.pendingOut',
  reportsFiled: 'admin.stats.reportsFiled',
  reportsReceived: 'admin.stats.reportsReceived',
  activeSessions: 'admin.stats.activeSessions',
  communities: 'admin.stats.communities',
} as const satisfies Readonly<Record<AdminStatKey, string>>;

const SKELETON_CARDS = 8;

export function AdminMemberStats({
  userId,
  language,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
}) {
  const stats = useQuery(adminUserStatsQueryOptions(deps, userId));

  if (stats.data === undefined) {
    if (stats.isPending) {
      return (
        <div data-admin-stat-strip-skeleton aria-busy="true" aria-label={translateAdmin(language, 'admin.kit.loading')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <div key={index} aria-hidden="true" className="rounded-card" style={{ height: 72, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }} />
          ))}
        </div>
      );
    }
    return (
      <AdminInlineNotice
        tone="warning"
        text={translateAdmin(language, 'admin.users.unavailable')}
        action={
          <button
            type="button"
            data-admin-retry
            onClick={() => void stats.refetch()}
            className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translateAdmin(language, 'admin.kit.retry')}
          </button>
        }
      />
    );
  }

  const data = stats.data;
  const items: readonly AdminStatStripItem[] = ADMIN_STAT_KEYS.map((key) => {
    const value = data[key];
    return {
      id: key,
      label: translateAdmin(language, LABELS[key]),
      value: value === null ? translateAdmin(language, 'admin.people.stats.withheld') : formatCount(value, language),
      ...(key === 'pendingFriendRequestsOut'
        ? { target: { kind: 'section' as const, section: 'invitations' as const, search: { senderId: userId } } }
        : {}),
    };
  });

  return <AdminStatStrip items={items} />;
}
