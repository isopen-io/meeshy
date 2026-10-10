import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminCommunityFiche } from '@/lib/api/admin-communities-detail';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { excerptOf } from './interpret/labels';
import { formatCount } from './interpret/numbers';

/**
 * **LA FICHE D'UNE COMMUNAUTÉ, EN CARTES** (spec 2026-10-04 § 3, lot « Échanges et
 * contenus ») — l'onglet « Aperçu » (description, équipe, conversations) et
 * l'onglet « Membres » deviennent quatre cartes résumées ; chacune ouvre sa
 * section d'hier dans une modale (`?open=<id>`). Un lien d'hier `?tab=members`
 * ouvre la modale des membres.
 *
 * Les valeurs viennent de la fiche déjà lue ; la liste des membres ne se lit qu'à
 * l'ouverture de sa modale.
 */
export const ADMIN_COMMUNITY_SECTIONS = ['description', 'staff', 'conversations', 'members'] as const;

export type AdminCommunitySection = (typeof ADMIN_COMMUNITY_SECTIONS)[number];

export const ADMIN_COMMUNITY_SECTION_TITLES = {
  description: 'admin.community.section.description',
  staff: 'admin.community.section.staff',
  conversations: 'admin.community.section.conversations',
  members: 'admin.community.tab.members',
} as const satisfies Readonly<Record<AdminCommunitySection, AdminPlainCatalogKey>>;

export const ADMIN_COMMUNITY_SECTION_GLYPHS = {
  description: 'scroll',
  staff: 'shieldCheck',
  conversations: 'chats',
  members: 'usersThree',
} as const satisfies Readonly<Record<AdminCommunitySection, AdminGlyphName>>;

const DESCRIPTION_EXCERPT = 140;

export function communitySummaryOf(
  section: AdminCommunitySection,
  facts: {
    readonly fiche: AdminCommunityFiche;
    /** Le rang d'administration : l'inventaire des conversations lui est réservé. */
    readonly seesConversations: boolean;
  },
  language: AdminLanguage,
): { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null } {
  const { fiche, seesConversations } = facts;
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });

  switch (section) {
    case 'description':
      return { values: [], sentence: excerptOf(fiche.description, DESCRIPTION_EXCERPT) ?? t('admin.community.description.empty') };
    case 'staff':
      return {
        values: [v('admin.community.card.staffCount', formatCount(fiche.staff.length, language))],
        sentence: fiche.staff.length === 0 ? t('admin.community.staff.empty') : null,
      };
    case 'conversations':
      return {
        values: [v('admin.community.stat.conversations', formatCount(fiche.conversationCount, language))],
        sentence: seesConversations ? null : t('admin.community.card.conversationsRestricted'),
      };
    case 'members':
      return {
        values: [v('admin.community.stat.members', formatCount(fiche.activeMemberCount, language)), v('admin.community.stat.left', formatCount(fiche.leftMemberCount, language))],
        sentence: null,
      };
  }
}
