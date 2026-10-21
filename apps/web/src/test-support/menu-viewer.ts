import type { ActionScope, MenuViewer } from '@/lib/view/message-action-scope';

/**
 * LE LECTEUR DES TÉMOINS DU MENU (#11210) — un membre inscrit ordinaire,
 * `u-viewer`, qui peut écrire. Chaque témoin ne nomme que ce qui le distingue
 * (`hasAccount: false`, `platformRole: 'MODERATOR'`…).
 */
export const menuViewer = (overrides: Partial<MenuViewer> = {}): MenuViewer => ({
  id: 'u-viewer',
  participantId: null,
  hasAccount: true,
  isAnonymous: false,
  platformRole: 'USER',
  conversationRole: 'member',
  canSendMessages: true,
  isActiveMember: true,
  ...overrides,
});

/** Le lecteur et sa conversation — un groupe ouvert, en clair, par défaut. */
export const menuScope = (
  viewer: Partial<MenuViewer> = {},
  conversation: Partial<ActionScope['conversation']> = {},
): ActionScope => ({ viewer: menuViewer(viewer), conversation: { type: 'group', encryptionMode: null, isActive: true, ...conversation } });
