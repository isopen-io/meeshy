/**
 * #20111 — LA LOI DE LA PARTICIPATION VIVANTE SE GARDE CHEZ ELLE.
 *
 * Elle vivait dans `services/gateway/src/routes/conversations/utils/access-control.ts`
 * et a déménagé ici pour que `services/agent` puisse l'importer. Le
 * déménagement a un COÛT que ce fichier existe pour payer, et il a été mesuré :
 * le cliquet des égalités nues de la passerelle
 * (`soft-state-equality-filter-guard.test.ts`) RÉSOLVAIT `PARTICIPATION_VIVANTE`
 * tant qu'elle était un `const` local, et pouvait donc vérifier qu'elle ne
 * cachait pas un `bannedAt: null` nu. Importée d'un autre paquet, elle lui est
 * OPAQUE — elle est désormais dans son inventaire `HORS_DE_PORTEE`.
 *
 * > **Déplacer une constante hors d'un paquet la retire des instruments de ce
 * > paquet.** Le gain (un second paquet peut l'importer) et la perte (un
 * > cliquet ne la voit plus) arrivent dans le même commit, et seul le gain est
 * > visible. La question à poser à tout déménagement : **qu'est-ce qui, à
 * > l'ancienne adresse, savait lire ce que je déplace ?**
 *
 * Ce que ces témoins garantissent, et c'est exactement ce que le cliquet
 * perdu garantissait :
 *
 * - la loi dit l'absence dans le MÊME `OR` que le `null` — `bannedAt: null` nu
 *   n'apparie PAS la clé absente sur MongoDB, donc l'écrire ainsi fermerait
 *   chaque conversation à toute la population jamais bannie ;
 * - `isActive` est comparé à `true`, pas seulement « non faux » ;
 * - `participationEstVivante` rend le MÊME verdict que le `where`, sur les
 *   quatre états qu'une ligne peut porter.
 */
import { describe, it, expect } from 'vitest';
import { PARTICIPATION_VIVANTE, participationEstVivante } from '../participation-vivante';

describe('#20111 — PARTICIPATION_VIVANTE', () => {
  it('dit les DEUX états de « pas banni » dans un seul `OR`', () => {
    expect(PARTICIPATION_VIVANTE).toEqual({
      isActive: true,
      OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }],
    });
  });

  /**
   * Le témoin qui tombe si quelqu'un « simplifie » la loi en égalité nue. Il
   * n'assert pas la forme (le témoin ci-dessus le fait) mais la PROPRIÉTÉ :
   * chaque branche de l'`OR` contraint `bannedAt`, et aucune n'est une porte de
   * sortie. C'est la même règle que `guardsAgainstBan` applique au texte des
   * `where` du dépôt, appliquée ici à la valeur.
   */
  it('n’offre aucune branche qui ne contraigne `bannedAt`', () => {
    const branches = PARTICIPATION_VIVANTE.OR as readonly Record<string, unknown>[];

    expect(branches.length).toBeGreaterThan(1);
    for (const branche of branches) {
      expect(Object.keys(branche)).toEqual(['bannedAt']);
    }
  });

  it('exige `isActive` VRAI, pas seulement « non faux »', () => {
    expect(PARTICIPATION_VIVANTE.isActive).toBe(true);
  });

  it.each([
    ['active, `bannedAt` ABSENT', { isActive: true }, true],
    ['active, `bannedAt` nul', { isActive: true, bannedAt: null }, true],
    ['active et BANNIE', { isActive: true, bannedAt: new Date('2026-11-01') }, false],
    ['inactive', { isActive: false }, false],
    ['`isActive` absent', {}, false],
    ['`isActive` nul', { isActive: null }, false],
  ])('participationEstVivante rend le même verdict que le `where` — %s', (_nom, ligne, attendu) => {
    expect(participationEstVivante(ligne)).toBe(attendu);
  });
});
