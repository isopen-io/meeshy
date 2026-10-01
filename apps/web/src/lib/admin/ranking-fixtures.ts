/**
 * **LES LIGNES DU CLASSEMENT, TELLES QUE LA PASSERELLE LES SERT** (#8876) — les
 * formes exactes de `routes/admin/system-rankings.ts`, copiées clé par clé : un
 * témoin de décodeur part de la charge RÉELLE de l'émetteur, jamais d'un type.
 *
 * Partagées par les témoins du décodeur, de la vue et du panneau ; aucune n'est
 * lue par le produit.
 */
export const OBJECT_ID = (n: number): string => n.toString(16).padStart(24, '0');

type Served = Record<string, unknown>;

export const servedUserRank = (n: number, overrides: Served = {}): Served => ({
  id: OBJECT_ID(n),
  username: `membre${n}`,
  displayName: `Membre ${n}`,
  avatar: null,
  count: 100 - n,
  lastActivity: '2026-09-30T10:00:00.000Z',
  ...overrides,
});

export const servedConversationRank = (n: number, overrides: Served = {}): Served => ({
  id: OBJECT_ID(n),
  identifier: `mshy_conv${n}`,
  title: `Conversation ${n}`,
  type: 'group',
  image: null,
  count: 500 - n,
  ...overrides,
});

export const servedMessageRank = (n: number, overrides: Served = {}): Served => ({
  id: OBJECT_ID(n),
  messageType: 'text',
  createdAt: '2026-09-28T09:30:00.000Z',
  sender: { id: OBJECT_ID(n + 500), userId: OBJECT_ID(n + 100), displayName: `Auteur ${n}`, avatar: null, username: `auteur${n}` },
  conversation: { id: OBJECT_ID(n + 200), identifier: `mshy_talk${n}`, title: `Discussion ${n}`, type: 'group' },
  count: 40 - n,
  ...overrides,
});

export const servedTrackingRank = (n: number, overrides: Served = {}): Served => ({
  id: OBJECT_ID(n),
  token: `Ab3xYz${n}`,
  originalUrl: `https://exemple${n}.org/promo?secret=abc123`,
  totalClicks: 900 - n,
  uniqueClicks: 400 - n,
  createdAt: '2026-09-01T08:00:00.000Z',
  creator: { id: OBJECT_ID(n + 100), username: `createur${n}`, displayName: `Créateur ${n}`, avatar: null },
  count: 900 - n,
  ...overrides,
});

export const servedShareRank = (n: number, overrides: Served = {}): Served => ({
  id: OBJECT_ID(n),
  name: `Lien ${n}`,
  currentUses: 70 - n,
  maxUses: 100,
  createdAt: '2026-09-02T08:00:00.000Z',
  creator: { id: OBJECT_ID(n + 100), username: `hote${n}`, displayName: `Hôte ${n}`, avatar: null },
  conversation: { id: OBJECT_ID(n + 200), identifier: `mshy_join${n}`, title: `Salon ${n}`, type: 'group' },
  count: 70 - n,
  ...overrides,
});

export const servedRanking = (rankings: readonly unknown[], echo: Served = {}): Served => ({
  rankings,
  entityType: 'users',
  criterion: 'messages_sent',
  period: '30d',
  total: rankings.length,
  ...echo,
});
