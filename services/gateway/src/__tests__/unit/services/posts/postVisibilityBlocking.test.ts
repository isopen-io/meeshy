/**
 * **AUCUN CONTENU NE TRAVERSE UN BLOCAGE, DANS LES DEUX SENS** (#7184).
 *
 * ## Le fait mesuré avant ce lot
 *
 * `buildPostVisibilityOrFilter` servait `{ visibility: PostVisibility.PUBLIC }`
 * **sans aucune contrainte d'auteur**, et `PUBLIC` est le défaut Prisma
 * (`schema.prisma:3307`). Mesuré : le mot `block` n'apparaissait pas une seule
 * fois dans `postVisibility.ts`, ni sur le chemin `getStories` de
 * `PostFeedService`. Une personne bloquée voyait donc les publications, les
 * réels et les stories publiques de celle qui l'avait bloquée.
 *
 * ## ICI LA SYMÉTRIE EST JUSTE — contrairement au profil
 *
 * La garde jumelle de ce lot, sur le profil
 * (`routes/users/profile-block-gate.ts`), est ASYMÉTRIQUE : la fiche d'une
 * personne que J'AI bloquée me reste servie, parce que c'est de là qu'on
 * débloque.
 *
 * Le CONTENU n'a pas cette contrainte, et veut l'inverse : bloquer quelqu'un,
 * c'est d'abord ne plus voir ce qu'il publie. Les deux directions se ferment
 * donc ensemble, et c'est exactement ce que `blockedIdsAroundViewer`
 * (`services/ContactDirectoryService.ts:194`) résout déjà pour l'annuaire —
 * « la symétrie n'est pas une politesse, c'est la protection ».
 *
 * **Deux gardes voisines, deux formes contraires, et chacune a sa raison. Ce
 * fichier et `person-block-gate.test.ts` se lisent ensemble.**
 *
 * ## POURQUOI LE FILTRE GARDE SA FORME QUAND IL N'Y A PAS DE BLOCAGE
 *
 * Tous les appelants posent ce fragment dans un `AND` parent. Y ajouter un
 * `AND` imbriqué est légal, mais le faire INCONDITIONNELLEMENT changerait la
 * forme de toutes les requêtes du fil pour l'écrasante majorité des lecteurs,
 * qui n'ont bloqué personne — et une clause `notIn: []` ne garde rien tout en
 * coûtant un niveau d'imbrication à chaque plan de requête. La forme ne change
 * donc que là où elle protège.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';

import { buildPostVisibilityOrFilter } from '../../../../services/posts/postVisibility';

const MOI = 'u-moi';
const AMI = 'u-ami';
const BLOQUE = 'u-bloque';

type Filtre = {
  readonly OR?: readonly Record<string, unknown>[];
  readonly AND?: readonly Record<string, unknown>[];
};

const clausesOr = (filtre: Filtre): readonly Record<string, unknown>[] =>
  filtre.OR ?? ((filtre.AND?.[0] as Filtre | undefined)?.OR ?? []);

describe('sans blocage, le filtre ne change pas de forme', () => {
  it('rend le `OR` nu, sans niveau d’imbrication supplémentaire', () => {
    const filtre = buildPostVisibilityOrFilter(MOI, [AMI], []) as Filtre;

    expect(filtre.OR).toBeDefined();
    expect(filtre.AND).toBeUndefined();
  });

  /** LE CONTRE-TÉMOIN de la forme : les six branches d'audience restent
      exactement celles que le dépôt sert depuis toujours. Sans lui, un lot qui
      ajouterait une garde pourrait en perdre une en chemin. */
  it('et il sert toujours les six audiences', () => {
    const clauses = clausesOr(buildPostVisibilityOrFilter(MOI, [AMI], ['u-communaute']) as Filtre);

    expect(clauses).toContainEqual({ authorId: MOI });
    expect(clauses).toContainEqual({ visibility: PostVisibility.PUBLIC });
    expect(clauses.some((c) => c.visibility === PostVisibility.FRIENDS)).toBe(true);
    expect(clauses.some((c) => c.visibility === PostVisibility.COMMUNITY)).toBe(true);
    expect(clauses.some((c) => c.visibility === PostVisibility.EXCEPT)).toBe(true);
    expect(clauses.some((c) => c.visibility === PostVisibility.ONLY)).toBe(true);
  });
});

describe('avec un blocage, aucun contenu de l’auteur écarté ne passe', () => {
  it('l’auteur bloqué est exclu, et l’exclusion vient APRÈS le `OR`', () => {
    const filtre = buildPostVisibilityOrFilter(MOI, [AMI], [], [BLOQUE]) as Filtre;

    expect(filtre.AND).toBeDefined();
    expect(filtre.AND?.[1]).toEqual({ authorId: { notIn: [BLOQUE] } });
  });

  /**
   * LE TÉMOIN QUI PORTE L'ISSUE. `{ visibility: PUBLIC }` n'a aucune contrainte
   * d'auteur — c'est par cette branche, et elle seule, que le contenu d'un
   * bloquant passait. L'exclusion doit donc s'appliquer à TOUT le `OR`, jamais
   * branche par branche : une garde posée sur `FRIENDS` aurait laissé `PUBLIC`
   * grand ouvert, et le défaut aurait survécu à son propre correctif.
   */
  it('l’exclusion couvre la branche PUBLIC, celle par laquelle le défaut passait', () => {
    const filtre = buildPostVisibilityOrFilter(MOI, [AMI], [], [BLOQUE]) as Filtre;

    const branchePublique = clausesOr(filtre).find((c) => c.visibility === PostVisibility.PUBLIC);
    expect(branchePublique).toEqual({ visibility: PostVisibility.PUBLIC });
    /* La branche reste NUE — la garde n'est pas dedans, elle est au-dessus,
       donc elle s'applique aussi aux cinq autres. */
    expect(filtre.AND?.[1]).toEqual({ authorId: { notIn: [BLOQUE] } });
  });

  it('plusieurs auteurs écartés voyagent ensemble', () => {
    const filtre = buildPostVisibilityOrFilter(MOI, [], [], [BLOQUE, 'u-autre']) as Filtre;

    expect(filtre.AND?.[1]).toEqual({ authorId: { notIn: [BLOQUE, 'u-autre'] } });
  });

  /** MES PROPRES PUBLICATIONS RESTENT MIENNES : la branche `authorId: viewerId`
      survit à la garde, sans quoi un lot de blocage me retirerait mon propre
      fil. */
  it('mes propres publications passent toujours', () => {
    const filtre = buildPostVisibilityOrFilter(MOI, [], [], [BLOQUE]) as Filtre;

    expect(clausesOr(filtre)).toContainEqual({ authorId: MOI });
  });

  /** Une liste VIDE n'est pas un blocage : elle ne doit pas changer la forme
      (sinon la promesse du premier `describe` ne tient que par accident). */
  it('une liste vide laisse le filtre nu', () => {
    const filtre = buildPostVisibilityOrFilter(MOI, [AMI], [], []) as Filtre;

    expect(filtre.OR).toBeDefined();
    expect(filtre.AND).toBeUndefined();
  });
});
