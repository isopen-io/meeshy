/**
 * #19938 — une ligne de vivacité REPROJETÉE porte toutes les colonnes de la
 * loi, et c'est le TYPE qui le tient, plus une énumération recopiée.
 *
 * `MESSAGE_LIVENESS_SELECT` publie les trois colonnes que la loi interroge, et
 * le cliquet de #17208 garde que chaque consommateur les SÉLECTIONNE. Il ne
 * pouvait rien dire du cran d'après : un consommateur qui les demande bien,
 * puis REPROJETTE la ligne avant de la soumettre au verdict. `MessageLivenessRow`
 * ayant tous ses champs optionnels, une colonne perdue à la recopie ne fait
 * rougir ni `tsc` ni aucun témoin de verdict — la ligne amputée passe, et
 * `messageLivenessOf` rend `live`.
 *
 * C'est ce qui est arrivé à la lecture partagée du drain
 * (`socketio/queuedMessageFacts.ts`) : son `select` demandait `viewOnceBurnedAt`
 * et sa projection la jetait, sous un `as Array<…>` qui DÉCLARAIT la forme
 * amputée. Une vue unique dont le serveur a détruit le contenu était donc
 * rendue `live` au drain, et son clair rejoué au destinataire qui revient.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  MESSAGE_LIVENESS_SELECT,
  messageLivenessOf,
  messageLivenessRowOf,
} from '../../../services/messages/message-liveness';
import { readQueuedMessageFacts } from '../../../socketio/queuedMessageFacts';

const MSG = '507f1f77bcf86cd799439022';

describe('#19938 — la projection de la loi ne peut plus perdre une colonne', () => {
  it('`messageLivenessRowOf` porte EXACTEMENT les colonnes que le `select` demande', () => {
    const projected = messageLivenessRowOf({});

    expect(Object.keys(projected).sort()).toEqual(Object.keys(MESSAGE_LIVENESS_SELECT).sort());
  });

  it('une quatrième preuve de mort ajoutée au `select` sans la projection fait tomber ce cliquet', () => {
    // Le cliquet se LIT : la colonne qui entre dans la requête doit ressortir
    // de la recopie. C'est tout ce qu'il faut pour que l'oubli de #19938 ne se
    // rejoue pas — et il tombe sur la DÉCLARATION, avant tout scénario.
    for (const column of Object.keys(MESSAGE_LIVENESS_SELECT)) {
      expect(messageLivenessRowOf({})).toHaveProperty(column);
    }
  });

  it('la lecture partagée du drain rend une ligne dont le verdict est `view-once-burned`', async () => {
    const burned = new Date('2026-11-07T10:00:00Z');
    const prisma = {
      message: {
        findMany: async () => [{ id: MSG, createdAt: new Date('2026-11-06T09:00:00Z'), deletedAt: null, expiresAt: null, viewOnceBurnedAt: burned }],
      },
    } as unknown as Parameters<typeof readQueuedMessageFacts>[0];

    const facts = await readQueuedMessageFacts(prisma, [
      { messageId: MSG, conversationId: MSG, payload: {}, enqueuedAt: new Date().toISOString(), eventType: 'new' },
    ]);

    expect(facts.kind).toBe('read');
    if (facts.kind !== 'read') throw new Error('unreachable');
    expect(facts.byId.get(MSG)?.viewOnceBurnedAt).toEqual(burned);
    expect(messageLivenessOf(facts.byId.get(MSG))).toEqual({ liveness: 'gone', cause: 'view-once-burned' });
  });

  it('la lecture partagée DEMANDE les colonnes de la loi, sans en retaper la liste', () => {
    const asked: Record<string, unknown>[] = [];
    const prisma = {
      message: { findMany: async (args: { select: Record<string, unknown> }) => { asked.push(args.select); return []; } },
    } as unknown as Parameters<typeof readQueuedMessageFacts>[0];

    return readQueuedMessageFacts(prisma, [
      { messageId: MSG, conversationId: MSG, payload: {}, enqueuedAt: new Date().toISOString(), eventType: 'new' },
    ]).then(() => {
      for (const column of Object.keys(MESSAGE_LIVENESS_SELECT)) {
        expect(asked[0]?.[column]).toBe(true);
      }
    });
  });

  it('la lecture partagée n’affirme plus la forme de sa ligne par un `as` qui peut mentir', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../socketio/queuedMessageFacts.ts'),
      'utf8',
    );

    // Le `as Array<{ … }>` est ce qui a rendu la perte invisible à `tsc` : il
    // DÉCLARAIT une forme plus étroite que ce que le `select` ramène.
    expect(source).not.toMatch(/as Array<\{[^}]*deletedAt/);
    expect(source).toContain('messageLivenessRowOf(row)');
  });
});
