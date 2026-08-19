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
