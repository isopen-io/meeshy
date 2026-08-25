/**
 * Le BALAYAGE des `PostMedia` restés en attente.
 *
 * ─── LE TROU QUE CE MODULE FERME ──────────────────────────────────────────
 * Un média du composer web naissait `MessageAttachment(messageId: null)` —
 * une forme MOISSONNÉE : `MaintenanceService.cleanupOrphanedAttachments`
 * détruit lignes ET fichiers après 24 h. Depuis que le composer de
 * publication tague ses uploads (`uploadcontext`), le même média naît
 * `PostMedia(postId: null)` — une forme que RIEN ne moissonne. Le dépôt le
 * disait déjà lui-même, dans `reclaimPostMediaBytes.ts` : « MaintenanceService
 * ne ramasse que les MessageAttachment orphelins, jamais les PostMedia ;
 * OrphanMediaCleanupService ne connaît que sa propre boîte d'envoi ».
 *
 * Le déclencheur est le geste le plus banal du produit : ouvrir le composer,
 * joindre trois photos, fermer sans publier. Aucun composer n'appelle
 * `clearAttachments` ailleurs que dans `handlePublish`.
 *
 * Aggravant : l'URL publique d'un média est servie SANS authentification
 * (`GET /attachments/file/*` n'a aucune `preValidation`) — une URL-capacité
 * que seul l'`unlink` révoque.
 *
 * ─── LE PRÉDICAT EST CELUI DE LA RÉCLAMATION ──────────────────────────────
 * « Libre » se dit d'UN seul endroit : `unclaimedMediaWhere()`, dont
 * `claimableMediaWhere` est la version propriétaire. Un balayage qui
 * redéfinirait « libre » pour son compte divergerait un jour de ce que la
 * publication considère comme réclamable — et détruirait des médias
 * réclamables, ou en laisserait d'irréclamables.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { sweepPendingPostMedia } from '../sweepPendingPostMedia';
import { unclaimedMediaWhere } from '../mediaOwnership';
import { matchesWhere, type MongoDoc } from './helpers/mongoWhereMatcher';

const NOW = new Date('2026-08-25T12:00:00Z');
const CUTOFF = new Date('2026-08-24T12:00:00Z');

const OLD = new Date('2026-08-20T00:00:00Z');
const RECENT = new Date('2026-08-25T11:00:00Z');

function makePrisma(docs: MongoDoc[]) {
  const calls: string[] = [];
  const findMany = jest.fn<any>(async (args: any) => {
    calls.push('find');
    return docs
      .filter((doc) => matchesWhere(doc, args.where))
      .map((doc) => ({ id: doc.id, fileUrl: doc.fileUrl ?? null, thumbnailUrl: doc.thumbnailUrl ?? null }));
  });
  const deleteMany = jest.fn<any>(async (args: any) => {
    calls.push('rows');
    const gone = docs.filter((doc) => matchesWhere(doc, args.where));
    return { count: gone.length };
  });
  const soundFindMany = jest.fn<any>(async () => []);
  const storageDelete = jest.fn<any>(async () => {
    calls.push('bytes');
  });

  return {
    prisma: { postMedia: { findMany, deleteMany }, sound: { findMany: soundFindMany } } as any,
    storage: { delete: storageDelete },
    findMany,
    deleteMany,
    storageDelete,
    calls,
  };
}

describe('sweepPendingPostMedia', () => {
  it('demande les médias LIBRES depuis plus longtemps que le seuil, avec le prédicat PARTAGÉ', async () => {
    const { prisma, storage, findMany } = makePrisma([]);

    await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF });

    const args = findMany.mock.calls[0][0] as any;
    // Le prédicat de « libre » ne se réécrit pas ici : il vient du site UNIQUE
    // que la réclamation utilise.
    expect(args.where).toEqual({ ...unclaimedMediaWhere(), createdAt: { lt: CUTOFF } });
    expect(args.select).toEqual({ id: true, fileUrl: true, thumbnailUrl: true });
  });

  it('détruit un média abandonné : les OCTETS d’abord, la LIGNE ensuite', async () => {
    const { prisma, storage, deleteMany, storageDelete, calls } = makePrisma([
      { id: 'abandonne', postId: null, uploaderId: 'u1', createdAt: OLD, fileUrl: 'https://cdn/a.jpg', thumbnailUrl: 'https://cdn/a-t.jpg' },
    ]);

    const result = await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF });

    expect(storageDelete).toHaveBeenCalledWith('https://cdn/a.jpg');
    expect(storageDelete).toHaveBeenCalledWith('https://cdn/a-t.jpg');
    expect(deleteMany).toHaveBeenCalled();
    // Une ligne partie, plus rien ne dit où sont ses octets — le même ordre
    // que la route DELETE et que le balayage éphémère.
    expect(calls.indexOf('bytes')).toBeLessThan(calls.indexOf('rows'));
    expect(result.swept).toBe(1);
    expect(result.reclaimed).toBe(2);
  });

  it('ÉPARGNE un média déjà rattaché à un post', async () => {
    const { prisma, storage, deleteMany, storageDelete } = makePrisma([
      { id: 'publie', postId: 'post-1', uploaderId: 'u1', createdAt: OLD, fileUrl: 'https://cdn/p.jpg' },
    ]);

    const result = await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF });

    expect(storageDelete).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.swept).toBe(0);
  });

  it('ÉPARGNE un média rattaché à un COMMENTAIRE', async () => {
    const { prisma, storage, storageDelete } = makePrisma([
      { id: 'commente', postId: null, commentId: 'c-1', uploaderId: 'u1', createdAt: OLD, fileUrl: 'https://cdn/c.jpg' },
    ]);

    const result = await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF });

    expect(storageDelete).not.toHaveBeenCalled();
    expect(result.swept).toBe(0);
  });

  it('ÉPARGNE un média en attente ENCORE JEUNE — un composer ouvert n’est pas un abandon', async () => {
    const { prisma, storage, storageDelete } = makePrisma([
      { id: 'en-cours', postId: null, uploaderId: 'u1', createdAt: RECENT, fileUrl: 'https://cdn/r.jpg' },
    ]);

    const result = await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF });

    expect(storageDelete).not.toHaveBeenCalled();
    expect(result.swept).toBe(0);
  });

  it('ÉPARGNE un média dont le `commentId` est ABSENT du document — la forme TUS réelle', async () => {
    // Réciproque du piège prod 2026-07-31 : `commentId` n'est jamais écrit par
    // le handler TUS. Un balayage qui exigerait `commentId: null` ne verrait
    // AUCUN média abandonné, et le trou resterait ouvert en silence.
    const { prisma, storage, storageDelete } = makePrisma([
      { id: 'tus', postId: null, uploaderId: 'u1', createdAt: OLD, fileUrl: 'https://cdn/t.jpg' },
    ]);

    const result = await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF });

    expect(storageDelete).toHaveBeenCalledWith('https://cdn/t.jpg');
    expect(result.swept).toBe(1);
  });

  it('re-pose la garde « libre » sur la DESTRUCTION, pas seulement sur la lecture', async () => {
    // Entre la lecture et la destruction, une publication peut réclamer le
    // média. La fenêtre est infime (24 h d'attente puis une réclamation en
    // quelques millisecondes) mais la garde ne coûte rien, et sans elle la
    // LIGNE d'un média fraîchement publié partirait.
    const { prisma, storage, deleteMany } = makePrisma([
      { id: 'abandonne', postId: null, uploaderId: 'u1', createdAt: OLD, fileUrl: 'https://cdn/a.jpg' },
    ]);

    await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF });

    expect(deleteMany.mock.calls[0][0].where).toEqual({
      id: { in: ['abandonne'] },
      ...unclaimedMediaWhere(),
    });
  });

  it('borne la fournée — un balayage n’ouvre pas la base entière d’un coup', async () => {
    const { prisma, storage, findMany } = makePrisma([]);

    await sweepPendingPostMedia(prisma, storage, { olderThan: CUTOFF, batchSize: 42 });

    expect((findMany.mock.calls[0][0] as any).take).toBe(42);
  });

  it('n’écrit RIEN quand aucun média n’est abandonné', async () => {
    const { prisma, storage, deleteMany, storageDelete } = makePrisma([]);

    const result = await sweepPendingPostMedia(prisma, storage, { olderThan: NOW });

    expect(storageDelete).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ swept: 0, reclaimed: 0 });
  });
});
