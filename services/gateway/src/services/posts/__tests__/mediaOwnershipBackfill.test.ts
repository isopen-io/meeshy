import { backfillPostMediaUploader } from '../mediaOwnershipBackfill';

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439012';

function makePrisma(media: Array<Record<string, unknown>>, posts: Array<{ id: string; authorId: string }> = [],
                    comments: Array<{ id: string; authorId: string }> = []) {
  const updates: Array<{ id: string; uploaderId: string }> = [];
  let served = false;
  return {
    updates,
    postMedia: {
      // Une seule page : le second appel rend vide, ce qui termine la boucle.
      findMany: jest.fn(async () => {
        if (served) return [];
        served = true;
        return media;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        updates.push({ id: where.id, uploaderId: data.uploaderId });
        return {};
      }),
    },
    post: { findMany: jest.fn(async () => posts) },
    postComment: { findMany: jest.fn(async () => comments) },
  };
}

describe('backfillPostMediaUploader', () => {
  it('resout_un_media_rattache_par_lauteur_du_post', async () => {
    const prisma = makePrisma(
      [{ id: 'm1', postId: 'p1', commentId: null, filePath: `2026/07/${BOB}/x.jpg` }],
      [{ id: 'p1', authorId: ALICE }],
    );

    const report = await backfillPostMediaUploader(prisma as any, { apply: true });

    // L'auteur du post PRIME sur le chemin : c'est un fait, l'autre une
    // inférence. Ici les deux divergent et c'est le fait qui doit gagner.
    expect(prisma.updates).toEqual([{ id: 'm1', uploaderId: ALICE }]);
    expect(report.fromPost).toBe(1);
    expect(report.fromFilePath).toBe(0);
  });

  it('resout_un_media_de_commentaire_par_son_auteur', async () => {
    const prisma = makePrisma(
      [{ id: 'm1', postId: null, commentId: 'c1', filePath: null }],
      [], [{ id: 'c1', authorId: BOB }],
    );

    const report = await backfillPostMediaUploader(prisma as any, { apply: true });

    expect(prisma.updates).toEqual([{ id: 'm1', uploaderId: BOB }]);
    expect(report.fromComment).toBe(1);
  });

  it('resout_un_media_EN_ATTENTE_par_le_chemin_de_stockage', async () => {
    // Le cas qui compte : ces médias-là sont les seuls réclamables, donc les
    // seuls vulnérables, et rien d'autre ne porte leur uploadeur.
    const prisma = makePrisma([{ id: 'm1', postId: null, commentId: null, filePath: `2026/07/${ALICE}/x.jpg` }]);

    const report = await backfillPostMediaUploader(prisma as any, { apply: true });

    expect(prisma.updates).toEqual([{ id: 'm1', uploaderId: ALICE }]);
    expect(report.fromFilePath).toBe(1);
  });

  it('compte_a_part_les_NON_RESOLUS_encore_reclamables', async () => {
    // C'est ce chiffre, et lui seul, qui autorise la phase 2.
    const prisma = makePrisma([
      { id: 'libre', postId: null, commentId: null, filePath: '2026/07/anonymous/x.jpg' },
      { id: 'rattache', postId: 'p-inconnu', commentId: null, filePath: 'x.jpg' },
    ]);

    const report = await backfillPostMediaUploader(prisma as any, { apply: true });

    expect(report.unresolved).toBe(2);
    // Un média déjà rattaché n'est plus réclamable : c'est une lacune
    // d'inventaire, pas une faille — le confondre gonflerait le seul chiffre
    // qui doit tomber à zéro et bloquerait la phase 2 pour rien.
    expect(report.unresolvedClaimable).toBe(1);
    expect(prisma.updates).toEqual([]);
  });

  it('nECRIT_RIEN_sans_apply', async () => {
    const prisma = makePrisma([{ id: 'm1', postId: null, commentId: null, filePath: `2026/07/${ALICE}/x.jpg` }]);

    const report = await backfillPostMediaUploader(prisma as any, { apply: false });

    expect(prisma.postMedia.update).not.toHaveBeenCalled();
    // Le rapport reste COMPLET à blanc : c'est lui qui sert à décider.
    expect(report.fromFilePath).toBe(1);
  });

  it('ne_balaye_que_les_lignes_SANS_proprietaire_sous_les_deux_formes', async () => {
    const prisma = makePrisma([]);
    await backfillPostMediaUploader(prisma as any, { apply: false });

    // MongoDB distingue un champ ABSENT d'un champ nul : n'en filtrer qu'une
    // laisserait la moitié des lignes héritées hors du rattrapage.
    const where = (prisma.postMedia.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { uploaderId: null },
      { uploaderId: { isSet: false } },
    ]);
  });

  it('charge_les_auteurs_par_LOT_et_non_un_par_media', async () => {
    const prisma = makePrisma(
      [
        { id: 'm1', postId: 'p1', commentId: null, filePath: null },
        { id: 'm2', postId: 'p2', commentId: null, filePath: null },
      ],
      [{ id: 'p1', authorId: ALICE }, { id: 'p2', authorId: BOB }],
    );

    await backfillPostMediaUploader(prisma as any, { apply: true });

    expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.updates).toEqual([
      { id: 'm1', uploaderId: ALICE },
      { id: 'm2', uploaderId: BOB },
    ]);
  });

  it('signale_chaque_non_resolu_a_lappelant', async () => {
    const seen: Array<{ mediaId: string; claimable: boolean }> = [];
    const prisma = makePrisma([{ id: 'm1', postId: null, commentId: null, filePath: null }]);

    await backfillPostMediaUploader(prisma as any, {
      apply: false,
      onUnresolved: ({ mediaId, claimable }) => seen.push({ mediaId, claimable }),
    });

    expect(seen).toEqual([{ mediaId: 'm1', claimable: true }]);
  });
});
