/**
 * **LES SIGNALEMENTS TELS QUE LA PASSERELLE LES SERT** — l'usine commune des
 * témoins du lot « modération » (décodeurs, liste, fiche, gestes). Un module de
 * TÉMOINS : aucun code de production ne l'importe.
 *
 * La forme est celle du schéma de réponse FERMÉ (`reports-schemas.ts` côté
 * passerelle) : la ligne, les deux personnes nommées, l'entité signalée résolue.
 * Chaque témoin part de cette ligne nominale et ne surcharge que ce qu'il
 * mesure — jamais une seconde définition de la forme.
 */
export const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');

export const servedPerson = (seed: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(seed),
  username: `membre${seed}`,
  displayName: `Membre ${seed}`,
  avatar: null,
  ...overrides,
});

export const servedMessageEntity = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: 'message',
  id: OBJECT_ID(2),
  label: null,
  owner: servedPerson(4),
  excerpt: 'Tu vas voir',
  isProtected: false,
  deleted: false,
  conversation: { id: OBJECT_ID(5), title: 'Famille' },
  ...overrides,
});

export const servedReport = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  reportedType: 'message',
  reportedEntityId: OBJECT_ID(2),
  reporterId: OBJECT_ID(3),
  reporterName: null,
  reportType: 'harassment',
  reason: 'Il me menace depuis hier',
  status: 'pending',
  moderatorId: null,
  moderatorNotes: null,
  actionTaken: null,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
  resolvedAt: null,
  reporter: servedPerson(3),
  moderator: null,
  reportedEntity: servedMessageEntity(),
  ...overrides,
});

export const servedStats = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  totalReports: 50,
  pendingReports: 12,
  underReviewReports: 3,
  resolvedReports: 20,
  rejectedReports: 5,
  dismissedReports: 10,
  reportsByType: { harassment: 20, spam: 7, other: 1 },
  reportsByReportedType: { message: 30, user: 15, post: 5 },
  averageResolutionTimeHours: 36.5,
  ...overrides,
});
