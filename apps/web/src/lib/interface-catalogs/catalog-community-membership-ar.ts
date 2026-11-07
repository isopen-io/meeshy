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
  'community.members.open': 'الأعضاء',
  'community.members.title': 'الأعضاء',
  'community.members.section.admin': 'المسؤولون',
  'community.members.section.moderator': 'المشرفون',
  'community.members.section.member': 'الأعضاء',
  'community.members.role.admin': 'مسؤول',
  'community.members.role.moderator': 'مشرف',
  'community.members.role.member': 'عضو',
  'community.members.make.admin': 'تعيين مسؤولًا',
  'community.members.make.moderator': 'تعيين مشرفًا',
  'community.members.make.member': 'إعادته عضوًا',
  'community.members.remove': 'إزالة من المجتمع',
  'community.members.remove.confirm.title': 'إزالة {name}؟',
  'community.members.remove.confirm.body': 'لن يتمكن {name} بعد الآن من الوصول إلى محادثات هذا المجتمع.',
  'community.members.remove.confirm.action': 'إزالة',
  'community.members.manage': 'إدارة {name}',
  'community.members.you': 'أنت',
  'community.members.empty': 'لا يوجد أعضاء بعد.',
  'community.members.loading': 'جارٍ تحميل الأعضاء…',
  'community.members.error': 'تعذّر تحميل الأعضاء.',
  'community.members.retry': 'إعادة المحاولة',
  'community.members.refused': 'يمكن للمسؤول فقط إدارة الأعضاء.',
} as const satisfies CommunityMembershipCatalog;

export default arCommunityMembership;
