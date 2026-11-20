/**
 * @jest-environment node
 *
 * #19956 — le VRAI `associateAttachmentsToMessage` contre la VRAIE
 * `discardMessageAfterLinkFailure`. C'est le seul endroit où la justification
 * de la libération est vérifiable : elle n'existe QUE parce que le linker écrit
 * une pièce par requête, et ce fait-là disparaît dès qu'on double le linker.
 *
 * Le défaut qu'il garde est une COURSE. Tant que le linker rejetait par
 * `Promise.all`, il repartait à la première erreur en laissant les autres
 * écritures en vol ; la libération remettait `messageId` à `null`, ce qui
 * satisfait de nouveau le `where` d'une retardataire (`unsetOrNull`), et
 * celle-ci re-liait sa pièce au message qu'on était en train de supprimer.
 * La pièce de l'utilisateur était alors perdue des deux façons : détruite par
 * la cascade si l'écriture atterrissait avant, inéligible au rejeu à jamais si
 * elle atterrissait après.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
    warn: jest.fn(),
  },
}));

import { AttachmentService } from '../../attachments/AttachmentService';
import { discardMessageAfterLinkFailure, type AttachmentFailurePrisma } from '../attachmentFailureOutcome';
import { MESSAGE_SCOPED_MODELS } from '../messageScopedRows';

const MSG_ID = '507f1f77bcf86cd799439033';

type Row = { id: string; messageId: string | null };

/**
 * Une base en mémoire qui se comporte comme la production sur les deux points
 * dont ce témoin dépend : `updateMany` n'écrit que si le `where` matche ENCORE
 * au moment où il s'exécute, et `message.delete` émule la cascade
 * `onDelete: Cascade` de `MessageAttachment.message` que Prisma applique côté
 * client sur MongoDB.
 */
function makeStore(ids: readonly string[], failOn: string, holdBack: string) {
  const rows = new Map<string, Row>(ids.map((id) => [id, { id, messageId: null }]));
  const released: Array<() => void> = [];
  const prisma = {
    messageAttachment: {
      findMany: async () => [...rows.values()].map((r) => ({ id: r.id, effectFlags: 0 })),
      updateMany: async (args: { where: Record<string, any>; data: Record<string, any> }) => {
        const target: string | undefined = args.where?.id?.in?.[0];
        const run = () => {
          if (target !== undefined) {
            const row = rows.get(target);
            // `unsetOrNull('messageId')` : l'écriture n'a lieu que si la pièce
            // est ENCORE non liée au moment où elle s'exécute.
            if (row && row.messageId === null) row.messageId = args.data.messageId ?? null;
            return { count: 1 };
          }
          // La libération : `where: { messageId }`, sans condition de nullité.
          for (const row of rows.values()) if (row.messageId === args.where.messageId) row.messageId = null;
          return { count: 1 };
        };
        if (target === failOn) throw new Error('not primary');
        if (target === holdBack) {
          return new Promise((resolve) => released.push(() => resolve(run())));
        }
        return run();
      },
    },
    message: {
      delete: async () => {
        for (const [id, row] of [...rows.entries()]) if (row.messageId === MSG_ID) rows.delete(id);
        return { id: MSG_ID };
      },
    },
    ...Object.fromEntries(MESSAGE_SCOPED_MODELS.map((m) => [m, { deleteMany: async () => ({ count: 0 }) }])),
  } as unknown as AttachmentFailurePrisma;
  let alreadyReleased = false;
  const releaseHeld = () => {
    if (alreadyReleased) return;
    alreadyReleased = true;
    released.forEach((r) => r());
  };
  return { prisma, rows, releaseHeld };
}

describe('la libération n’est pas une course (#19956)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('aucune écriture du linker n’est encore en vol quand il rejette', async () => {
    const { prisma, rows, releaseHeld } = makeStore(['a', 'b', 'c'], 'b', 'c');
    const service = new AttachmentService(prisma as never);

    const linking = service.associateAttachmentsToMessage(['a', 'b', 'c'], MSG_ID);
    // `c` est retenue : si le linker rejetait par `Promise.all`, il repartirait
    // AVANT qu'elle n'atterrisse et la suite se jouerait pendant son vol.
    const settled = await Promise.race([
      linking.then(() => 'resolved' as const, () => 'rejected' as const),
      new Promise<'pending'>((r) => setImmediate(() => r('pending'))),
    ]);
    expect(settled).toBe('pending');

    releaseHeld();
    await expect(linking).rejects.toThrow('not primary');

    // Et au moment où il rejette, `c` a bien été écrite : plus rien en vol.
    expect(rows.get('c')?.messageId).toBe(MSG_ID);
  });

  it('rend TOUTES les pièces au rejeu, aucune détruite, aucune laissée liée', async () => {
    const { prisma, rows, releaseHeld } = makeStore(['a', 'b', 'c'], 'b', 'c');
    const service = new AttachmentService(prisma as never);

    // Le nettoyage est lancé dès que le linker ABANDONNE, exactement comme en
    // production. S'il a abandonné trop tôt, `c` atterrit APRÈS la libération
    // et se re-lie au message qu'on vient de supprimer ; s'il a attendu ses
    // écritures, il n'y a plus rien à atterrir et `releaseHeld` est un no-op.
    const linking = service.associateAttachmentsToMessage(['a', 'b', 'c'], MSG_ID);
    const gaveUp = await Promise.race([
      linking.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'in-flight'>((r) => setImmediate(() => r('in-flight'))),
    ]);
    if (gaveUp === 'in-flight') {
      releaseHeld();
      await expect(linking).rejects.toThrow('not primary');
    }

    await discardMessageAfterLinkFailure(prisma, { messageId: MSG_ID });
    releaseHeld();
    await new Promise((r) => setImmediate(r));

    // Les trois lignes existent encore — aucune emportée par la cascade…
    expect([...rows.keys()].sort()).toEqual(['a', 'b', 'c']);
    // …et les trois sont ÉLIGIBLES au rejeu : `unsetOrNull` les matchera.
    expect([...rows.values()].map((r) => r.messageId)).toEqual([null, null, null]);
  });

  it('efface ce qui PEND au message avant sa ligne — les enveloppes libsignal en tête', async () => {
    const { prisma } = makeStore(['a'], 'zzz', 'zzz');
    // Les doubles déclarent la forme de l'appel : sans paramètre, `jest.fn`
    // infère un mock à ZÉRO argument et `toHaveBeenCalledWith({…})` est un
    // `TS2554` que seul `tsconfig.test.json` voit.
    const envelopes = jest.fn(async (_args: { readonly where: { readonly messageId: string } }) => ({ count: 2 }));
    const del = jest.fn(async (_args: { readonly where: { readonly id: string } }) => ({ id: MSG_ID }));
    const spied = { ...prisma, messageEnvelope: { deleteMany: envelopes }, message: { delete: del } } as unknown as AttachmentFailurePrisma;

    await discardMessageAfterLinkFailure(spied, { messageId: MSG_ID });

    expect(envelopes).toHaveBeenCalledWith({ where: { messageId: MSG_ID } });
    expect(envelopes.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
  });
});
