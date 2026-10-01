/**
 * **LE JOURNAL D'AUDIT TEL QUE LA PASSERELLE LE SERT** — l'usine commune des témoins
 * du lot « audit-reglages » (décodeur, liste, feuille de détail). Un module de
 * TÉMOINS : aucun code de production ne l'importe.
 *
 * La forme est celle de `GET /admin/audit-logs` (V1, pagination à côté des lignes) :
 * une ligne porte l'administrateur et le sujet NOMMÉS, la cible avec son libellé
 * résolu, le motif, les changements normalisés (valeurs en chaînes, secrets déjà
 * masqués) et — pour qui a `canViewSensitiveData` seulement — l'adresse IP et le
 * navigateur. Les témoins qui veulent prouver que le décodeur ne recopie rien de ce
 * que la passerelle n'a pas déclaré AJOUTENT ces champs par surcharge.
 */
export const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');

export const servedAuditPerson = (seed: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(seed),
  username: `membre${seed}`,
  displayName: `Membre ${seed}`,
  avatar: null,
  ...overrides,
});

export const servedAuditEntry = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  action: 'UPDATE_ROLE',
  entity: 'User',
  entityId: OBJECT_ID(3),
  createdAt: '2026-09-30T11:40:00.000Z',
  admin: servedAuditPerson(2, { displayName: 'Awa Diop', username: 'awa' }),
  subject: servedAuditPerson(3, { displayName: 'Jean Martin', username: 'jean' }),
  target: { type: 'User', id: OBJECT_ID(3), label: 'Jean Martin', secondary: '@jean' },
  reason: 'Promotion validée par le comité',
  changes: [{ field: 'role', before: 'USER', after: 'MODERATOR' }],
  ipAddress: null,
  userAgent: null,
  ...overrides,
});
