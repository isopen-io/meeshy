/**
 * `POST /links/:identifier/messages` — le RENVOI d'un message déjà écrit (#18617).
 *
 * Tout l'édifice d'idempotence de l'envoi converge sur
 * `MessageProcessor.saveMessage`, qui rend sur un doublon la ligne EXISTANTE
 * avec `isDuplicate`, jamais une erreur. **Cette surface y échappait** : elle
 * écrit en direct, sans `catch P2002`, et sa branche terminale rend 500.
 *
 * Le `clientMessageId` est OBLIGATOIRE ici (`routes/links/types.ts`, dont le
 * doc-comment dit « mandatory … so the gateway dedup contract holds across the
 * REST and Socket.IO surfaces ») : l'insertion dupliquée touche donc l'index
 * unique partiel à coup sûr. Le 500 n'était pas un cas limite, c'était le
 * verdict GARANTI d'un renvoi.
 *
 * Ce que ça coûtait aux deux clients qui savent renvoyer :
 *
 * | client | 500 est-il réessayable ? | état final de la bulle |
 * |---|---|---|
 * | iOS | oui, et non terminal | 5 tentatives (2/4/8/16/30 s) puis `.exhausted` — échec À VIE |
 * | web | `neverReachedServer` faux | jamais rejoué, bloquée sur « Réessayer », chaque appui refait un 500 |
 *
 * …pour un message que **tous les autres participants ont reçu**. C'est le seul
 * scénario que l'édifice d'idempotence existe pour absorber.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';

// ─── Mocks — hissés au sommet de CE module, donc déclarés ici ────────────────

jest.mock('../../../utils/logger', () => require('./links-messages.harness').loggerModule());
jest.mock('../../../utils/session-token', () => require('./links-messages.harness').sessionTokenModule());
jest.mock('../../../services/TrackingLinkService', () =>
  require('./links-messages.harness').trackingLinkServiceModule()
);
jest.mock('../../../middleware/auth', () => require('./links-messages.harness').authModule());
jest.mock('@meeshy/shared/types/api-schemas', () => require('./links-messages.harness').apiSchemasModule());
jest.mock('@meeshy/shared/types/socketio-events', () =>
  require('./links-messages.harness').socketioEventsModule()
);
jest.mock('../../../services/ConversationStatsService', () =>
  require('./links-messages.harness').conversationStatsModule()
);
jest.mock('../../../routes/links/types', () =>
  require('./links-messages.harness').linkTypesModule(
    jest.requireActual('../../../routes/links/types') as Record<string, unknown>
  )
);

// ─── Import après les mocks ──────────────────────────────────────────────────

import {
  makePrisma,
  makeSocketIOHandler,
  makeNotificationService,
  buildApp,
  MSHY_ID,
  CONV_ID,
  MSG_ID,
  CID,
  mockMessage,
  VALID_BODY,
  ANON_HEADERS,
  flushPostSaveEffects,
} from './links-messages.harness';

/** L'erreur que le client Prisma lève sur l'index unique partiel `(conversationId, clientMessageId)`. */
function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target: ['conversationId', 'clientMessageId'] },
  });
}

/**
 * La ligne DÉJÀ écrite par la première tentative — celle que le renvoi doit
 * retrouver. Un id distinct de `MSG_ID` serait un piège : c'est bien le MÊME
 * message, et le témoin doit pouvoir dire que c'est lui qu'on sert.
 */
const existingRow = { ...mockMessage, id: MSG_ID, clientMessageId: CID };

function prismaWithDuplicate(overrides: Record<string, unknown> = {}) {
  return makePrisma({
    message: {
      create: jest.fn<any>().mockRejectedValue(uniqueViolation()),
      findFirst: jest.fn<any>().mockResolvedValue(existingRow),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue(undefined),
      ...overrides,
    },
  });
}

async function resend(app: FastifyInstance) {
  return app.inject({
    method: 'POST',
    url: `/links/${MSHY_ID}/messages`,
    headers: ANON_HEADERS,
    payload: VALID_BODY,
  });
}

describe('#18617 — un renvoi rejoint le contrat de dedup, il ne rend pas 500', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rend le message EXISTANT, pas une erreur serveur', async () => {
    app = await buildApp({ prisma: prismaWithDuplicate() });

    const res = await resend(app);
    await app.close();

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.messageId).toBe(MSG_ID);
    expect(body.data.message.clientMessageId).toBe(CID);
  });

  /**
   * La relecture porte sur la clé d'IDEMPOTENCE, pas sur le contenu : deux
   * messages différents sous le même cid sont le même envoi renvoyé, et c'est
   * la paire `(conversationId, clientMessageId)` que l'index unique garde.
   */
  it('relit par `(conversationId, clientMessageId)`', async () => {
    const prisma = prismaWithDuplicate();
    app = await buildApp({ prisma });

    await resend(app);
    await app.close();

    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: CONV_ID, clientMessageId: CID }),
      })
    );
  });

  /**
   * **La moitié qui coûterait le plus cher si on l'oubliait.** Le premier envoi
   * a déjà diffusé et déjà notifié ; rediffuser sur le renvoi afficherait le
   * message DEUX FOIS à tous les participants, et renotifierait une seconde
   * bannière. C'est la garde `!isDuplicate` que les trois appelants du chemin
   * canonique portent déjà.
   */
  it('ne REDIFFUSE pas et ne RENOTIFIE pas', async () => {
    const socketIOHandler = makeSocketIOHandler(true);
    const notificationService = makeNotificationService();
    app = await buildApp({ prisma: prismaWithDuplicate(), socketIOHandler, notificationService });

    await resend(app);
    await flushPostSaveEffects();
    await app.close();

    expect(socketIOHandler.emit).not.toHaveBeenCalled();
    expect(socketIOHandler.enqueueOfflineLinkMessage).not.toHaveBeenCalled();
    expect(notificationService.createMessageNotification).not.toHaveBeenCalled();
  });

  /**
   * La course qu'on ne sait pas réconcilier reste une ERREUR — c'est la sortie
   * du chemin canonique, mot pour mot (`throw e` quand la relecture ne rend
   * rien). Servir 201 avec un corps vide serait pire que le 500 qu'on corrige :
   * le client rangerait un message inexistant comme envoyé.
   */
  /**
   * La course qu'on ne sait pas réconcilier reste une ERREUR — c'est la sortie
   * du chemin canonique, mot pour mot (`throw e` quand la relecture ne rend
   * rien). Servir 201 avec un corps vide serait pire que le 500 qu'on corrige :
   * le client rangerait comme « envoyé » un message dont il n'a pas l'id.
   *
   * **Ce témoin ne peut pas tenir la garde `if (!existing) throw error`, et
   * c'est mesuré** : la retirer rend AUSSI 500, par un `TypeError` sur
   * `stored.id` quelques lignes plus bas. Les deux réponses sont identiques
   * pour le client. Ce que la garde préserve est le DIAGNOSTIC — elle relance
   * le P2002 d'origine, là où son absence fait accuser `undefined` dans le
   * gestionnaire, loin de la course perdue sur l'index unique. La garde reste
   * posée, son inobservabilité est écrite ici, et le journal du cycle la nomme
   * plutôt que de la compter comme prouvée.
   */
  it('un P2002 dont la ligne est introuvable reste une erreur', async () => {
    app = await buildApp({
      prisma: prismaWithDuplicate({ findFirst: jest.fn<any>().mockResolvedValue(null) }),
    });

    const res = await resend(app);
    await app.close();

    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });

  /**
   * **Les mentions se LISENT sur la ligne relue, elles ne se recalculent pas.**
   *
   * Ce témoin existe parce que le précédent ne pouvait pas l'attraper : le
   * contenu nominal (`Hello!`) ne porte aucun `@`, donc
   * `resolveMessageMentions` court-circuite et ne touche à rien — une mutation
   * qui recalcule les mentions sur un doublon passait au VERT sur les 91
   * témoins de la route. Il faut un contenu qui NOMME quelqu'un pour que la
   * différence existe.
   *
   * Ce qu'un recalcul coûterait : une ligne `Mention` de plus, un
   * `Message.validatedMentions` réécrit, et une seconde notification de mention
   * à `@bob` — pour un message qu'il a déjà reçu.
   */
  it('ne RÉSOUT pas à nouveau les mentions d’un message déjà écrit', async () => {
    const mentionService = {
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['bob']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [] }),
      createMentions: jest.fn<any>().mockResolvedValue(undefined),
    };
    // **La ligne RELUE doit nommer quelqu'un**, pas seulement la requête : la
    // branche du doublon compose depuis le contenu STOCKÉ. Avec une fixture
    // dont le contenu est `Hello!`, une mutation qui recalcule les mentions
    // court-circuite sur « pas de `@` » et passe au vert — la fixture serait
    // hors de la question posée.
    const prisma = prismaWithDuplicate({
      findFirst: jest.fn<any>().mockResolvedValue({ ...existingRow, content: '@bob coucou' }),
    });
    app = await buildApp({ prisma, mentionService });

    const res = await app.inject({
      method: 'POST',
      url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS,
      payload: { content: '@bob coucou', clientMessageId: CID },
    });
    await flushPostSaveEffects();
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(mentionService.extractMentionsWithParticipants).not.toHaveBeenCalled();
    expect(mentionService.createMentions).not.toHaveBeenCalled();
    // La trace DURABLE d'une re-résolution : `validatedMentions` réécrit.
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  /** Et une panne qui n'est PAS un conflit d'unicité ne devient pas un succès. */
  it('une erreur autre que P2002 reste une erreur', async () => {
    app = await buildApp({
      prisma: prismaWithDuplicate({
        create: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      }),
    });

    const res = await resend(app);
    await app.close();

    expect(res.statusCode).toBe(500);
  });
});
