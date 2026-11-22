/**
 * LA PORTE D'ENTRÉE D'UN APPEL EXIGE UNE PARTICIPATION VIVANTE (#20310).
 *
 * `resolveParticipantId` (`socketio/call-participants.ts`) est l'UNIQUE porte
 * d'appartenance des deux événements qui font entrer dans un appel —
 * `call:initiate` (`CallEventsHandler.ts:1919`) et `call:join`
 * (`:2112` → `resolveJoinParticipantId` → `resolveParticipantIdFromCall`).
 * Elle portait `isActive: true` NU.
 *
 * ─── L'asymétrie qui rend le défaut net ───────────────────────────────────
 *
 * Soixante lignes sous l'appel de cette porte, l'éventail qui décide QUI SONNE
 * épelle `...PARTICIPATION_VIVANTE` (`CallEventsHandler.ts:1977-1981`). Un
 * membre actif-et-banni ne pouvait donc pas être SONNÉ — mais il pouvait
 * SONNER. C'est la distinction « qui REÇOIT » / « qui entre » du `CLAUDE.md`
 * de la passerelle, appliquée à l'audience et oubliée sur la porte.
 *
 * ─── Et aucun des deux cliquets ne pouvait le voir ────────────────────────
 *
 * Le cliquet des PORTES ne le voit pas : la clé est cachée derrière le spread
 * `...participantKeyWhere(userId)`, donc son discriminant d'identité rend
 * `false`. Le cliquet des AUDIENCES ne le PUBLIE que comme
 * `call-participants.ts:35 findFirst clé-indirecte` dans
 * `sweepUnjudgeableParticipantReads()` — une liste que son témoin se contente
 * de COMPTER, sans jamais l'énumérer. `call-participants.ts` n'est donc dans
 * aucun des cinq inventaires, pendant que les deux clauses de `CallService`
 * qu'il alimente y figurent : **la tête de la chaîne était invisible aux deux
 * cliquets pendant que son milieu était inventorié.**
 *
 * ─── DEUX témoins, et aucun ne subsume l'autre ────────────────────────────
 *
 * Le COMPORTEMENT passe par `findFirstIn` (`__tests__/helpers/mongo-where.ts`),
 * qui refuse ce que le vrai client refuse — un double qui rend la ligne quel
 * que soit le `where` resterait VERT sous la mutation. La PROJECTION assert sur
 * la REQUÊTE, seule à voir le piège de composition : `participantKeyWhere` et
 * `PARTICIPATION_VIVANTE` rendent CHACUN une clé `OR`, et un double spread n'en
 * laisserait qu'UNE — la seconde écrasant la première en silence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  resolveParticipantId,
  resolveParticipantIdFromCall,
} from '../call-participants';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { participantKeyWhere } from '../departed-member-participant-where';
import { findFirstIn } from '../../__tests__/helpers/mongo-where';

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

/**
 * La ligne du défaut : ACTIVE et BANNIE. Produite par une COURSE — une rentrée
 * rallume `isActive` sans effacer `bannedAt` (#19688 tarit la source, la
 * migration des lignes existantes n'a été jouée nulle part).
 */
const bannedButActive: MembershipRow = {
  id: 'p-banni',
  conversationId: GROUP,
  userId: USER,
  isActive: true,
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
};

/** La ligne nominale : active, jamais bannie, donc colonne ABSENTE. */
const living: MembershipRow = { id: 'p-bob', conversationId: GROUP, userId: USER, isActive: true };

/** L'INVITÉ DE LIEN : aucune colonne `userId`, sa clé est son propre `Participant.id`. */
const linkGuest: MembershipRow = { id: USER, conversationId: GROUP, type: 'anonymous', isActive: true };

function harness(membership: MembershipRow) {
  const findFirst = jest.fn<any>(findFirstIn([membership as Record<string, unknown>]));
  const prisma = {
    participant: { findFirst },
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: GROUP }),
    },
  };
  const deps = { prisma: prisma as never, callService: {} as never };
  return { findFirst, deps };
}

describe('la porte d’entrée d’un appel exige une participation VIVANTE (#20310)', () => {
  it('COMPORTEMENT — `call:initiate` : une ligne vivante ET bannie n’ouvre aucune porte', async () => {
    const h = harness(bannedButActive);
    await expect(resolveParticipantId(h.deps, USER, GROUP)).resolves.toBeNull();
  });

  it('COMPORTEMENT — `call:join` : la même ligne ne résout rien depuis l’appel non plus', async () => {
    const h = harness(bannedButActive);
    await expect(resolveParticipantIdFromCall(h.deps, USER, CALL)).resolves.toBeNull();
  });

  it('COMPORTEMENT — la ligne nominale entre toujours : resserrer ne refuse rien de légitime', async () => {
    const h = harness(living);
    await expect(resolveParticipantId(h.deps, USER, GROUP)).resolves.toBe('p-bob');
  });

  it('COMPORTEMENT — un INVITÉ DE LIEN entre : sa clé est son `Participant.id`, pas un `userId`', async () => {
    const h = harness(linkGuest);
    await expect(resolveParticipantId(h.deps, USER, GROUP)).resolves.toBe(USER);
  });

  it('PROJECTION — le `where` porte les DEUX prédicats, composés par `AND` et non par spread', async () => {
    const h = harness(living);

    await resolveParticipantId(h.deps, USER, GROUP);

    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: GROUP, AND: [participantKeyWhere(USER), PARTICIPATION_VIVANTE] },
      })
    );
  });

  it('PROJECTION — le piège de composition : deux `OR` spreadés n’en laissent qu’UN', () => {
    // Assert sur la FORME plutôt que sur un commentaire : c'est ce qui rend la
    // réparation par spread impossible à livrer sans faire rougir ce fichier.
    const spread = { ...participantKeyWhere(USER), ...PARTICIPATION_VIVANTE };
    expect(Object.keys(spread).filter((k) => k === 'OR')).toHaveLength(1);
    expect(spread.OR).toEqual(PARTICIPATION_VIVANTE.OR);

    const composed = { AND: [participantKeyWhere(USER), PARTICIPATION_VIVANTE] };
    expect(composed.AND.filter((branch) => 'OR' in branch)).toHaveLength(2);
  });
});
