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
 * ─── Pourquoi ce n'est PAS un piège armé, et par quel chemin ──────────────
 *
 * Le seul verrou en amont est `resolveActiveCallParticipant`
 * (`socketio/call-participants.ts`), et il ne pose que la question de la
 * participation à la SESSION D'APPEL (`!p.leftAt`) — jamais celle de
 * l'appartenance à la CONVERSATION.
 *
 * **Le chemin n'est pas « bannir pendant l'appel »**, et le dire ainsi serait
 * faux : `resolveBanWrite` (`conversationBanState.ts`, seul écrivain de
 * `bannedAt`) écrit `isActive: false` quand la cible est ACTIVE, donc le filtre
 * NU refusait déjà ce cas — et le bannissement sort en prime la personne de
 * l'appel (`endCallParticipationForDepartedMember`).
 *
 * L'état `isActive: true, bannedAt ≠ null` est produit par une COURSE :
 * `REJOIN_PARTICIPANT_STATE` rallume `isActive` sans effacer `bannedAt`
 * (délibérément : « une rentrée ne débannit personne, et les trois portes
 * refusent un banni en amont »), et les trois portes de rentrée n'ont pas la
 * garde que `restore-for-me` porte DANS son `where`. Un bannissement qui tombe
 * entre la décision `rejoin` et son écriture laisse donc la ligne vivante ET
 * bannie — #19688, qui tarit la source.
 *
 * Avec cette ligne, l'emoji était persisté sur la bulle du fil, diffusé en
 * `reaction:added` à toute la room de la conversation, et faisait remonter
 * cette conversation en tête de la liste de chaque participant.
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
import { participantKeyWhere } from '../../../socketio/departed-member-participant-where';
import { findFirstIn } from '../../../__tests__/helpers/mongo-where';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const GROUP = '64b7f0c2a1b2c3d4e5f6071a';
const USER = '64b7f0c2a1b2c3d4e5f6071b';

type MembershipRow = {
  readonly id: string;
  readonly conversationId: string;
  /** ABSENT pour un invité de lien : il n'a aucune ligne `User` à viser. */
  readonly userId?: string;
  readonly type?: string;
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

/**
 * L'INVITÉ DE LIEN : aucune colonne `userId`, et la clé que la socket remet est
 * son propre `Participant.id`. C'est la seconde question à laquelle ce `where`
 * répondait faux, et son symptôme était un `return false` silencieux — jamais
 * une erreur.
 */
const linkGuest: MembershipRow = { id: USER, conversationId: GROUP, type: 'anonymous', isActive: true };

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
  it('COMPORTEMENT — une ligne vivante ET bannie (course de rentrée) : rien n’est posé sur la bulle, rien n’est diffusé', async () => {
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

  it('COMPORTEMENT — un INVITÉ DE LIEN réagit sur la bulle : sa clé est son `Participant.id`, pas un `userId`', async () => {
    const h = harness(linkGuest);

    await expect(h.reflect()).resolves.toBe(true);
    expect(h.reactions.addReaction).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: USER, allowCallBubble: true })
    );
  });

  it('PROJECTION — le `where` PORTE les DEUX prédicats, composés par `AND` et non par spread', async () => {
    const h = harness(living);

    await h.reflect();

    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: GROUP, AND: [participantKeyWhere(USER), PARTICIPATION_VIVANTE] },
      })
    );
  });

  it('PROJECTION — aucun des deux `OR` n’écrase l’autre : le `where` émis en porte DEUX', () => {
    // Le piège de composition, assert sur la FORME plutôt que sur un
    // commentaire : `participantKeyWhere` et `PARTICIPATION_VIVANTE` rendent
    // chacun une clé `OR`, et un double spread n'en laisserait qu'UNE.
    const spread = { ...participantKeyWhere(USER), ...PARTICIPATION_VIVANTE };
    expect(Object.keys(spread).filter((k) => k === 'OR')).toHaveLength(1);
    expect(spread.OR).toEqual(PARTICIPATION_VIVANTE.OR);

    const composed = { AND: [participantKeyWhere(USER), PARTICIPATION_VIVANTE] };
    expect(composed.AND.filter((branch) => 'OR' in branch)).toHaveLength(2);
  });
});
