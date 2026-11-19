/**
 * Le POINT DE CONVERGENCE des réactions de message exige une participation
 * VIVANTE (#19604), et son sixième transport ne pouvait pas rougir (#19676).
 *
 * `ReactionService.addReaction` est l'endroit où les transports de réaction se
 * rejoignent — son propre doc-comment le dit (« tous la posent maintenant en un
 * seul point puisque tous convergent ici ») — et c'est là que vit le SECOND
 * verrou d'appartenance, `participants.some(p => p.id === participantId)`. Le
 * `where` qui alimente ce verrou épelait `isActive: true` NU, quand la loi du
 * dépôt est `PARTICIPATION_VIVANTE` : active **et** `bannedAt` nul ou absent
 * (`routes/conversations/utils/access-control.ts`, #7389).
 *
 * Sa jumelle, le MESSAGE, applique la loi à son propre point de convergence
 * (`services/messaging/MessagingService.ts` : le `where` du repli déprécié, et
 * le jugement de la ligne lue juste après). L'asymétrie était réelle.
 *
 * ─── Ce que la mesure a corrigé de l'énoncé de l'issue ────────────────────
 *
 * #19604 annonçait « DEUX lookups, `:116` et `:172` ». Mesuré : il n'y en a
 * **qu'UN** — l'`include` de `addReaction`. `removeReaction` ne lit AUCUNE
 * ligne de participation (il supprime par le triplet `messageId`/
 * `participantId`/`emoji`), et les deux `participant.findMany` du service
 * servent l'AFFICHAGE d'un trombinoscope de réacteurs, par id de réaction :
 * resserrer là retirerait le nom de l'auteur d'une réaction passée, ce qui
 * n'est pas une porte mais une archive.
 *
 * **Conséquence pour #19603** (« un membre banni peut-il encore RETIRER une
 * réaction ? ») : ce lot ne touche pas cet arbitrage, et ne peut pas le
 * toucher. `removeReaction` n'interroge pas la participation ; le témoin de
 * clôture `conversationClosedWriteVerbs.test.ts` § 3 reste vert. L'axe
 * BANNISSEMENT du retrait est gardé en AMONT, par les portes de #19525, et
 * c'est là qu'il se décidera.
 *
 * ─── DEUX témoins, et aucun ne subsume l'autre ────────────────────────────
 *
 * Le CLAUDE.md du service l'écrit : « un mock Prisma rend ce qu'on lui dit quel
 * que soit le `select` ». Un témoin de COMPORTEMENT passe donc au vert sur une
 * porte aveugle, et un témoin de PROJECTION ne dit rien de ce que le service
 * FAIT du verdict.
 *
 * Le COMPORTEMENT passe ici par `findUniqueIn` (`__tests__/helpers/mongo-where.ts`),
 * qui HONORE le `where` imbriqué de l'`include` — un double qui l'ignorerait
 * rendrait la ligne bannie quelle que soit la loi, et attesterait l'inverse de
 * ce qu'il prétend. La sémantique du `where` reste chez `matchesMongoWhere` :
 * une seconde jumelle de cette règle serait libre de diverger de la première.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { ReactionService } from '../ReactionService';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { findUniqueIn } from '../../__tests__/helpers/mongo-where';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const MESSAGE_ID = '507f191e810c19729de860ea';
const CONV_ID = '507f191e810c19729de860eb';
const PARTICIPANT_ID = '507f191e810c19729de860ec';

type MembershipRow = {
  readonly id: string;
  readonly userId: string | null;
  readonly isActive: boolean;
  /** `undefined` = colonne ABSENTE du document, l'état de l'immense majorité. */
  readonly bannedAt?: Date | null;
};

/**
 * La ligne du défaut : ACTIVE et BANNIE — celle que le filtre nu laisse passer.
 * Elle existe en base : bannir pendant qu'une ligne est INACTIVE n'écrit que
 * `bannedAt` (`conversationBanState.ts`), et `restore-for-me` rallumait
 * `isActive` avant #10436 — producteur fermé, aucune migration n'a repris les
 * lignes existantes. Un témoin posé sur une ligne SAINE ne peut pas tomber :
 * la loi et le filtre nu y rendent le même verdict.
 */
const bannedButActive: MembershipRow = {
  id: PARTICIPANT_ID,
  userId: 'user-banni',
  isActive: true,
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
};

/** La ligne nominale : active, jamais bannie, donc colonne ABSENTE. */
const living: MembershipRow = { id: PARTICIPANT_ID, userId: 'user-vivant', isActive: true };

const messageDocument = (membership: MembershipRow) => ({
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  senderId: 'sender-1',
  messageType: 'text',
  deletedAt: null,
  metadata: null,
  sender: { userId: 'auteur' },
  conversation: {
    id: CONV_ID,
    isActive: true,
    closedAt: null,
    encryptionMode: 'server',
    participants: [membership],
  },
});

/**
 * Le double REFUSE ce que le vrai client refuse, par la sémantique PARTAGÉE du
 * dépôt : clé ABSENTE traitée comme absente (jamais comme nulle), `isSet`
 * connu, et le `where` de la relation incluse HONORÉ.
 */
function buildService(membership: MembershipRow) {
  const findUnique = jest.fn<any>(findUniqueIn([messageDocument(membership) as Record<string, unknown>]));
  const upsert = jest.fn<any>();
  const prisma = {
    message: { findUnique },
    reaction: {
      // Une réaction DÉJÀ posée : le service rend `unchanged` juste après la
      // porte. Le chemin d'écriture n'a donc pas à être doublé, et ce qui est
      // attesté reste ce qui nous intéresse — la porte a-t-elle admis ?
      findFirst: jest.fn<any>().mockResolvedValue({
        id: 'reaction-1',
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
        createdAt: new Date('2026-11-18T00:00:00.000Z'),
      }),
      count: jest.fn<any>().mockResolvedValue(0),
      upsert,
    },
  } as unknown as PrismaClient;

  return { service: new ReactionService(prisma, null), findUnique, upsert };
}

const react = (service: ReactionService) =>
  service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '👍' });

describe('le point de convergence des réactions de message n’admet qu’une participation VIVANTE (#19604)', () => {
  it('COMPORTEMENT — une ligne active et BANNIE n’est plus un participant : la réaction est refusée, rien n’est écrit', async () => {
    const { service, upsert } = buildService(bannedButActive);

    await expect(react(service)).rejects.toThrow('User is not a participant of this conversation');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('COMPORTEMENT — la ligne nominale passe la porte : resserrer ne refuse rien de légitime', async () => {
    const { service } = buildService(living);

    await expect(react(service)).resolves.toEqual(
      expect.objectContaining({ unchanged: true })
    );
  });

  it('PROJECTION — le `where` de la relation incluse PORTE la loi, mot pour mot', async () => {
    const { service, findUnique } = buildService(living);

    await react(service);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          conversation: expect.objectContaining({
            include: { participants: { where: PARTICIPATION_VIVANTE } },
          }),
        }),
      })
    );
  });
});
