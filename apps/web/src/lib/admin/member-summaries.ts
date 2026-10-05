import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { AdminUserStats } from '@/lib/api/admin-user-member';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { accountStateOf, interpretRole } from './interpret/enums';
import { personSecondary } from './interpret/labels';
import { formatCount, formatPercent } from './interpret/numbers';
import { adminDate } from './interpret/time';

/**
 * **LA FICHE D'UN MEMBRE, EN CARTES** (spec 2026-10-04 § 3) — la barre d'onglets et
 * ses neuf panneaux deviennent une grille de cartes résumées ; chaque carte ouvre
 * la section d'hier dans une modale (`?open=<id>`).
 *
 * L'onglet « Profil » se scinde en quatre cartes (identité, contact, mot de passe et
 * protections, rôle et statut) : quatre sections éditables empilées ne se lisaient
 * pas d'un regard. Les huit autres gardent leur identifiant d'onglet — un lien
 * d'hier (`?tab=security`, que la fiche d'un signalement tire encore) ouvre la
 * modale du même nom (`useAdminOpen(…, { legacyTab: true })`).
 *
 * Les valeurs viennent de lectures LÉGÈRES déjà faites par la fiche : le membre, ses
 * quinze chiffres, ses bannissements. Aucune carte ne lance de requête ; le détail
 * ne se lit qu'à l'ouverture.
 */
export const ADMIN_MEMBER_SECTIONS = [
  'profile',
  'contact',
  'access',
  'role',
  'conversations',
  'media',
  'contacts',
  'communities',
  'voice',
  'preferences',
  'security',
  'reports',
] as const;

export type AdminMemberSection = (typeof ADMIN_MEMBER_SECTIONS)[number];

export const ADMIN_MEMBER_SECTION_TITLES = {
  profile: 'admin.people.card.identity',
  contact: 'admin.people.card.contact',
  access: 'admin.people.card.access',
  role: 'admin.people.card.role',
  conversations: 'admin.tab.conversations',
  media: 'admin.tab.media',
  contacts: 'admin.tab.contacts',
  communities: 'admin.tab.communities',
  voice: 'admin.tab.voice',
  preferences: 'admin.tab.preferences',
  security: 'admin.tab.security',
  reports: 'admin.tab.reports',
} as const satisfies Readonly<Record<AdminMemberSection, AdminPlainCatalogKey>>;

export const ADMIN_MEMBER_SECTION_GLYPHS = {
  profile: 'user',
  contact: 'phoneCall',
  access: 'lock',
  role: 'shieldCheck',
  conversations: 'chats',
  media: 'image',
  contacts: 'handshake',
  communities: 'usersThree',
  voice: 'microphone',
  preferences: 'gear',
  security: 'clock',
  reports: 'flag',
} as const satisfies Readonly<Record<AdminMemberSection, AdminGlyphName>>;

/** Les cartes dont les chiffres viennent de `GET …/stats` : elles suivent son état (squelette, erreur). */
export const ADMIN_MEMBER_STAT_SECTIONS: ReadonlySet<AdminMemberSection> = new Set(['conversations', 'media', 'contacts', 'communities', 'security', 'reports']);

export type AdminMemberSummary = { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null };

export function memberSummaryOf(
  section: AdminMemberSection,
  facts: { readonly membre: AdminUserDetail; readonly stats: AdminUserStats | null; readonly activeBans: number | null },
  language: AdminLanguage,
  now: Date,
): AdminMemberSummary {
  const { membre, stats, activeBans } = facts;
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });
  const count = (value: number | null | undefined) => (value === null ? t('admin.people.stats.withheld') : formatCount(value, language));
  const stat = (key: keyof AdminUserStats) => count(stats === null ? undefined : stats[key]);
  const proof = (present: boolean, verifiedAt: string | null) =>
    !present ? t('admin.value.notProvided') : verifiedAt === null ? t('admin.contact.unverified') : t('admin.contact.verified');

  switch (section) {
    case 'profile':
      return {
        values: [
          v('admin.people.card.handle', personSecondary(membre.username) ?? t('admin.value.notProvided')),
          ...(membre.profileCompletionRate === null ? [] : [v('admin.meta.completion', formatPercent(membre.profileCompletionRate, 'hundred', language))]),
        ],
        sentence: t('admin.people.card.photos'),
      };
    case 'contact':
      return {
        values: [v('admin.people.card.email', proof(membre.email !== '', membre.emailVerifiedAt)), v('admin.people.card.phone', proof(membre.phoneNumber !== '', membre.phoneVerifiedAt))],
        sentence: null,
      };
    case 'access': {
      const locked = membre.lockedUntil !== null && new Date(membre.lockedUntil).getTime() > now.getTime();
      return {
        values: [
          v('admin.people.card.twoFactor', t(membre.twoFactorEnabled ? 'admin.people.twoFactor.on' : 'admin.people.twoFactor.off')),
          v('admin.people.card.lock', locked ? t('admin.people.card.locked') : t('admin.people.meta.lockNone')),
        ],
        sentence:
          membre.lastPasswordChange === null
            ? t('admin.people.password.neverChanged')
            : translateAdmin(language, 'admin.people.password.changedOn', { date: adminDate(membre.lastPasswordChange, language) }),
      };
    }
    case 'role': {
      const state = accountStateOf({ ...membre, activeBan: (activeBans ?? 0) > 0 }, now, language);
      return {
        values: [
          v('admin.col.role', interpretRole(membre.role, language).label),
          v('admin.col.status', state.label),
          ...(activeBans === null ? [] : [v('admin.people.card.activeBans', formatCount(activeBans, language))]),
        ],
        sentence: null,
      };
    }
    case 'conversations':
      return { values: [v('admin.stats.conversations', stat('conversations')), v('admin.stats.messagesSent', stat('messagesSent'))], sentence: null };
    case 'media':
      return { values: [v('admin.stats.mediaUploaded', stat('mediaUploaded')), v('admin.stats.posts', stat('posts'))], sentence: null };
    case 'contacts':
      return {
        values: [v('admin.stats.friends', stat('friends')), v('admin.stats.pendingIn', stat('pendingFriendRequestsIn')), v('admin.stats.pendingOut', stat('pendingFriendRequestsOut'))],
        sentence: null,
      };
    case 'communities':
      return { values: [v('admin.stats.communities', stat('communities'))], sentence: null };
    case 'voice': {
      const consent = membre.adminMetadata?.voiceProfileConsentAt;
      return {
        values:
          consent === undefined
            ? []
            : [
                v(
                  'admin.voice.consentProfile',
                  consent === null ? t('admin.people.consent.notGiven') : translateAdmin(language, 'admin.people.consent.givenOn', { date: adminDate(consent, language) }),
                ),
              ],
        sentence: t('admin.voice.traced'),
      };
    }
    case 'preferences':
      return { values: [], sentence: t('admin.people.card.preferences') };
    case 'security':
      return { values: [v('admin.stats.activeSessions', stat('activeSessions')), v('admin.meta.failedLogins', formatCount(membre.failedLoginAttempts, language))], sentence: null };
    case 'reports':
      return { values: [v('admin.stats.reportsReceived', stat('reportsReceived')), v('admin.stats.reportsFiled', stat('reportsFiled'))], sentence: null };
  }
}
