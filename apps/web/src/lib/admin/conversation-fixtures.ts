/**
 * **LES CHARGES SERVIES QUE LES TÉMOINS DES CONVERSATIONS REJOUENT** (#8876) —
 * la forme EXACTE de ce que `GET /admin/conversations`, `…/:id` et
 * `…/:id/participants` rendent, en fabriques : aucun témoin ne redéfinit une
 * charge à la main, donc aucun ne peut en dériver en silence.
 *
 * Les identifiants sont des ObjectId valides (24 hexadécimaux) : c'est ce que la
 * passerelle sert, et c'est ce que `expectNoRawIdentifiers` sait reconnaître.
 */
export const OBJECT_ID = (n: number): string => n.toString(16).padStart(24, '0');

const NAMES = ['Awa Diop', 'Jean Kamga', 'Léa Moreau', 'Omar Sy', 'Fatou Ba', 'Samuel Eto'] as const;

export const servedParticipant = (n: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(100 + n),
  userId: OBJECT_ID(n),
  type: 'user',
  displayName: NAMES[(n - 1) % NAMES.length],
  avatar: null,
  role: 'member',
  joinedAt: '2026-08-01T10:00:00.000Z',
  isActive: true,
  ...overrides,
});

export const servedConversationRow = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  identifier: 'mshy_atelier',
  title: 'Atelier du jeudi',
  type: 'group',
  avatar: null,
  isActive: true,
  closedAt: null,
  communityId: null,
  community: null,
  memberCount: 4,
  createdAt: '2026-08-01T10:00:00.000Z',
  lastMessageAt: '2026-09-30T11:00:00.000Z',
  participants: [servedParticipant(1), servedParticipant(2)],
  ...overrides,
});

export const servedSettings = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  defaultWriteRole: 'member',
  isAnnouncementChannel: false,
  slowModeSeconds: 0,
  autoTranslateEnabled: true,
  encryptionMode: 'server',
  ...overrides,
});

export const servedFiche = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  identifier: 'mshy_atelier',
  title: 'Atelier du jeudi',
  description: 'Le groupe du jeudi soir',
  type: 'group',
  avatar: null,
  banner: null,
  isActive: true,
  closedAt: null,
  communityId: OBJECT_ID(40),
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z',
  lastMessageAt: '2026-09-30T11:00:00.000Z',
  memberCount: 4,
  messageCount: 1204,
  settings: servedSettings(),
  community: { id: OBJECT_ID(40), name: 'Lycée Njanda', identifier: 'lycee-njanda' },
  closedBy: null,
  participantsPreview: [servedParticipant(1, { role: 'creator' }), servedParticipant(2)],
  shareLinkCount: 2,
  agentEnabled: false,
  ...overrides,
});

export const servedMember = (n: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(100 + n),
  userId: OBJECT_ID(n),
  type: 'user',
  displayName: NAMES[(n - 1) % NAMES.length],
  avatar: null,
  role: 'member',
  isActive: true,
  isOnline: false,
  joinedAt: '2026-08-01T10:00:00.000Z',
  nickname: null,
  user: { id: OBJECT_ID(n), username: `membre${n}`, displayName: NAMES[(n - 1) % NAMES.length], avatar: null },
  ...overrides,
});
