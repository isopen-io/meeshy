/**
 * L'IDENTITÉ D'UNE PERSONNE ET D'UNE CONVERSATION — tranche du catalogue `catalog-en.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. Les libellés des liens d'avatar (#7241) et le menu d'appui long
 * d'un avatar (#7828), miroir `avatar.menu.*` d'iOS
 * (`MeeshyAvatar.swift:331-354`), et la feuille de détails d'une
 * conversation (#7829, miroir `ConversationInfoSheet.swift`).
 */
const enIdentity = {
  'a11y.avatar.profile': 'View {name}’s profile',
  'a11y.avatar.story': 'View {name}’s story',
  'avatar.menu.label': 'Actions for {name}',
  'avatar.menu.view_profile': 'View profile',
  'avatar.menu.view_story': 'View story',
  'avatar.menu.conversation_details': 'Conversation details',
  'conversation.details.title': 'Conversation details',
  'conversation.details.open': 'View details of {name}',
  'conversation.details.type.direct': 'Private chat',
  'conversation.details.type.group': 'Group',
  'conversation.details.type.public': 'Public conversation',
  'conversation.details.type.global': 'Global conversation',
  'conversation.details.type.broadcast': 'Broadcast',
  'conversation.details.members.one': '{count} member',
  'conversation.details.members.other': '{count} members',
  'conversation.details.members.section': 'Members',
  'conversation.details.members.loading': 'Loading members',
  'conversation.details.members.error': 'Couldn’t load the members.',
  'conversation.details.members.retry': 'Try again',
  'conversation.details.members.empty': 'No members to show.',
  'conversation.details.members.more': 'Show more members',
  'conversation.details.members.you': 'You',
  'conversation.details.role.creator': 'Creator',
  'conversation.details.role.admin': 'Admin',
  'conversation.details.role.moderator': 'Moderator',
  'conversation.details.share': 'Share a link',
  'conversation.details.share.busy': 'Creating the link…',
  'conversation.details.share.copied': 'Link copied — just paste it.',
  'conversation.details.share.failed': 'Couldn’t create the link — try again in a moment.',
  'conversation.details.share.unavailable': 'Sharing isn’t available here — copy the link: {url}',
};

export default enIdentity;
