/**
 * **LES DEMANDES DE CONTACT TELLES QUE LA PASSERELLE LES SERT** — l'usine commune
 * des témoins du lot « liens » pour les invitations (décodeurs, liste, fiche,
 * geste). Un module de TÉMOINS : aucun code de production ne l'importe.
 *
 * La ligne de LISTE porte le texte du message et deux personnes à quatre champs ;
 * la FICHE porte en plus le prénom, le nom et l'**adresse e-mail** de chaque
 * personne — que le décodeur ne doit jamais recopier.
 */
export const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');

export const servedPerson = (seed: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(seed),
  username: `membre${seed}`,
  displayName: `Membre ${seed}`,
  avatar: null,
  ...overrides,
});

export const servedInvitation = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  senderId: OBJECT_ID(2),
  receiverId: OBJECT_ID(3),
  type: 'friend',
  status: 'pending',
  message: 'Salut, on s’est croisés hier',
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
  sender: servedPerson(2, { displayName: 'Awa Diop', username: 'awa' }),
  receiver: servedPerson(3, { displayName: 'Jean Dupont', username: 'jean' }),
  ...overrides,
});

export const servedInvitationFiche = (overrides: Readonly<Record<string, unknown>> = {}) =>
  servedInvitation({
    sender: servedPerson(2, { displayName: 'Awa Diop', username: 'awa', firstName: 'Awa', lastName: 'Diop', email: 'awa@exemple.test' }),
    receiver: servedPerson(3, { displayName: 'Jean Dupont', username: 'jean', firstName: 'Jean', lastName: 'Dupont', email: 'jean@exemple.test' }),
    ...overrides,
  });

export const servedInvitationStats = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  total: 120,
  pending: 12,
  accepted: 80,
  rejected: 28,
  recentInvitations: 9,
  acceptanceRate: 67,
  byType: { pending: 12, accepted: 80, rejected: 28 },
  ...overrides,
});

export const servedInvitationDays = () => [
  { date: '2026-09-24', sent: 1, accepted: 1, rejected: 0 },
  { date: '2026-09-25', sent: 0, accepted: 0, rejected: 0 },
  { date: '2026-09-26', sent: 4, accepted: 2, rejected: 1 },
  { date: '2026-09-27', sent: 2, accepted: 1, rejected: 0 },
  { date: '2026-09-28', sent: 7, accepted: 3, rejected: 2 },
  { date: '2026-09-29', sent: 3, accepted: 1, rejected: 1 },
  { date: '2026-09-30', sent: 2, accepted: 0, rejected: 0 },
];
