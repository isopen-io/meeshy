/**
 * LE SIXIÈME TRANSPORT DES RÉACTIONS (#19676) — un membre banni qui est encore
 * DANS l'appel ne réagit plus sur la bulle de l'appel.
 *
 * #19525 a fermé CINQ portes de réaction de message en leur faisant épeler
 * `PARTICIPATION_VIVANTE`. Son audit adversarial a ouvert #19604 sur une
 * PRÉDICTION : « un sixième transport qui résoudrait son participant à la main
 * ne rougirait nulle part ». Ce transport est arrivé **trois heures plus tard**
 * (#19650 a créé ce fichier le 2026-11-18 à ~10h37, #19525 avait fusionné à
 * ~03h05), avec la graphie NUE.
 *
 * ─── Pourquoi ce n'était PAS un piège armé ────────────────────────────────
 *
 * Le seul verrou en amont est `resolveActiveCallParticipant`
 * (`socketio/call-participants.ts`), et il ne pose que la question de la
 * participation à la SESSION D'APPEL (`!p.leftAt`) — jamais celle de
 * l'appartenance à la CONVERSATION. Un membre banni PENDANT qu'il est dans
 * l'appel — le cas nominal, un modérateur bannissant en cours d'appel — garde
 * sa ligne de session et passe. Son emoji était alors persisté sur la bulle du
 * fil, diffusé en `reaction:added` à toute la room de la conversation dont il
 * venait d'être banni, et faisait remonter cette conversation en tête de la
 * liste de chaque participant.
 *
 * ─── DEUX témoins, et aucun ne subsume l'autre ────────────────────────────
 *
 * Le témoin existant de ce fichier (`callReactionOnBubble.test.ts`) illustre
 * exactement pourquoi : son double est `findFirst: async () => ({ id: 'p-bob' })`
 * — il rend l'auteur quel que soit le `where`, donc la mutation de la loi y
 * reste VERTE. Le COMPORTEMENT passe donc par `findFirstIn`
 * (`__tests__/helpers/mongo-where.ts`), qui refuse ce que le vrai client
 * refuse ; et la PROJECTION assert sur la REQUÊTE, seule à voir un `where` que
 * personne n'honore en test.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { reflectCallReactionOnBubble } from '../callReactionOnBubble';
import { PARTICIPATION_VIVANTE } from '../../../routes/conversations/utils/access-control';
import { findFirstIn } from '../../../__tests__/helpers/mongo-where';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const GROUP = '64b7f0c2a1b2c3d4e5f6071a';
const USER = '64b7f0c2a1b2c3d4e5f6071b';

type MembershipRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly isActive: boolean;
  /** `undefined` = colonne ABSENTE du document, l'état de l'immense majorité. */
  readonly bannedAt?: Date | null;
};

/** La ligne du défaut : ACTIVE et BANNIE — celle que le filtre nu laisse passer. */
const bannedButActive: MembershipRow = {
  id: 'p-banni',
  conversationId: GROUP,
  userId: USER,
  isActive: true,
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
};

/** La ligne nominale : active, jamais bannie, donc colonne ABSENTE. */
const living: MembershipRow = { id: 'p-bob', conversationId: GROUP, userId: USER, isActive: true };

function harness(membership: MembershipRow) {
  const emitted: Array<{ readonly room: string; readonly event: string }> = [];
  const findFirst = jest.fn<any>(findFirstIn([membership as Record<string, unknown>]));
  const prisma = {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({
        conversationId: GROUP,
        conversation: { encryptionMode: 'server' },
      }),
    },
    message: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'm-live' }) },
    participant: { findFirst },
  };
  const reactions = {
    addReaction: jest.fn<any>().mockResolvedValue({ reaction: { id: 'r1' }, unchanged: false }),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ messageId: 'm-live' }),
  };
  const io = {
    to: (room: string) => ({ emit: (event: string) => void emitted.push({ room, event }) }),
  };

  return {
    findFirst,
    reactions,
    emitted,
    reflect: () =>
      reflectCallReactionOnBubble(
        { prisma: prisma as never, reactions: reactions as never, io: io as never },
        { callId: CALL, userId: USER, emoji: '👍' }
      ),
  };
}

describe('la réaction d’appel sur la bulle exige une participation VIVANTE (#19676)', () => {
  it('COMPORTEMENT — banni mais encore dans l’appel : rien n’est posé sur la bulle, rien n’est diffusé', async () => {
    const h = harness(bannedButActive);

    await expect(h.reflect()).resolves.toBe(false);
    expect(h.reactions.addReaction).not.toHaveBeenCalled();
    expect(h.emitted).toEqual([]);
  });

  it('COMPORTEMENT — la ligne nominale réagit toujours : resserrer ne refuse rien de légitime', async () => {
    const h = harness(living);

    await expect(h.reflect()).resolves.toBe(true);
    expect(h.reactions.addReaction).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: 'p-bob', allowCallBubble: true })
    );
  });

  it('PROJECTION — le `where` de l’auteur PORTE la loi, mot pour mot', async () => {
    const h = harness(living);

    await h.reflect();

    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: GROUP, userId: USER, ...PARTICIPATION_VIVANTE },
      })
    );
  });
});
