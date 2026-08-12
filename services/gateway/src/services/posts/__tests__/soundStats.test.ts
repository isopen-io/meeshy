import { foldSoundStats, loadSoundStats, EMPTY_SOUND_STATS } from '../soundStats';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe('foldSoundStats — dédoublonnage par publication', () => {
  it('ne compte qu_une_fois_une_publication_qui_pose_le_son_sur_plusieurs_pistes', () => {
    // Le cœur du sujet : `@@unique([postId, trackId])` autorise N lignes pour
    // une même publication. Sommer les LIGNES compterait ses 300 vues trois
    // fois et annoncerait « 3 utilisations » pour une seule story.
    const usages = [
      { soundId: 's1', postId: 'p1' },
      { soundId: 's1', postId: 'p1' },
      { soundId: 's1', postId: 'p1' },
    ];
    const stats = foldSoundStats(usages, new Map([['p1', 300]]));

    expect(stats.get('s1')).toEqual({ postCount: 1, playCount: 300 });
  });

  it('additionne_les_vues_de_publications_DISTINCTES', () => {
    const usages = [
      { soundId: 's1', postId: 'p1' },
      { soundId: 's1', postId: 'p2' },
    ];
    const stats = foldSoundStats(usages, new Map([['p1', 300], ['p2', 45]]));

    expect(stats.get('s1')).toEqual({ postCount: 2, playCount: 345 });
  });

  it('sépare_les_sons_sans_mélanger_leurs_publications', () => {
    const usages = [
      { soundId: 's1', postId: 'p1' },
      { soundId: 's2', postId: 'p2' },
      { soundId: 's2', postId: 'p3' },
    ];
    const stats = foldSoundStats(usages, new Map([['p1', 10], ['p2', 20], ['p3', 30]]));

    expect(stats.get('s1')).toEqual({ postCount: 1, playCount: 10 });
    expect(stats.get('s2')).toEqual({ postCount: 2, playCount: 50 });
  });

  it('exclut_des_DEUX_compteurs_une_publication_absente_de_la_map_visible', () => {
    // Absente = supprimée, expirée ou non publique. La laisser dans
    // `postCount` promettrait une ligne que la page du son n'affichera pas.
    const usages = [
      { soundId: 's1', postId: 'visible' },
      { soundId: 's1', postId: 'supprimee' },
    ];
    const stats = foldSoundStats(usages, new Map([['visible', 7]]));

    expect(stats.get('s1')).toEqual({ postCount: 1, playCount: 7 });
  });

  it('rend_zero_zero_quand_AUCUNE_publication_n_est_visible', () => {
    const usages = [{ soundId: 's1', postId: 'supprimee' }];
    const stats = foldSoundStats(usages, new Map());

    expect(stats.get('s1')).toEqual(EMPTY_SOUND_STATS);
  });

  it('compte_une_publication_visible_a_zero_vue_dans_postCount', () => {
    // 0 vue ≠ invisible. Confondre les deux ferait disparaître de « N
    // utilisations » toute publication fraîche que personne n'a encore ouverte.
    const stats = foldSoundStats([{ soundId: 's1', postId: 'p1' }], new Map([['p1', 0]]));

    expect(stats.get('s1')).toEqual({ postCount: 1, playCount: 0 });
  });

  it('omet_de_la_map_un_son_sans_aucun_usage', () => {
    const stats = foldSoundStats([], new Map([['p1', 99]]));
    expect(stats.size).toBe(0);
  });
});

describe('loadSoundStats', () => {
  const makePrisma = (overrides: any = {}) => ({
    soundUsage: { findMany: jest.fn().mockResolvedValue([]) },
    post: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  });

  it('ne_touche_PAS_la_base_pour_une_page_vide', async () => {
    const prisma = makePrisma();
    const stats = await loadSoundStats(prisma as any, []);

    expect(stats.size).toBe(0);
    expect(prisma.soundUsage.findMany).not.toHaveBeenCalled();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('interroge_les_usages_en_UNE_requete_pour_toute_la_page', async () => {
    // La garantie qui empêche le N+1 sur chaque défilement du sélecteur.
    const prisma = makePrisma({
      soundUsage: {
        findMany: jest.fn().mockResolvedValue([
          { soundId: 's1', postId: 'p1' },
          { soundId: 's2', postId: 'p2' },
        ]),
      },
      post: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', viewCount: 5 }, { id: 'p2', viewCount: 9 }]) },
    });

    const stats = await loadSoundStats(prisma as any, ['s1', 's2', 's3']);

    expect(prisma.soundUsage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.soundUsage.findMany.mock.calls[0][0].where.soundId.in).toEqual(['s1', 's2', 's3']);
    expect(stats.get('s1')).toEqual({ postCount: 1, playCount: 5 });
    expect(stats.get('s2')).toEqual({ postCount: 1, playCount: 9 });
  });

  it('filtre_les_publications_sur_PUBLIC_non_supprimee_non_expiree', async () => {
    const prisma = makePrisma({
      soundUsage: { findMany: jest.fn().mockResolvedValue([{ soundId: 's1', postId: 'p1' }]) },
    });

    await loadSoundStats(prisma as any, ['s1']);

    const where = prisma.post.findMany.mock.calls[0][0].where;
    expect(where.visibility).toBe('PUBLIC');
    expect(where.deletedAt).toEqual({ isSet: false });
    // Le prédicat d'expiration doit couvrir les trois formes que MongoDB
    // produit : champ absent, champ nul, date future.
    expect(where.OR).toEqual([
      { expiresAt: { isSet: false } },
      { expiresAt: null },
      { expiresAt: { gt: expect.any(Date) } },
    ]);
  });

  it('ne_charge_les_publications_qu_une_fois_meme_si_N_sons_partagent_la_meme', async () => {
    const prisma = makePrisma({
      soundUsage: {
        findMany: jest.fn().mockResolvedValue([
          { soundId: 's1', postId: 'p1' },
          { soundId: 's2', postId: 'p1' },
        ]),
      },
      post: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', viewCount: 4 }]) },
    });

    await loadSoundStats(prisma as any, ['s1', 's2']);

    expect(prisma.post.findMany.mock.calls[0][0].where.id.in).toEqual(['p1']);
  });

  it('court_circuite_la_requete_posts_quand_aucun_usage_n_existe', async () => {
    const prisma = makePrisma();
    await loadSoundStats(prisma as any, ['s1']);

    expect(prisma.soundUsage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('dedoublonne_les_ids_de_sons_recus', async () => {
    const prisma = makePrisma();
    await loadSoundStats(prisma as any, ['s1', 's1', 's1']);

    expect(prisma.soundUsage.findMany.mock.calls[0][0].where.soundId.in).toEqual(['s1']);
  });

  it('rend_une_map_vide_au_lieu_de_lever_quand_la_base_echoue', async () => {
    // Ces compteurs décorent une liste : les perdre doit coûter deux nombres,
    // pas la liste. Avaler est légitime ici parce que tout est recalculé à
    // chaque lecture — rien ne dérive.
    const prisma = makePrisma({
      soundUsage: { findMany: jest.fn().mockRejectedValue(new Error('mongo down')) },
    });

    await expect(loadSoundStats(prisma as any, ['s1'])).resolves.toEqual(new Map());
  });

  it('rend_une_map_vide_quand_la_SECONDE_requete_echoue', async () => {
    const prisma = makePrisma({
      soundUsage: { findMany: jest.fn().mockResolvedValue([{ soundId: 's1', postId: 'p1' }]) },
      post: { findMany: jest.fn().mockRejectedValue(new Error('mongo down')) },
    });

    await expect(loadSoundStats(prisma as any, ['s1'])).resolves.toEqual(new Map());
  });
});
