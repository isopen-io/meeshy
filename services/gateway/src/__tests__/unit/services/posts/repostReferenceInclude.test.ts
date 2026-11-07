/**
 * Le post ORIGINAL d'une republication charge ses références.
 *
 * `withMentions` peut aplatir tout ce qu'il veut : si le `select` ne charge pas
 * la relation, `repostOf.mentions` reste `undefined` — et un client sans jeu
 * validé retombe sur sa regex locale, qui linkifie n'importe quel `@handle` du
 * texte cité vers un profil inexistant.
 *
 * Même forme que la racine, et la MÊME constante : deux copies du filtre
 * divergeraient au premier mode ajouté, et c'est ce filtre qui garde les
 * silencieuses hors d'une charge utile servie à toute une audience.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { postMentionInclude, repostOfInclude, postInclude } from '../../../../services/posts/postIncludes';

describe('repostOfInclude', () => {
  it('charge les références du post original', () => {
    expect(repostOfInclude.select.postMentions).toBeDefined();
  });

  it('les charge sous la MÊME forme que la racine — jamais une copie du filtre', () => {
    expect(repostOfInclude.select.postMentions).toBe(postMentionInclude);
    expect(postInclude.postMentions).toBe(postMentionInclude);
  });

  it('exclut les silencieuses, comme toute charge utile servie à une audience', () => {
    const where = postMentionInclude.where as { OR: ReadonlyArray<Record<string, unknown>> };
    const modes = where.OR.flatMap((clause) => {
      const display = clause.display as { in?: readonly string[] } | null | undefined;
      return display && typeof display === 'object' && 'in' in display ? [...(display.in ?? [])] : [];
    });

    expect(modes).not.toContain('SILENT');
  });
});

describe('repostOf.commentsDisabled (#16541)', () => {
  it('charge la fermeture des commentaires de l’original', () => {
    expect(repostOfInclude.select.commentsDisabled).toBe(true);
  });

  it('la SERT sur le fil : la projection de l’imbriqué ne la retire pas', async () => {
    const { withMentions } = await import('../../../../services/posts/postReferences');
    const { WIRE_BROADCAST } = await import('../../../../services/posts/storyEffectsV3');
    const repost = {
      id: 'repost-1',
      postMentions: [],
      repostOf: { id: 'root-1', visibility: 'PUBLIC', moderationHiddenAt: null, deletedAt: null, commentsDisabled: true, author: null },
    };
    const served = withMentions(repost, WIRE_BROADCAST);

    expect(served.repostOf).toMatchObject({ commentsDisabled: true });
  });
});
