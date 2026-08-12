/**
 * Le quatrième effet durable d'un retrait de post, extrait de son unique
 * appelant pour qu'un second puisse l'appliquer.
 *
 * `applyPostRemovalEffects` désactivait les `/l/<token>` en ligne, dans son
 * corps. Le balayage du contenu éphémère — l'AUTRE chemin qui rend un post
 * définitivement inatteignable, et le seul qui le DÉTRUISE — ne le faisait
 * pas : `TrackingLink.targetId` n'a ni relation ni cascade vers `Post`, donc
 * la destruction laissait le lien vivant, `isActive: true`, pointant sur un
 * post qui n'existe plus. Le `/l/<token>` continuait de compter son clic puis
 * de rediriger vers une page morte.
 *
 * La règle vit désormais dans son propre module : deux chemins l'appliquent,
 * aucun ne la réécrit.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { deactivatePostTrackingLinks } from '../deactivatePostTrackingLinks';

const POST_A = '507f1f77bcf86cd799439011';
const POST_B = '507f1f77bcf86cd799439012';

const updateMany = jest.fn<any>();
const prisma = { trackingLink: { updateMany } } as any;

beforeEach(() => {
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 0 });
});

describe('deactivatePostTrackingLinks', () => {
  it('test_deactivate_severalPosts_deactivatesEveryLinkOfTheSet', async () => {
    await deactivatePostTrackingLinks(prisma, [POST_A, POST_B]);

    expect(updateMany).toHaveBeenCalledWith({
      where: { targetId: { in: [POST_A, POST_B] } },
      data: { isActive: false },
    });
  });

  /**
   * Le lien n'est pas SUPPRIMÉ : ses `TrackingLinkClick` sont une histoire
   * d'audience qui survit à sa cible, et le tableau de bord du partageur les
   * lit encore. C'est aussi ce que fait le retrait interactif depuis toujours —
   * l'extraction ne change pas le geste, elle lui donne un second appelant.
   */
  it('test_deactivate_neverDeletesTheLinkRows', async () => {
    const deleteMany = jest.fn<any>();
    await deactivatePostTrackingLinks(
      { trackingLink: { updateMany, deleteMany } } as any,
      [POST_A],
    );

    expect(deleteMany).not.toHaveBeenCalled();
  });

  /**
   * Une liste vide n'est pas un `$in: []` à envoyer à Mongo : c'est une
   * question qui n'a pas lieu d'être posée. Le balayage horaire tombe sur ce
   * cas à chaque passe où rien n'a expiré — c'est-à-dire la plupart du temps.
   * Même contrat que `retractPostNotifications`, son voisin dans la même liste
   * d'effets.
   */
  it('test_deactivate_emptyList_asksNothing', async () => {
    await deactivatePostTrackingLinks(prisma, []);

    expect(updateMany).not.toHaveBeenCalled();
  });

  /**
   * Il REJETTE, il n'avale pas. C'est l'appelant qui décide du régime : le
   * retrait interactif est best-effort (`deletedAt` est déjà committé quand il
   * s'exécute), le balayage doit au contraire renoncer à détruire — un lien
   * laissé actif alors que son post a disparu n'est plus rattrapable par aucune
   * passe, puisque la suivante ne verra plus le post.
   */
  it('test_deactivate_failure_rejectsInsteadOfSwallowing', async () => {
    updateMany.mockRejectedValue(new Error('mongo down'));

    await expect(deactivatePostTrackingLinks(prisma, [POST_A])).rejects.toThrow('mongo down');
  });
});
