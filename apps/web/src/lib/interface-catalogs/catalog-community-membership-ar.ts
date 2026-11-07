import type { CommunityMembershipCatalog } from '../i18n-community-membership-catalog';

/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche arabe du
 * catalogue, chargée avec le détail
 * d'une communauté (`i18n-community-membership-catalog.ts`). Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const arCommunityMembership = {
  'community.membership.join': 'انضمام',
  'community.membership.leave': 'مغادرة المجتمع',
  'community.membership.leave.confirm.title': 'مغادرة المجتمع؟',
  'community.membership.leave.confirm.body': 'لن تتمكن بعد الآن من الوصول إلى محادثات هذا المجتمع.',
  'community.membership.leave.confirm.action': 'مغادرة',
  'community.membership.offline': 'غير متصل.',
  'community.membership.error': 'تعذّر ذلك. حاول مرة أخرى.',
  'community.membership.error.refused': 'هذا المجتمع خاص: لا يُنضمّ إليه إلا بدعوة.',
} as const satisfies CommunityMembershipCatalog;

export default arCommunityMembership;
