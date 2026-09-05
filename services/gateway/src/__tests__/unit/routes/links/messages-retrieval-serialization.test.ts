/**
 * Contrat de SORTIE de `GET /links/:identifier/messages`.
 *
 * Ces témoins montent le VRAI `messageSchema` sur un VRAI Fastify et y font
 * passer la sortie du VRAI formateur. C'est la seule façon de les écrire :
 * `fast-json-stringify` ne sérialise que les propriétés déclarées, et un double
 * de schéma (`{ type: 'object', properties: {} }`, comme dans
 * `messages-retrieval.test.ts`) décrit un autre programme — il ne peut pas
 * constater ce que la route livre réellement.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { messageSchema } from '../../../../routes/links/types';
import { formatLinkMessageWithDetails } from '../../../../routes/links/utils/message-formatters';

const anonymousParticipant = {
  id: 'p_anon_1',
  userId: null,
  type: 'anonymous',
  displayName: 'Camille',
  avatar: 'https://cdn.example/camille.png',
  language: 'fr',
  user: null,
};

const registeredParticipant = {
  id: 'p_user_1',
  userId: 'u1',
  type: 'user',
  displayName: 'Alice M.',
  avatar: null,
  language: 'fr',
  user: {
    id: 'u1',
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Martin',
    displayName: 'Alice M.',
    avatar: null,
    systemLanguage: 'fr',
  },
};

const makeRawMessage = (sender: unknown) => ({
  id: 'm1',
  content: 'Bonjour',
  originalLanguage: 'fr',
  messageType: 'image',
  isEdited: true,
  editedAt: new Date('2026-08-16T10:00:00.000Z'),
  deletedAt: null,
  replyToId: 'm0',
  createdAt: new Date('2026-08-16T09:00:00.000Z'),
  updatedAt: new Date('2026-08-16T10:00:00.000Z'),
  sender,
  attachments: [
    {
      id: 'a1',
      fileName: 'photo.png',
      originalName: 'photo.png',
      mimeType: 'image/png',
      fileSize: 2048,
      fileUrl: '/uploads/photo.png',
      thumbnailUrl: '/uploads/photo-thumb.png',
      width: 800,
      height: 600,
      duration: null,
    },
  ],
  reactions: [
    { id: 'r1', emoji: '👍', participantId: 'p_anon_1', createdAt: new Date('2026-08-16T09:30:00.000Z') },
  ],
  replyTo: {
    id: 'm0',
    content: 'Salut',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-08-16T08:00:00.000Z'),
    sender: registeredParticipant,
  },
  translations: {},
});

/**
 * Monte le schéma de réponse exactement comme `registerMessagesRetrievalRoutes`
 * l'enregistre : `data.messages` est un tableau d'`messageSchema`.
 */
async function serveMessages(messages: unknown[]): Promise<any[]> {
  const app: FastifyInstance = Fastify();

  app.get(
    '/probe',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messages: { type: 'array', items: messageSchema },
                },
              },
            },
          },
        },
      },
    },
    async () => ({ success: true, data: { messages } })
  );

  const response = await app.inject({ method: 'GET', url: '/probe' });
  await app.close();

  return JSON.parse(response.body).data.messages;
}

describe('GET /links/:identifier/messages — ce que le schéma laisse passer', () => {
  describe("identité de l'auteur", () => {
    it("sert le nom d'un auteur ANONYME (le cas majoritaire d'un lien partagé)", async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect(served.sender).not.toBeNull();
      expect(served.sender.username).toBe('Camille');
      expect(served.sender.displayName).toBe('Camille');
      expect(served.sender.avatar).toBe('https://cdn.example/camille.png');
      expect(served.sender.isMeeshyer).toBe(false);
    });

    it("sert le nom d'un auteur INSCRIT", async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(registeredParticipant)),
      ]);

      expect(served.sender.username).toBe('alice');
      expect(served.sender.firstName).toBe('Alice');
      expect(served.sender.isMeeshyer).toBe(true);
    });

    it("n'ouvre PAS de seconde voie nominative `anonymousSender`", async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect(served).not.toHaveProperty('anonymousSender');
    });
  });

  describe('contenu que la route charge et documente', () => {
    it('sert les pièces jointes — un lien peut autoriser les envois anonymes de fichiers', async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect(served.attachments).toHaveLength(1);
      expect(served.attachments[0]).toMatchObject({
        id: 'a1',
        mimeType: 'image/png',
        fileUrl: '/uploads/photo.png',
        thumbnailUrl: '/uploads/photo-thumb.png',
        width: 800,
        height: 600,
      });
    });

    it('sert les réactions', async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect(served.reactions).toHaveLength(1);
      expect(served.reactions[0]).toMatchObject({ id: 'r1', emoji: '👍', participantId: 'p_anon_1' });
    });

    it('sert le message cité avec son auteur', async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect(served.replyToId).toBe('m0');
      expect(served.replyTo).not.toBeNull();
      expect(served.replyTo.id).toBe('m0');
      expect(served.replyTo.content).toBe('Salut');
      expect(served.replyTo.sender.username).toBe('alice');
    });

    it("sert le message cité même quand son auteur est un invité", async () => {
      const raw = makeRawMessage(registeredParticipant);
      raw.replyTo.sender = anonymousParticipant;

      const [served] = await serveMessages([formatLinkMessageWithDetails(raw)]);

      expect(served.replyTo.sender).not.toBeNull();
      expect(served.replyTo.sender.username).toBe('Camille');
      expect(served.replyTo.sender.isMeeshyer).toBe(false);
    });

    it("sert l'état d'édition", async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect(served.isEdited).toBe(true);
      expect(served.editedAt).toBe('2026-08-16T10:00:00.000Z');
      expect(served.updatedAt).toBe('2026-08-16T10:00:00.000Z');
    });
  });

  // `messageSchema` sert AUSSI `GET /links/:identifier` (`retrieval.ts`), dont
  // le formateur est plus maigre. Élargir le schéma ne doit rien matérialiser
  // sur cette route : une propriété portant un `default` serait émise même
  // absente de l'objet.
  describe("identité d'un auteur anonyme — nom donné en nom, pseudo en handle", () => {
    it('sert le nom du formulaire en displayName et le pseudo en username', async () => {
      const withProfile = {
        ...anonymousParticipant,
        displayName: 'ano_camille_x1',
        anonymousSession: { profile: { firstName: 'Camille', lastName: 'Dupont', email: 'c@example.com' } },
      };
      const [served] = await serveMessages([formatLinkMessageWithDetails(makeRawMessage(withProfile))]);

      expect(served.sender.displayName).toBe('Camille Dupont');
      expect(served.sender.firstName).toBe('Camille');
      expect(served.sender.lastName).toBe('Dupont');
      expect(served.sender.username).toBe('ano_camille_x1');
    });

    it('ne fuite pas le profil de session dans la réponse', async () => {
      const withProfile = {
        ...anonymousParticipant,
        anonymousSession: { profile: { firstName: 'Camille', email: 'c@example.com', birthday: '1990-01-01' } },
      };
      const [served] = await serveMessages([formatLinkMessageWithDetails(makeRawMessage(withProfile))]);

      expect(JSON.stringify(served)).not.toContain('c@example.com');
      expect(JSON.stringify(served)).not.toContain('1990-01-01');
    });
  });

  describe("avis d'arrivée — le SENS doit atteindre le visiteur anonyme", () => {
    // La population même que l'avis concerne (les invités d'un lien) chargeait
    // le fil par cette route et recevait le message SANS `metadata` ni
    // `messageSource` : impossible de le reconnaître comme avis, donc repli sur
    // le texte français stocké — jamais la langue du lecteur.
    it('sert `metadata`, `messageSource` et `senderId` du message système', async () => {
      const joinNotice = {
        ...makeRawMessage(anonymousParticipant),
        id: 'sys1',
        messageType: 'system',
        messageSource: 'system',
        senderId: 'p_anon_1',
        content: 'ano_camille a rejoint la conversation — visiteur sans compte',
        metadata: {
          kind: 'member-joined',
          participantId: 'p_anon_1',
          displayName: 'ano_camille',
          isAnonymous: true,
          viaShareLink: true,
          username: 'ano_camille',
          givenName: 'Camille',
          linkRules: { canSendMessages: true, canSendFiles: false, canSendImages: true },
        },
        attachments: [],
        reactions: [],
        replyTo: null,
        replyToId: null,
      };

      const [served] = await serveMessages([formatLinkMessageWithDetails(joinNotice)]);

      expect(served.messageSource).toBe('system');
      expect(served.senderId).toBe('p_anon_1');
      expect(served.metadata).toEqual({
        kind: 'member-joined',
        participantId: 'p_anon_1',
        displayName: 'ano_camille',
        isAnonymous: true,
        viaShareLink: true,
        username: 'ano_camille',
        givenName: 'Camille',
        linkRules: { canSendMessages: true, canSendFiles: false, canSendImages: true },
      });
    });

    it("n'invente ni `metadata` ni `messageSource` sur un message ordinaire", async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect('metadata' in served).toBe(false);
      expect('messageSource' in served).toBe(false);
    });
  });

  describe('la route jumelle, plus maigre, ne gagne aucun champ fantôme', () => {
    it("n'invente ni pièce jointe, ni réaction, ni citation", async () => {
      const lightMessage = {
        id: 'm1',
        content: 'Bonjour',
        originalLanguage: 'fr',
        createdAt: new Date('2026-08-16T09:00:00.000Z'),
        sender: { id: 'u1', username: 'alice', isMeeshyer: true },
        translations: [],
      };

      const [served] = await serveMessages([lightMessage]);

      expect(served).not.toHaveProperty('attachments');
      expect(served).not.toHaveProperty('reactions');
      expect(served).not.toHaveProperty('replyTo');
      expect(served).not.toHaveProperty('isEdited');
      expect(served).not.toHaveProperty('updatedAt');
    });
  });

  describe('champs délibérément non servis', () => {
    it("ne déclare pas `deletedAt` — la requête filtre déjà `deletedAt: null`", async () => {
      const [served] = await serveMessages([
        formatLinkMessageWithDetails(makeRawMessage(anonymousParticipant)),
      ]);

      expect(served).not.toHaveProperty('deletedAt');
    });
  });

  // #4885 — `getConversationMessagesWithDetails` charge la ligne `Message`
  // ENTIÈRE (`include` sans `select` racine) : `isViewOnce`/`isBlurred`/
  // `effectFlags`/`expiresAt` étaient déjà dans l'objet Prisma, mais ni ce
  // formateur ni `messageSchema` ne les recopiaient/déclaraient. Un visiteur
  // SANS COMPTE lisant un lien de partage — la population la plus exposée —
  // recevait un message à vue unique / flouté / éphémère sans aucun moyen de
  // le savoir.
  describe('drapeaux de protection du message (#4885)', () => {
    it('sert `isViewOnce`/`isBlurred`/`effectFlags`/`expiresAt` d’un message protégé', async () => {
      const raw = {
        ...makeRawMessage(anonymousParticipant),
        isViewOnce: true,
        maxViewOnceCount: 1,
        viewOnceCount: 0,
        isBlurred: true,
        effectFlags: 5,
        expiresAt: new Date('2026-09-05T00:00:00.000Z'),
      };

      const [served] = await serveMessages([formatLinkMessageWithDetails(raw)]);

      expect(served.isViewOnce).toBe(true);
      expect(served.isBlurred).toBe(true);
      expect(served.effectFlags).toBe(5);
      expect(served.expiresAt).toBe('2026-09-05T00:00:00.000Z');
    });

    it("sert `isViewOnce: false` sur un message ordinaire — pas d'omission ambiguë", async () => {
      const raw = {
        ...makeRawMessage(anonymousParticipant),
        isViewOnce: false,
        maxViewOnceCount: null,
        viewOnceCount: 0,
        isBlurred: false,
        effectFlags: 0,
        expiresAt: null,
      };

      const [served] = await serveMessages([formatLinkMessageWithDetails(raw)]);

      expect(served.isViewOnce).toBe(false);
      expect(served.isBlurred).toBe(false);
      expect(served.expiresAt).toBeNull();
    });
  });
});
