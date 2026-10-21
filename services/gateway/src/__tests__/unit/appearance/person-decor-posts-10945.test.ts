/**
 * #10945 — le contour équipé voyage avec l'AUTEUR d'un post, d'une story, d'un
 * statut, d'un commentaire en aperçu et de l'original d'une republication.
 * Lu dans la jointure que le post fait déjà (le `select` de l'auteur), résolu
 * au registre par `withMentions`, la frontière que toute charge de post
 * traverse avant le fil. La colonne brute `equippedAvatarRing` ne part jamais.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import {
  commentsPreviewInclude,
  postInclude,
  repostOfInclude,
  statusPostSelect,
  storyPostInclude,
  trayStorySelect,
} from '../../../services/posts/postIncludes';
import { withMentions } from '../../../services/posts/postReferences';
import { servedPerson } from '../../../services/appearance/authorProfileDecor';

const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };

const person = (id: string, equippedAvatarRing: string | null) => ({ id, username: id, displayName: id, avatar: null, equippedAvatarRing });

const authorSelectOf = (shape: unknown): Record<string, unknown> =>
  ((shape as { author: { select: Record<string, unknown> } }).author.select);

describe('#10945 — les sélecteurs de post lisent le contour de leur auteur', () => {
  it.each([
    ['postInclude', postInclude],
    ['storyPostInclude', storyPostInclude],
    ['statusPostSelect', statusPostSelect],
    ['trayStorySelect', trayStorySelect],
  ])('%s', (_name, shape) => {
    expect(authorSelectOf(shape)).toMatchObject({ equippedAvatarRing: true });
  });

  it("l'original d'une republication et l'aperçu des commentaires aussi", () => {
    expect(authorSelectOf(repostOfInclude.select)).toMatchObject({ equippedAvatarRing: true });
    expect(authorSelectOf(commentsPreviewInclude.select)).toMatchObject({ equippedAvatarRing: true });
    expect(authorSelectOf((trayStorySelect as unknown as { repostOf: { select: unknown } }).repostOf.select)).toMatchObject({ equippedAvatarRing: true });
  });
});

describe('#10945 — withMentions sert profileDecor, jamais la colonne', () => {
  const post = {
    id: 'p1',
    author: person('ana', 'contours-essentiels/filet'),
    comments: [{ id: 'c1', author: person('bob', 'contours-essentiels/filet') }, { id: 'c2', author: person('eve', null) }],
    repostOf: { id: 'p0', author: person('zoe', 'contours-essentiels/filet') },
    postMentions: [],
  };

  it("l'auteur, les commentaires en aperçu et l'original republié portent leur contour", () => {
    const served = withMentions(post) as unknown as {
      author: { profileDecor?: unknown };
      comments: Array<{ author: { profileDecor?: unknown } }>;
      repostOf: { author: { profileDecor?: unknown } };
    };
    expect(served.author.profileDecor).toEqual({ avatarRing: RING });
    expect(served.comments[0]?.author.profileDecor).toEqual({ avatarRing: RING });
    expect(served.comments[1]?.author).not.toHaveProperty('profileDecor');
    expect(served.repostOf.author.profileDecor).toEqual({ avatarRing: RING });
    expect(JSON.stringify(served)).not.toContain('equippedAvatarRing');
  });

  it('sans contour, ou contour sorti du registre, aucune clé', () => {
    const served = withMentions({ ...post, author: person('ana', 'disparu/rien'), comments: [], repostOf: null }) as unknown as { author: object };
    expect(served.author).not.toHaveProperty('profileDecor');
    expect(JSON.stringify(served)).not.toContain('equippedAvatarRing');
  });
});

describe('#10945 — servedPerson', () => {
  it('retire la colonne et étale le contour', () => {
    expect(servedPerson(person('ana', 'contours-essentiels/filet'))).toEqual({ id: 'ana', username: 'ana', displayName: 'ana', avatar: null, profileDecor: { avatarRing: RING } });
    expect(servedPerson(person('ana', null))).toEqual({ id: 'ana', username: 'ana', displayName: 'ana', avatar: null });
    expect(servedPerson(null)).toBeNull();
  });
});
