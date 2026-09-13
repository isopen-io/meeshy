import type { InterfaceCatalog } from '@/lib/i18n-catalog';

const en = {
  'announce.messageSent': 'Message sent',
  'announce.messageCopied': 'Message copied',
  'announce.messagesCopied': 'Messages copied',
  'announce.messageProtected': 'Protected message',
  'announce.selectionCap': 'Maximum {count} messages',
  'announce.nothingToCopy': 'Nothing to copy',

  'message.author.self': 'You',
  'message.excerpt.protected': 'protected content',
  'a11y.message.menu.subject': 'Actions for the message from {author}: {excerpt}',

  'typing.named': '{name} is typing',
  'typing.double': '{first} and {second} are typing',
  'typing.several': 'Several people are typing',

  'root.menu.feed': 'Feed',
  'root.menu.links': 'My links',
  'root.menu.notifications': 'Notifications',
  'root.menu.calls': 'Calls',
  'root.menu.discover': 'Discover',
  'root.menu.communities': 'Communities',
  'root.menu.settings': 'Settings',
  'root.menu.profile': 'Profile',
  'a11y.floating.menu': 'Menu',
  'a11y.floating.menu.ladder': 'Meeshy navigation',

  'pending.back': 'Back to conversations',
  'pending.comingSoon': 'This screen is coming soon.',
  'pending.feed.promise': 'Posts from the people you follow.',
  'pending.links.promise': 'Links shared in your conversations will gather here.',
  'pending.notifications.promise': 'What is waiting for you — mentions, replies, invitations — will show up here.',
  'pending.calls.promise': 'Your call history, and a way to place a call.',
  'pending.discover.promise': 'People to meet, chosen by what you have in common.',
  'pending.communities.promise': 'The communities you belong to, and the ones that feel like you.',
  'pending.settings.promise': 'Your languages, your privacy, your notifications.',
  'pending.profile.promise': 'Your Meeshy identity — name, photo, languages, and what others see of it.',
} satisfies InterfaceCatalog;

export default en;
