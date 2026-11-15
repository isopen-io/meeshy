/**
 * **LES DIFFUSIONS TELLES QUE LA PASSERELLE LES SERT** — l'usine commune des
 * témoins du lot « diffusions » (décodeurs, liste, fiche, composition, gestes).
 * Un module de TÉMOINS : aucun code de production ne l'importe.
 *
 * La forme est celle de `routes/admin/broadcasts.ts` : la LISTE sert la
 * projection étroite (`adminBroadcastListSelect`), la FICHE sert la ligne
 * ENTIÈRE plus les trois personnes nommées. Chaque témoin part de la ligne
 * nominale et ne surcharge que ce qu'il mesure.
 */
export const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');

export const servedPerson = (seed: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(seed),
  username: `membre${seed}`,
  displayName: `Membre ${seed}`,
  avatar: null,
  ...overrides,
});

export const servedTargeting = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  activityStatus: 'active',
  languages: ['fr', 'es'],
  countries: ['SN', 'FR'],
  ...overrides,
});

export const servedBroadcastRow = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  name: 'Lancement de l’automne',
  subject: 'Nouveautés de septembre',
  status: 'DRAFT',
  totalRecipients: 0,
  sentCount: 0,
  failedCount: 0,
  createdAt: '2026-09-29T10:00:00.000Z',
  sentAt: null,
  completedAt: null,
  sourceLanguage: 'fr',
  targetLanguages: [],
  inAppSentCount: 0,
  inAppSentAt: null,
  ...overrides,
});

export const servedBroadcast = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  name: 'Lancement de l’automne',
  subject: 'Nouveautés de septembre',
  body: 'Bonjour,\nvoici ce qui change ce mois-ci.',
  sourceLanguage: 'fr',
  targeting: servedTargeting(),
  translatedSubjects: null,
  translatedBodies: null,
  status: 'DRAFT',
  totalRecipients: 0,
  sentCount: 0,
  failedCount: 0,
  targetLanguages: [],
  createdById: OBJECT_ID(3),
  sentById: null,
  sentAt: null,
  completedAt: null,
  errorMessage: null,
  inAppSentById: null,
  inAppSentAt: null,
  inAppCompletedAt: null,
  inAppSentCount: 0,
  inAppFailedCount: 0,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T11:00:00.000Z',
  createdBy: servedPerson(3),
  sentBy: null,
  inAppSentBy: null,
  ...overrides,
});

/** Une diffusion préparée : traduite, prête à partir. */
export const servedReadyBroadcast = (overrides: Readonly<Record<string, unknown>> = {}) =>
  servedBroadcast({
    status: 'READY',
    totalRecipients: 1204,
    targetLanguages: ['es', 'en'],
    translatedSubjects: { es: 'Novedades de septiembre', en: 'September news' },
    translatedBodies: { es: 'Hola,\nesto es lo que cambia este mes.', en: 'Hello,\nhere is what changes this month.' },
    ...overrides,
  });

export const servedPreview = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  recipientCount: 1204,
  recipientsByLanguage: [
    { language: 'fr', count: 800 },
    { language: 'es', count: 300 },
    { language: 'en', count: 104 },
  ],
  recipientsByCountry: [
    { country: 'SN', count: 700 },
    { country: 'FR', count: 400 },
    { country: null, count: 104 },
  ],
  translations: { subjects: { es: 'Novedades de septiembre' }, bodies: { es: 'Hola' } },
  broadcast: servedReadyBroadcast(),
  ...overrides,
});
