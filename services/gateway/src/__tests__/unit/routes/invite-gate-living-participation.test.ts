/**
 * `POST /conversations/:id/invite` — un membre actif-et-BANNI ne fait entrer
 * personne (#20104).
 *
 * ─── Le défaut ───────────────────────────────────────────────────────────────
 *
 * La route chargeait ses membres sous `{ isActive: true, type: 'user' }` — la
 * clause NUE — puis résolvait l'inviteur dedans :
 *
 *     const inviterMember = conversation.participants.find(m => m.userId === inviterId);
 *     if (!inviterMember) return sendForbidden(reply, '…');
 *
 * Une ligne `isActive: true, bannedAt ≠ null` EXISTE en base (son producteur est
 * fermé depuis #19688 / #10436, mais aucune migration n'a reprise les lignes
 * déjà écrites). Un banni-mais-actif franchissait donc cette porte — et
 * « inviter » n'est pas un geste anodin ici : il écrit un `Participant`
 * immédiatement ACTIF (`role: 'member'`, table `NEW_MEMBER_PERMISSIONS`). Un
 * exclu faisait entrer qui il voulait dans la conversation dont il est exclu.
 *
 * ─── Pourquoi la CLAUSE, et pas la loi jugée en code ─────────────────────────
 *
 * L'inventaire du cliquet d'audiences classait ce site
 * « porte-sur-un-sur-ensemble » et INTERDISAIT de resserrer, au motif que « la
 * même lecture tient `newMemberRefusal`, un refus par égalité exacte (un
 * tête-à-tête chiffré reste à DEUX, #16188) ».
 *
 * **Mesuré faux.** `newMemberRefusal` ne lit que `type` et `encryptionMode`
 * (`services/conversations/newMemberAdmission.ts`) : le tête-à-tête chiffré se
 * tient par `isEndToEndDirect`, qui ne compte PERSONNE. Les deux autres
 * consommateurs de l'objet `conversation` ne lisent pas davantage la liste —
 * `resolveConversationEntry` relit ses propres lignes avec leur `bannedAt`, et
 * `isConversationClosed` ne lit que `isActive` / `closedAt` de la conversation.
 * La liste a donc UN consommateur, la porte elle-même.
 *
 * Aucun refus ne dépendant du sur-ensemble, la loi va dans la CLAUSE — le seul
 * endroit qu'un balayage de source sait lire (#20050). Juger en code aurait
 * marché et laissé la règle invisible au cliquet.
 *
 * ─── Ce que ces témoins mesurent, et pourquoi ainsi ──────────────────────────
 *
 * Le double ÉVALUE le `where` (`__tests__/helpers/mongo-where.ts`) au lieu de le
 * comparer à une copie : un témoin qui assert sur la clause REÇUE passe aussi
 * bien avec une clause juste qu'avec une clause fausse, puisqu'il ne vérifie que
 * sa propre copie. Ici c'est le RÉSULTAT de la lecture qui parle.
 *
 * Et le troisième témoin est le plus important des trois : il garde l'erreur
 * SYMÉTRIQUE. `PARTICIPATION_VIVANTE` dit `bannedAt` nul **ou absent**
 * (`unsetOrNull`) parce que la colonne n'existe pas dans le document d'un
 * participant jamais banni ; écrire `bannedAt: null` aurait fermé la route à
 * TOUTE la population — un défaut bien pire que celui qu'on corrige, et qu'un
 * témoin posé seulement sur le banni ne verrait pas.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

import { matchesMongoWhere } from '../../helpers/mongo-where';

const CONVERSATION_ID = '507f1f77bcf86cd799439301';
const INVITER_USER = 'usr-inviter';
const INVITEE_USER = 'usr-invitee';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = {
      userId: INVITER_USER,
      type: 'registered',
      isAuthenticated: true,
      registeredUser: { id: INVITER_USER },
      isAnonymous: false,
      hasFullAccess: true,
    };
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { registerInviteRoute } from '../../../routes/conversations/sharing-invite';

/**
 * Les trois formes de ligne qui décident de cette porte. Noter l'ABSENCE de clé
 * `bannedAt` sur la première : c'est l'état d'un participant jamais banni, et le
 * piège que `unsetOrNull` existe pour éviter.
 */
const jamaisBanni = () => ({ id: 'part-inviter', userId: INVITER_USER, type: 'user', isActive: true, role: 'admin', displayName: 'Alice' });
const banniMaisActif = () => ({ ...jamaisBanni(), bannedAt: new Date('2026-11-01T00:00:00Z') });
const banLeve = () => ({ ...jamaisBanni(), bannedAt: null });

let participantRows: Array<Record<string, unknown>> = [];
/** Les `Participant` que la route a CRÉÉS. */
let created: Array<Record<string, unknown>> = [];
/** Le double, gardé pour observer ce que la route a lu APRÈS la porte. */
let prisma: any;

/**
 * Ce que ces témoins mesurent est l'ADMISSION par la porte, et elle s'observe au
 * premier site qui la SUIT : la résolution de l'invité
 * (`user.findFirst({ where: { id } })` dans l'admission partagée que la route
 * adapte depuis #4557, juste après le contrôle de rang). La
 * porte refusant par un `return`, cet appel n'a lieu que si elle a admis.
 *
 * Pourquoi pas « la route rend 200 » : le chemin de CRÉATION qui suit touche
 * l'ouverture de conversation directe, l'admission en salon de communauté, les
 * notifications et le socket — un double complet de tout cela mesurerait la
 * création, pas la porte, et ce lot ne change que la porte. La frontière est
 * dite ici pour qu'elle ne se lise pas comme un oubli.
 */
const invitePortailFranchi = (): boolean =>
  prisma.user.findFirst.mock.calls.some(
    (call: any) => call[0]?.where?.id === INVITEE_USER
  );

function makePrisma() {
  return {
    conversation: {
      findUnique: jest.fn(async (args: any) => {
        // La route charge ses membres par une relation imbriquée : le double
        // ÉVALUE ce `where`-là, il ne le relit pas.
        const relationWhere = args?.include?.participants?.where;
        return {
          id: CONVERSATION_ID,
          type: 'group',
          encryptionMode: null,
          isActive: true,
          closedAt: null,
          communityId: null,
          participants: participantRows.filter((row) => matchesMongoWhere(row, relationWhere)),
        };
      }),
    },
    user: {
      findUnique: jest.fn(async () => ({ id: INVITEE_USER, username: 'bob', displayName: 'Bob' })),
      findFirst: jest.fn(async () => ({ id: INVITEE_USER, username: 'bob', displayName: 'Bob' })),
      // `utils/blocking.ts` interroge les blocages réciproques APRÈS la porte.
      // Sans cette surface le handler JETTE hors de tout `try`, et le worker
      // jest meurt — un échec qui ne ressemble pas à un échec de témoin.
      findMany: jest.fn(async () => []),
    },
    userBlock: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    participant: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => {
        created.push(args?.data ?? {});
        return { id: 'part-new', ...(args?.data ?? {}) };
      }),
      update: jest.fn(async () => ({ id: 'part-new' })),
      findUnique: jest.fn(async () => ({ id: 'part-new', ...(created.at(-1) ?? {}), anonymousSession: null, user: { id: INVITEE_USER, username: 'bob', displayName: 'Bob' } })),
      count: jest.fn(async () => 1),
    },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  // `onRequest: [fastify.authenticate]` est le seul producteur d'`authContext`
  // sur cette route : un décorateur VIDE le laisse absent, la route répond 401,
  // et un témoin qui n'assert que `not.toBe(403)` passe alors sans rien prouver.
  // C'est arrivé à la première écriture de ce fichier.
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      userId: INVITER_USER,
      type: 'registered',
      isAuthenticated: true,
      registeredUser: { id: INVITER_USER },
      isAnonymous: false,
      hasFullAccess: true,
    };
  });
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => undefined }) } as never);
  // Le MÊME point d'entrée que la production (`routes/conversations/sharing.ts`),
  // jamais un double du handler : un témoin qui monte autre chose atteste autre
  // chose — y compris la sérialisation, qui est une couche à part entière.
  registerInviteRoute(app, prisma, { recordActivity: jest.fn(async () => undefined) } as never);
  await app.ready();
  return app;
}

const invite = (app: FastifyInstance) =>
  app.inject({
    method: 'POST',
    url: `/conversations/${CONVERSATION_ID}/invite`,
    headers: { authorization: 'Bearer test-token' },
    payload: { userId: INVITEE_USER },
  });

describe("la porte d'invitation lit la participation VIVANTE (#20104)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    participantRows = [];
    created = [];
  });

  it("un membre actif-et-BANNI reçoit 403 et ne crée aucun participant", async () => {
    participantRows = [banniMaisActif()];
    prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await invite(app);
    await app.close();

    expect(res.statusCode).toBe(403);
    // La porte a refusé AVANT de résoudre l'invité…
    expect(invitePortailFranchi()).toBe(false);
    // …et le geste n'a rien ÉCRIT. Un 403 sur une route qui aurait déjà créé la
    // ligne ne protégerait rien.
    expect(created).toEqual([]);
  });

  it("un membre jamais banni (AUCUNE clé `bannedAt`) franchit la porte", async () => {
    // La mesure SYMÉTRIQUE, et la plus importante : `bannedAt: null` au lieu
    // d'`unsetOrNull` aurait fermé la route à toute la population, la colonne
    // étant ABSENTE du document d'un participant jamais banni.
    participantRows = [jamaisBanni()];
    prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await invite(app);
    await app.close();

    // Une observation POSITIVE, jamais `not.toBe(403)` : un 401 faute
    // d'`authContext` satisferait une négation sans rien prouver — c'est
    // exactement ce qui est arrivé à la première écriture de ce fichier.
    expect(invitePortailFranchi()).toBe(true);
    expect(res.statusCode).not.toBe(403);
  });

  it("un membre dont le ban a été LEVÉ (`bannedAt: null` explicite) franchit la porte", async () => {
    // L'autre moitié d'`unsetOrNull` : la colonne PRÉSENTE et nulle, ce qu'écrit
    // `POST …/unban`.
    participantRows = [banLeve()];
    prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await invite(app);
    await app.close();

    expect(invitePortailFranchi()).toBe(true);
    expect(res.statusCode).not.toBe(403);
  });
});
