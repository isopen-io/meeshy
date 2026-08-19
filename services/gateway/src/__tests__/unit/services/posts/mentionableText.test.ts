/**
 * `collectMentionableText` — où le serveur a le droit de lire un `@handle`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { collectMentionableText } from '../../../../services/posts/mentionableText';

describe('collectMentionableText', () => {
  it('rend la légende seule quand il n\'y a pas d\'effets', () => {
    expect(collectMentionableText({ content: 'salut @alice' })).toEqual(['salut @alice']);
  });

  it('rend un tableau vide quand il n\'y a ni légende ni effets', () => {
    expect(collectMentionableText({ content: null })).toEqual([]);
  });

  it('lit AUSSI le texte des objets de canevas', () => {
    const result = collectMentionableText({
      content: 'ma story',
      storyEffects: { textObjects: [{ id: 't1', text: 'coucou @bob' }] },
    });

    expect(result).toEqual(['ma story', 'coucou @bob']);
  });

  it('IGNORE un objet texte qui est un badge de référence', () => {
    const result = collectMentionableText({
      content: 'ma story',
      storyEffects: {
        textObjects: [
          { id: 't1', text: '@alice', referenceUserId: 'u-alice' },
          { id: 't2', text: 'coucou @bob' },
        ],
      },
    });

    expect(result).toEqual(['ma story', 'coucou @bob']);
  });

  it('survit à des effets malformés sans lever', () => {
    expect(collectMentionableText({ content: 'x', storyEffects: 'pas un objet' })).toEqual(['x']);
    expect(collectMentionableText({ content: 'x', storyEffects: { textObjects: 'nope' } })).toEqual(['x']);
    expect(collectMentionableText({ content: 'x', storyEffects: { textObjects: [null, 42] } })).toEqual(['x']);
  });
});
