/**
 * Doubles partagés du domaine notification — site UNIQUE.
 *
 * Les cinq suites de `src/__tests__/` réintégrées par #7153 montaient chacune
 * son faux `prisma` et son faux journal. Ces jumeaux ont dérivé en silence :
 * un modèle ajouté à `NotificationService` laissait `this.prisma.<modèle>` à
 * `undefined`, la suite mourait sur `Cannot read properties of undefined
 * (reading 'findUnique')`, et AUCUN gate ne rougissait — puisque
 * `testPathIgnorePatterns` les tenait hors de jest.
 *
 * La carte ci-dessous est MESURÉE sur la production, jamais devinée :
 *
 *   grep -rhoE "prisma\.[a-zA-Z]+\.[a-zA-Z]+" \
 *     src/services/notifications/ src/services/PushNotificationService.ts \
 *     src/services/SequenceService.ts src/socketio/utils/emitWithSeq.ts
 *
 * La fermeture compte AUTANT que le domaine : `NotificationService` construit
 * lui-même un `SequenceService` (`:182`), et c'est lui qui touche
 * `userEventSeq`. Une première mesure bornée aux fichiers `notifications/`
 * ratait cette table — et le symptôme n'était pas une erreur, mais un `emit`
 * SILENCIEUX : `emitBestEffort` avale l'échec de `emitWithSeq`, donc la
 * notification s'écrivait sans jamais partir sur le socket.
 *
 * Un modèle absent d'ici rend `undefined` exactement comme avant : la mesure
 * se rejoue quand le domaine gagne une table, OU un collaborateur.
 */

import { jest } from '@jest/globals';

const PRISMA_SURFACE: Readonly<Record<string, readonly string[]>> = {
  conversation: ['findUnique'],
  friendRequest: ['findMany'],
  message: ['findUnique'],
  notification: [
    'count',
    'create',
    'createMany',
    'delete',
    'deleteMany',
    'findMany',
    'findUnique',
    'update',
    'updateMany',
  ],
  notificationPreference: ['findUnique'],
  participant: ['count', 'findUnique'],
  postComment: ['findMany'],
  postMedia: ['findFirst'],
  postReaction: ['findMany'],
  pushToken: ['deleteMany', 'findMany', 'findUnique', 'update'],
  user: ['findMany', 'findUnique'],
  userConversationPreferences: ['findMany'],
  userEventSeq: ['findUnique', 'upsert'],
  userPreferences: ['findUnique'],
};

export type PrismaModelDouble = Record<string, jest.Mock>;
export type NotificationPrismaDouble = Record<string, PrismaModelDouble> & {
  $transaction: jest.Mock;
};

/** Faux `prisma` couvrant TOUTE la surface que le domaine notification touche. */
export const makeNotificationPrisma = (): NotificationPrismaDouble => ({
  ...Object.fromEntries(
    Object.entries(PRISMA_SURFACE).map(([model, methods]) => [
      model,
      Object.fromEntries(methods.map((method) => [method, jest.fn()])),
    ])
  ),
  $transaction: jest.fn((operations: unknown) =>
    Array.isArray(operations) ? Promise.all(operations) : Promise.resolve(undefined)
  ),
});

const makeLevelLogger = () => ({
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
});

/**
 * Module `utils/logger-enhanced` en double.
 *
 * `enhancedLogger.child` est OBLIGATOIRE : `PushNotificationService.ts:24`
 * l'appelle au chargement du module, donc un double sans lui fait échouer
 * l'import lui-même — pas un test, la suite entière.
 *
 * `performanceLogger.withTiming` TRAVERSE : il rend ce que rend la fonction
 * qu'on lui confie. Un `jest.fn()` nu rendrait `undefined` et transformerait
 * chaque envoi push en silence réussi.
 */
export const makeLoggerEnhancedModule = () => ({
  enhancedLogger: { ...makeLevelLogger(), child: jest.fn(() => makeLevelLogger()) },
  notificationLogger: makeLevelLogger(),
  securityLogger: {
    logAttempt: jest.fn(),
    logViolation: jest.fn(),
    logSuccess: jest.fn(),
  },
  performanceLogger: {
    start: jest.fn(() => ({ end: jest.fn() })),
    withTiming: jest.fn(<T>(_step: string, fn: () => Promise<T>) => fn()),
  },
  redactPII: jest.fn((value: unknown) => value),
});

/** Module `utils/logger` en double. */
export const makeLoggerModule = () => ({ logger: makeLevelLogger() });
