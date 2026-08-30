/**
 * Garde NÉGATIVE — les portes MORTES de la messagerie et des liens de partage
 * ne sont plus MONTÉES (#4188).
 *
 * Ce que ces trois portes COÛTAIENT, chacune à sa manière :
 *
 *   1. `POST /messages/:messageId/status` acceptait `status: 'delivered'`
 *      (`MessageStatusBodySchema` : `z.enum(['read', 'delivered'])`) alors
 *      qu'AUCUNE branche ne le traitait — le handler sortait du `try` sans
 *      jamais appeler `reply`.
 *
 *      MESURE, avant retrait, sur la route réelle (`app.inject`, corps
 *      `{ status: 'delivered' }`, message et participant trouvés) :
 *      **`[200, "", "undefined"]`** — deux cents, corps VIDE, aucun
 *      `content-type`. L'issue #4188 annonçait « un 500 déterministe » ; c'est
 *      FAUX, et le vrai comportement est PIRE : la porte ACQUITTE un accusé de
 *      livraison qu'elle n'a jamais écrit. Un 500 fait réessayer le client ;
 *      un 200 vide le fait passer à autre chose, convaincu que le serveur a
 *      enregistré. C'est la forme « une moitié pauvre répond 200 SANS écrire »
 *      déjà payée ailleurs dans le dépôt.
 *
 *      Elle portait de plus la QUATRIÈME copie du fan-out d'accusés de lecture
 *      et n'avait aucun plancher d'historique — un membre pouvait avancer son
 *      curseur de lecture sur un message antérieur à son arrivée.
 *   2. `POST /links/:identifier/messages/auth` fabriquait, pour le fil global
 *      `meeshy`, un participant SYNTHÉTIQUE `{ id: userId }` : le message
 *      partait en base avec un `User.id` dans une colonne qui attend un
 *      `Participant.id`, et la garde d'appartenance était court-circuitée.
 *   3. `PUT /links/:conversationShareLinkId` exigeait ADMIN là où son jumeau
 *      `PATCH /links/:linkId` exige MODERATOR. Le seuil EFFECTIF d'une règle
 *      étant celui de sa porte la plus permissive, cette ADMIN était
 *      décorative — elle donnait l'illusion d'un seuil que personne n'avait.
 *
 * MÉTHODE — pourquoi la TABLE et pas un 404.
 * Un 404 se lit de partout : un préfixe mal monté, un module qui a levé à
 * l'enregistrement, un mock qui a dérivé rendent tous 404 sans rien prouver.
 * Ce test capture la table de routes RÉELLEMENT déclarée par les trois modules
 * (hook `onRoute` de Fastify, celui-là même qui alimente le routeur) et lui
 * pose DEUX questions indissociables :
 *   - les trois portes mortes en sont-elles ABSENTES ?
 *   - les portes VIVANTES qui les remplacent y sont-elles PRÉSENTES ?
 *
 * La seconde question est ce qui empêche cette garde de mourir en silence.
 * Une garde négative passe au vert le jour où elle ne teste plus rien : si un
 * module cessait de s'enregistrer, la table serait vide et les trois absences
 * seraient « vérifiées » sans que rien ne soit protégé. Les présences exigées
 * font alors rougir la suite. C'est la leçon des gardes négatives qui meurent
 * en silence (tasks/lessons.md § 464), appliquée à une table de routes.
 *
 * `POST /attachments/:attachmentId/status` figure exprès parmi les présences
 * exigées : c'est le quasi-homonyme VIVANT de la porte 1 — web (`use-audio-
 * playback.ts`, `use-video-playback.ts`) et iOS (`AttachmentStatusReporter`,
 * `OutboxDispatcher`) l'appellent — et un retrait trop large l'emporterait
 * sans qu'aucun autre témoin ne s'en aperçoive.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks : uniquement ce que l'ENREGISTREMENT touche ────────────────────────
// Aucun handler n'est exécuté ici — seuls les effets de bord du montage
// (constructeurs de services, fabrique de middleware) doivent tenir debout.

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async () => {},
  isRegisteredUser: () => true,
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

// PROLONGE, ne remplace pas (CLAUDE.md § « Un double PARTIEL d'un module perd
// en silence tout ce que le module GAGNE »). Le double énumératif d'avant a
// cessé de charger ce fichier le jour où `routes/conversations/receipts.ts` a
// composé `MarkReadBodySchema.extend({ type })` au chargement du module :
// `undefined.extend` — la TROISIÈME fois que ce patron casse une suite dans ce
// dépôt (cycles 91, 93, 104). `requireActual` + surcharge ciblée : ces cinq
// schémas ne servent ici qu'à des `validateX` déjà doublés au-dessus.
jest.mock('../../../validation/messages-schemas', () => ({
  ...(jest.requireActual('../../../validation/messages-schemas') as Record<string, unknown>),
  MessageParamsSchema: {},
  AttachmentParamsSchema: {},
  UpdateMessageBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';
import { registerMessageRoutes } from '../../../routes/links/messages';
import { registerManagementRoutes } from '../../../routes/links/management';
// #4188 — les trois couples des CONVERSATIONS. Les deux modules qui portaient
// les portes mortes, et `reactions.ts` qui porte la porte VIVANTE (`POST
// /reactions`, la forme plate que les trois clients appellent réellement).
import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import { registerMessagesAdvancedRoutes } from '../../../routes/conversations/messages-advanced';
import reactionRoutes from '../../../routes/reactions';

// ─── Capture de la table ──────────────────────────────────────────────────────

type MountedRoute = { readonly method: string; readonly url: string };

/**
 * `onRoute` reçoit `method` en `string | string[]` (Fastify accepte les deux
 * formes) : l'aplatir ici plutôt qu'au site d'assertion évite qu'une déclaration
 * multi-verbes échappe à la garde.
 */
function collectRoutes(app: FastifyInstance, table: MountedRoute[]): void {
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      table.push({ method, url: route.url });
    }
  });
}

async function buildTable(): Promise<readonly MountedRoute[]> {
  const table: MountedRoute[] = [];
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {} as never);
  app.decorate('translationService', {} as never);
  app.decorate('socketIOHandler', { getManager: () => null } as never);
  app.decorate('mentionService', {} as never);
  app.decorate('notificationService', {} as never);

  collectRoutes(app, table);

  await app.register(messageRoutes);
  await app.register(registerMessageRoutes);
  await app.register(registerManagementRoutes);
  await app.register(async (instance) => {
    const noop = async () => {};
    registerMessagesRoutes(instance, {} as never, {} as never, noop, noop);
    registerMessagesAdvancedRoutes(instance, {} as never, {} as never, noop, noop);
  });
  await app.register(reactionRoutes);
  await app.ready();
  await app.close();

  return table;
}

function has(table: readonly MountedRoute[], method: string, url: string): boolean {
  return table.some((route) => route.method === method && route.url === url);
}

// ─── Témoins ──────────────────────────────────────────────────────────────────

describe('#4188 — aucune porte morte ne subsiste sur les messages ni sur les liens', () => {
  let table: readonly MountedRoute[];

  beforeAll(async () => {
    table = await buildTable();
  });

  it.each([
    ['POST', '/messages/:messageId/status'],
    ['POST', '/links/:identifier/messages/auth'],
    ['PUT', '/links/:conversationShareLinkId'],
    ['POST', '/conversations/:id/messages/:messageId/reactions'],
    ['DELETE', '/conversations/:id/messages/:messageId/reactions'],
    ['POST', '/conversations/:id/read'],
  ])('%s %s n\'est plus déclarée', (method, url) => {
    expect(has(table, method, url)).toBe(false);
  });

  it.each([
    ['POST', '/attachments/:attachmentId/status'],
    ['GET', '/messages/:messageId/status-details'],
    ['POST', '/links/:identifier/messages'],
    ['PATCH', '/links/:linkId'],
    ['POST', '/reactions'],
    ['POST', '/conversations/:id/mark-read'],
    ['GET', '/conversations/:id/status'],
  ])('la porte VIVANTE %s %s est toujours déclarée', (method, url) => {
    expect(has(table, method, url)).toBe(true);
  });

  it('capture une table NON VIDE — sans quoi les trois absences ne prouveraient rien', () => {
    expect(table.length).toBeGreaterThan(5);
  });
});
