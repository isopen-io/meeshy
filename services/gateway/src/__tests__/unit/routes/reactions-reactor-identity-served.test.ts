/**
 * `GET /reactions/:messageId` SERT l'identité de chaque réacteur (#19996).
 *
 * ─── Le défaut ───────────────────────────────────────────────────────────────
 *
 * Le contrat déclare quatre clés par réacteur, dont l'IDENTITÉ :
 *
 *     // packages/shared/types/api-schemas/reaction.ts
 *     users: { items: { properties: { userId, username, avatar, createdAt } } }
 *
 * Son producteur en pose quatre aussi, et nomme l'identité AUTREMENT :
 *
 *     // services/gateway/src/services/ReactionService.ts
 *     users: agg.participantIds.map((pid) => ({ participantId: pid, username, avatar, createdAt }))
 *
 * L'agrégat est servi TEL QUEL (`sendSuccess(reply, reactions)`). Comme
 * `fast-json-stringify` applique `additionalProperties: false` par défaut, il
 * supprime `participantId` et ne fabrique aucun `userId` : **aucune clé
 * d'identité ne franchit le sérialiseur.**
 *
 * C'est la QUATRIÈME famille du § « Une déclaration n'est juste que contre son
 * PRODUCTEUR » — une déclaration PRÉSENTE, BIEN FORMÉE, et FAUSSE contre ce qui
 * la remplit. Les trois cliquets du dépôt sont à inventaire VIDE et aucun ne la
 * voit : `response-schema-sweep` cherche une déclaration ABSENTE,
 * `response-payload-mismatch` une clé déclarée que la charge ne porte pas (ici
 * `users` EST portée — c'est une clé PETITE-FILLE qui diverge), et
 * `error-schema-sweep` ne regarde que les refus.
 *
 * ─── Ce que ça coûte, et pourquoi personne ne l'a vu ────────────────────────
 *
 * Les deux décodeurs natifs déclarent `userId` NON optionnel, et c'est le SEUL
 * des quatre champs sans valeur de repli :
 *
 *   - iOS   `ReactionUserDetail.userId: String`, `Codable` synthétisé, aucun
 *           `CodingKeys` ⇒ `keyNotFound(userId)` fait échouer le décodage de la
 *           réponse ENTIÈRE. `MessageReactionsDetailView` garde alors son seed
 *           local, où chaque réacteur autre que soi s'appelle « Inconnu » — et
 *           le commentaire du seed promet que « les vrais noms arrivent quand
 *           le fetch réussit », ce qui ne peut pas arriver dès qu'il y a UN
 *           réacteur.
 *   - Android `val userId: String` sans défaut, quand `username`, `avatar` et
 *           `createdAt` en ont un ⇒ `MissingFieldException`, `fetchDetails`
 *           rend `null`, et `refreshOwnReactions` n'allume jamais « ma
 *           réaction » depuis le serveur (aucune reprise multi-appareil).
 *   - web   ne lit que `username` et `avatar`, en parsing tolérant : **non
 *           affecté**. C'est la seule plateforme saine, et c'est la plus
 *           observée — d'où la longévité du défaut.
 *
 * ─── Pourquoi ce témoin existe, alors que la route est déjà couverte ────────
 *
 * `reactions-get-admission.test.ts` couvre la même route et ne peut PAS voir
 * ceci, par construction : il mocke l'enveloppe
 * (`mockSendSuccess` ⇒ `reply._body = data`), si bien qu'aucune sérialisation
 * n'a lieu et que `participantId` y est bien présent. Son doc-comment assume ce
 * choix et le justifie — « le témoin assert donc sur la REQUÊTE » — ce qui est
 * exact pour la garde d'ADMISSION qu'il couvre. **Le défaut vit dans l'espace
 * exact entre ce que le handler compose et ce que le sérialiseur laisse
 * sortir**, et aucun témoin du dépôt n'occupait cet espace pour cette route.
 *
 * D'où la forme d'ici, et elle n'est pas négociable (§ « un témoin qui n'exerce
 * pas la SÉRIALISATION atteste un contrat que personne ne respecte ») :
 *
 *   - un VRAI Fastify, la route montée par son spécificateur de PRODUCTION
 *     (`routes/index.ts` : `reactionRoutes` sous `apiBasePath()`) ;
 *   - le VRAI `ReactionService`, pour que ce soit le producteur réel qui
 *     compose — pas une fixture qui réciterait la forme attendue ;
 *   - les VRAIS schémas partagés : `@meeshy/shared/types/api-schemas` n'est PAS
 *     mocké. Le doubler désarmerait `fast-json-stringify`, c'est-à-dire la
 *     couche où le défaut vit, et le dépôt a payé trois fois le double partiel
 *     de ce module (cycles 86, 91, 93) ;
 *   - l'assertion porte sur `res.json()`, la valeur SERVIE.
 *
 * Deux doubles seulement, tous deux orthogonaux au sujet : l'authentification
 * (plomberie — elle décide QUI lit, pas ce qui sort) et `captureNoticeWithheldFrom`
 * (un gate d'avis de capture, #9629, qui a ses propres témoins).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

const auth = { userId: '', participantId: undefined as string | undefined, isAnonymous: false };

jest.mock('../../../middleware/auth.js', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = { ...auth };
  },
}));

jest.mock('../../../services/messaging/captureNoticeVisibility.js', () => ({
  captureNoticeWithheldFrom: async () => false,
}));

jest.mock('../../../utils/logger.js', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import reactionRoutes from '../../../routes/reactions';
import { apiBasePath } from '@meeshy/shared/api/prefix';

const MESSAGE = '68c00000000000000000000d';
const CONVERSATION = '68c00000000000000000000c';
const ALICE_USER = '68c0000000000000000000a1';
const ALICE_PART = '68c0000000000000000000a2';
const GUEST_PART = '68c0000000000000000000b2';

type Row = Record<string, unknown>;

/**
 * Le monde minimal que la route et le VRAI `ReactionService` interrogent.
 * `participants` porte `id` ET `userId` : la route compare sur `userId` pour un
 * inscrit et sur `id` pour un anonyme, et l'enrichissement du service lit les
 * deux (c'est `userId` qu'il tient en main sans le servir).
 */
function world(options: { readonly reactions: readonly Row[]; readonly participants: readonly Row[] }) {
  return {
    message: {
      findUnique: async () => ({
        id: MESSAGE,
        conversationId: CONVERSATION,
        conversation: { id: CONVERSATION, participants: options.participants.map((p) => ({ id: p.id, userId: p.userId })) },
      }),
    },
    participant: {
      findFirst: async () => ({ id: ALICE_PART }),
      findMany: async () => options.participants,
    },
    reaction: {
      findMany: async () => options.reactions,
    },
  } as never;
}

async function serve(w: unknown) {
  const app = Fastify();
  app.decorate('prisma', w as never);
  app.decorate('socketIOHandler', undefined as never);
  await app.register(reactionRoutes as never, { prefix: apiBasePath() });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `${apiBasePath()}/reactions/${MESSAGE}` });
  await app.close();
  return res;
}

const at = new Date('2026-11-20T09:00:00.000Z');

describe('GET /reactions/:messageId — l\'identité du réacteur franchit le sérialiseur (#19996)', () => {
  beforeEach(() => {
    auth.userId = ALICE_USER;
    auth.participantId = undefined;
    auth.isAnonymous = false;
  });

  it('sert l\'identité d\'un réacteur INSCRIT — une clé qui identifie la personne, pas seulement son nom', async () => {
    const res = await serve(
      world({
        reactions: [{ id: 'r1', messageId: MESSAGE, emoji: '❤️', participantId: ALICE_PART, createdAt: at }],
        participants: [{ id: ALICE_PART, userId: ALICE_USER, displayName: 'Alice', avatar: null, user: { displayName: 'Alice', avatar: null } }],
      }),
    );

    expect(res.statusCode).toBe(200);
    const reactor = (res.json() as any).data.reactions[0].users[0];

    // Le cœur du défaut : AUCUNE clé d'identité ne franchissait le sérialiseur.
    // On ne fige pas LAQUELLE des deux graphies ici — on exige qu'au moins une
    // identité adressable sorte, et que celle qui sort désigne la bonne espèce
    // d'id (cf. le témoin suivant pour le `User.id`).
    expect(Object.keys(reactor)).toEqual(expect.arrayContaining(['username']));
    expect(reactor.userId ?? reactor.participantId).toBeDefined();
  });

  it('le `User.id` d\'un réacteur inscrit est SERVI — c\'est ce que les deux décodeurs natifs exigent', async () => {
    const res = await serve(
      world({
        reactions: [{ id: 'r1', messageId: MESSAGE, emoji: '❤️', participantId: ALICE_PART, createdAt: at }],
        participants: [{ id: ALICE_PART, userId: ALICE_USER, displayName: 'Alice', avatar: null, user: { displayName: 'Alice', avatar: null } }],
      }),
    );

    const reactor = (res.json() as any).data.reactions[0].users[0];
    expect(reactor.userId).toBe(ALICE_USER);
  });

  it('un invité de lien sort avec son `participantId` et SANS `User.id` fabriqué — un `userId` déclare un `User.id`', async () => {
    // `Participant.userId` est nul pour un invité de lien. Le `CLAUDE.md` de la
    // passerelle l'interdit explicitement : « Ne jamais recopier `participantId`
    // tel quel dans un champ de payload nommé `userId` : ces champs déclarent un
    // `User.id` ». Ce témoin garde cette frontière — il tomberait sur un
    // `userId: participant.userId ?? pid`, le raccourci tentant.
    const res = await serve(
      world({
        reactions: [{ id: 'r2', messageId: MESSAGE, emoji: '🎉', participantId: GUEST_PART, createdAt: at }],
        participants: [
          { id: ALICE_PART, userId: ALICE_USER, displayName: 'Alice', avatar: null, user: { displayName: 'Alice', avatar: null } },
          { id: GUEST_PART, userId: null, displayName: 'Invité', avatar: null, user: null },
        ],
      }),
    );

    const reactor = (res.json() as any).data.reactions[0].users[0];
    expect(reactor.participantId).toBe(GUEST_PART);
    expect(reactor.userId ?? null).toBeNull();
  });
});
