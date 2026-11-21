/**
 * LA FAMILLE DES LIENS DE PARTAGE FACE AU MEMBRE ACTIF-ET-BANNI (#20183).
 *
 * #20135 a fermé l'ADMINISTRATION d'un lien (`PATCH /links/:linkId`,
 * `/toggle`, `/extend`, par l'unique `loadShareLinkForManagement`). Son
 * commentaire de clôture notait que la famille des PORTES — une lecture de
 * `Participant` keyée sur l'APPELANT, dont le résultat décide d'un refus —
 * n'a aucun cliquet, parce que le balayage des audiences écarte par
 * construction tout `where` qui nomme une personne (#20155).
 *
 * Relevées à la sonde, puis ouvertes une par une, **six autres portes de cette
 * famille admettaient sur `isActive` NU.** Ce fichier garde les deux qui sont
 * des FONCTIONS — donc exerçables sans monter de route — et les quatre autres
 * sont gardées chez leur route :
 *
 * | porte | témoin |
 * |---|---|
 * | `mintConversationShareLink` (`POST /links`, `POST /conversations/:id/new-link`) | ICI |
 * | `findActiveUserParticipant` (fiche d'un lien, `retrieval.ts`) | ICI |
 * | `GET /conversations/:conversationId/links` | `conversation-sharing-links-read.test.ts` |
 * | `GET /links?conversationId=` | `links-user.test.ts` |
 * | `GET /links/:identifier/messages` | `links-messages-retrieval.test.ts` |
 * | la porte de l'invité anonyme (`links/messages.ts`) | `links-messages.test.ts` |
 *
 * ── POURQUOI LA FABRICATION EST LA PLUS GRAVE DES SIX ───────────────────────
 *
 * Les cinq autres sont des fuites de LECTURE. Celle-là est un CONTOURNEMENT du
 * bannissement par procuration : le banni ne peut pas rentrer lui-même
 * (`resolveConversationEntry` le refuse), mais le lien qu'il fabrique n'a, lui,
 * aucun passé — un invité anonyme qui l'emprunte n'a pas de ligne à refuser.
 * **Un membre exclu pouvait donc encore faire entrer qui il veut.**
 *
 * ── LE DOUBLE HONORE SON `where`, ET C'EST TOUT LE TÉMOIN ───────────────────
 *
 * `mockResolvedValue(ligne)` rend la ligne quel que soit le filtre : sous un
 * tel double, retirer la garde de bannissement de la production laisse ces
 * témoins VERTS. `findFirstIn` applique le `where` par `matchesMongoWhere`, où
 * un champ ABSENT n'est pas un champ à `null` — la seule sémantique sous
 * laquelle la clause `OR` d'`unsetOrNull('bannedAt')` s'observe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { findFirstIn } from '../../helpers/mongo-where';

const CONV_ID = '507f1f77bcf86cd799439011';
const CALLER_ID = '507f1f77bcf86cd799439012';

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn(async (_prisma: unknown, id: string) => id),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

const sendForbidden = jest.fn<any>();
const sendNotFound = jest.fn<any>();
const sendError = jest.fn<any>();

jest.mock('../../../utils/response', () => ({
  sendForbidden: (...args: unknown[]) => sendForbidden(...args),
  sendNotFound: (...args: unknown[]) => sendNotFound(...args),
  sendError: (...args: unknown[]) => sendError(...args),
}));

import { mintConversationShareLink } from '../../../routes/links/utils/share-link-mint';
import { findActiveUserParticipant } from '../../../routes/links/utils/prisma-queries';

/**
 * Les trois états d'une ligne de participation, dont le SECOND est celui que
 * la base porte et que la clause nue lisait comme vivant : bannir un membre
 * déjà inactif n'écrit que `bannedAt` (`conversationBanState`), et
 * `restore-for-me` rallumait ensuite `isActive` sans le lire (fermé par
 * #10436, sans migration des lignes existantes).
 */
const VIVANT = { id: 'p-live', userId: CALLER_ID, conversationId: CONV_ID, type: 'user', isActive: true, role: 'admin' };
const ACTIF_ET_BANNI = { ...VIVANT, id: 'p-banned', bannedAt: new Date('2026-11-01T00:00:00Z') };
const INACTIF = { ...VIVANT, id: 'p-gone', isActive: false };

function prismaWith(row: Record<string, unknown>) {
  return {
    participant: {
      findFirst: findFirstIn([row] as never),
      // L'éventail « un lien a été créé » — une AUDIENCE, hors de ce lot
      // (elle répond « qui prévenir », pas « qui a le droit »).
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: CONV_ID, type: 'group', encryptionMode: 'server', title: 'Groupe', isActive: true, closedAt: null,
      }),
    },
    conversationShareLink: {
      // L'unicité des deux identifiants publics : rien n'est pris.
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'link-row', linkId: 'mshy_x', name: null }),
    },
  } as never;
}

const mintParams = (row: Record<string, unknown>) => ({
  prisma: prismaWith(row),
  reply: {} as never,
  log: { error: jest.fn() },
  notificationService: undefined,
  socketIOHandler: undefined,
  userId: CALLER_ID,
  userRole: 'USER',
  input: { conversationId: CONV_ID } as never,
  engagement: { recordActivity: jest.fn<any>().mockResolvedValue(undefined) },
});

describe('#20183 — la fabrication d\'un lien de partage (`mintConversationShareLink`)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('REFUSE un membre actif-et-BANNI — il ne fabrique plus de lien vers la conversation dont il est exclu', async () => {
    const result = await mintConversationShareLink(mintParams(ACTIF_ET_BANNI) as never);

    expect(result).toBeNull();
    expect(sendForbidden).toHaveBeenCalledTimes(1);
  });

  it('n\'écrit AUCUNE ligne de lien pour un banni — le refus précède la création, il ne la défait pas', async () => {
    const params = mintParams(ACTIF_ET_BANNI);
    await mintConversationShareLink(params as never);

    expect((params.prisma as never as { conversationShareLink: { create: jest.Mock } }).conversationShareLink.create)
      .not.toHaveBeenCalled();
  });

  it('REFUSE un membre parti (`isActive: false`) — la garde d\'avant, inchangée', async () => {
    const result = await mintConversationShareLink(mintParams(INACTIF) as never);

    expect(result).toBeNull();
    expect(sendForbidden).toHaveBeenCalledTimes(1);
  });

  it('laisse passer la participation VIVANTE jusqu\'à la garde de RANG — le lot ne resserre rien d\'autre', async () => {
    const params = mintParams(VIVANT);
    await mintConversationShareLink(params as never);

    // `role: 'admin'` ≥ MODERATOR : la porte de rang (#4169) ne refuse pas, donc
    // le geste va jusqu'à l'écriture. C'est ce que mesure ce témoin — sans lui,
    // une clause trop serrée fermerait la fabrication à TOUT le monde et les
    // trois témoins ci-dessus resteraient verts (l'erreur symétrique de #20135,
    // qui emportait quinze témoins parce que `bannedAt: null` n'apparie pas une
    // colonne ABSENTE).
    expect(sendForbidden).not.toHaveBeenCalled();
    expect((params.prisma as never as { conversationShareLink: { create: jest.Mock } }).conversationShareLink.create)
      .toHaveBeenCalledTimes(1);
  });
});

describe('#20183 — la fiche d\'un lien (`findActiveUserParticipant`)', () => {
  /**
   * `retrieval.ts` en fait `hasAccess = memberRow !== null || canPreview` : la
   * ligne rendue donne l'accès de MEMBRE à la fiche du lien, par-dessus ce que
   * l'aperçu public accorde. Elle sert AUSSI `userType`, et c'est pour cela que
   * le resserrement se fait dans la clause et non en aval : un banni ne doit pas
   * être « un membre dont on masque des champs », il doit être absent.
   */
  it('ne rend PAS un membre actif-et-BANNI', async () => {
    const prisma = prismaWith(ACTIF_ET_BANNI);
    await expect(findActiveUserParticipant(prisma as never, CONV_ID, CALLER_ID)).resolves.toBeNull();
  });

  it('ne rend PAS un membre parti', async () => {
    const prisma = prismaWith(INACTIF);
    await expect(findActiveUserParticipant(prisma as never, CONV_ID, CALLER_ID)).resolves.toBeNull();
  });

  it('rend la participation VIVANTE', async () => {
    const prisma = prismaWith(VIVANT);
    await expect(findActiveUserParticipant(prisma as never, CONV_ID, CALLER_ID)).resolves.toMatchObject({ id: 'p-live' });
  });
});
