/**
 * **LES LIENS DE PARTAGE TELS QUE LA PASSERELLE LES SERT** — l'usine commune des
 * témoins du lot « liens » pour les liens de partage (décodeurs, liste, fiche,
 * gestes). Un module de TÉMOINS : aucun code de production ne l'importe.
 *
 * La forme est celle de `GET /admin/share-links` (liste) et de
 * `GET /admin/share-links/:id` (fiche) : **sans `linkId`, sans `identifier`, sans
 * `allowedIpRanges`** — la passerelle ne les sert pas, et les témoins qui veulent
 * prouver que le décodeur ne les recopie pas les AJOUTENT par surcharge.
 */
export const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');

export const servedPerson = (seed: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(seed),
  username: `membre${seed}`,
  displayName: `Membre ${seed}`,
  avatar: null,
  ...overrides,
});

export const servedShareLink = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  name: 'Soirée du vendredi',
  description: 'Le lien posté dans le groupe des voisins',
  maxUses: 50,
  currentUses: 12,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 2,
  expiresAt: '2026-10-15T18:00:00.000Z',
  isActive: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  createdAt: '2026-09-20T09:00:00.000Z',
  creator: servedPerson(2, { displayName: 'Awa Diop', username: 'awa' }),
  conversation: { id: OBJECT_ID(3), identifier: 'mshy_voisins', title: 'Les voisins', type: 'group' },
  _count: { anonymousParticipants: 7 },
  ...overrides,
});

export const servedShareLinkFiche = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  ...servedShareLink(),
  maxUniqueSessions: 30,
  currentUniqueSessions: 9,
  visitCount: 41,
  allowViewHistory: false,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedCountries: ['FR', 'SN'],
  allowedLanguages: ['fr', 'wo'],
  updatedAt: '2026-09-28T10:00:00.000Z',
  recentGuests: [
    { id: OBJECT_ID(21), displayName: 'Invité Koffi', avatar: null, joinedAt: '2026-09-30T11:00:00.000Z', isActive: true },
    { id: OBJECT_ID(22), displayName: null, avatar: null, joinedAt: '2026-09-29T08:00:00.000Z', isActive: false },
  ],
  ...overrides,
});
