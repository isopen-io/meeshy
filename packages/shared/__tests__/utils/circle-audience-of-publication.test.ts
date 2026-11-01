import { describe, it, expect } from 'vitest';
import { POST_VISIBILITIES, isPostVisibility, type PostVisibility } from '../../types/post.js';
import { POST_CIRCLE_VISIBILITIES, postCircleAudienceFloor } from '../../utils/relation-levels.js';
import { allowedRepostVisibilities, isRepostVisibilityAllowed } from '../../utils/repost-audience.js';
import { visibilityVariant } from '../../types/engagement-operations.js';

const HISTORIC: readonly PostVisibility[] = ['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY'];
const CIRCLES: readonly PostVisibility[] = ['ACQUAINTANCES', 'CLOSE', 'BLOOD'];

describe('les audiences de publication', () => {
  it('gardent les six valeurs historiques et ajoutent Connaissances, Proches et Sang', () => {
    [...HISTORIC, ...CIRCLES].forEach((value) => expect(POST_VISIBILITIES).toContain(value));
    expect(POST_VISIBILITIES).toHaveLength(9);
  });

  it('reconnaissent les neuf valeurs et refusent toute autre', () => {
    POST_VISIBILITIES.forEach((value) => expect(isPostVisibility(value)).toBe(true));
    ['ATOM', 'friends', '', null, undefined, 7].forEach((value) => expect(isPostVisibility(value)).toBe(false));
  });
});

describe('le plancher de niveau d\'une audience de cercle', () => {
  it('Connaissances vise Connaissance, Proches vise Proche, Sang vise Sang', () => {
    expect(postCircleAudienceFloor('ACQUAINTANCES')).toBe('ACQUAINTANCE');
    expect(postCircleAudienceFloor('CLOSE')).toBe('CLOSE');
    expect(postCircleAudienceFloor('BLOOD')).toBe('BLOOD');
  });

  it('ne dit rien des audiences historiques ni d\'une valeur inconnue : elles ne sont pas des cercles', () => {
    [...HISTORIC, 'ATOM', null, undefined].forEach((value) => expect(postCircleAudienceFloor(value)).toBeNull());
  });

  it('énumère exactement les trois audiences de cercle', () => {
    expect([...POST_CIRCLE_VISIBILITIES].sort()).toEqual([...CIRCLES].sort());
  });
});

describe('le repartage suit l\'échelle des cercles (RG-18)', () => {
  const allowed = (original: PostVisibility) => new Set(allowedRepostVisibilities(original));

  it('un contenu Sang n\'est jamais repartageable, pas même en privé', () => {
    expect(allowedRepostVisibilities('BLOOD')).toEqual([]);
    POST_VISIBILITIES.forEach((requested) => expect(isRepostVisibilityAllowed('BLOOD', requested)).toBe(false));
  });

  it('un contenu Proches se repartage en Proches, en Sang ou en privé, jamais plus large', () => {
    expect(allowed('CLOSE')).toEqual(new Set<PostVisibility>(['CLOSE', 'BLOOD', 'PRIVATE']));
    (['PUBLIC', 'COMMUNITY', 'ACQUAINTANCES', 'FRIENDS', 'EXCEPT', 'ONLY'] as const).forEach((requested) =>
      expect(isRepostVisibilityAllowed('CLOSE', requested)).toBe(false),
    );
  });

  it('un contenu Connaissances se repartage vers lui-même ou plus étroit, jamais en Public ni en Communauté', () => {
    expect(allowed('ACQUAINTANCES')).toEqual(
      new Set<PostVisibility>(['ACQUAINTANCES', 'FRIENDS', 'CLOSE', 'BLOOD', 'PRIVATE']),
    );
    (['PUBLIC', 'COMMUNITY', 'EXCEPT', 'ONLY'] as const).forEach((requested) =>
      expect(isRepostVisibilityAllowed('ACQUAINTANCES', requested)).toBe(false),
    );
  });

  it('un contenu Amis se repartage en Amis, Proches, Sang ou privé, jamais en Connaissances ni plus large', () => {
    expect(allowed('FRIENDS')).toEqual(new Set<PostVisibility>(['FRIENDS', 'CLOSE', 'BLOOD', 'PRIVATE']));
    expect(isRepostVisibilityAllowed('FRIENDS', 'ACQUAINTANCES')).toBe(false);
  });

  it('Public se repartage vers toutes les audiences, cercles compris', () => {
    expect(allowed('PUBLIC')).toEqual(new Set(POST_VISIBILITIES));
  });

  it('aucune audience historique non circulaire ne donne accès à un cercle (incomparables)', () => {
    (['COMMUNITY', 'EXCEPT', 'ONLY', 'PRIVATE'] as const).forEach((original) =>
      CIRCLES.forEach((requested) => expect(isRepostVisibilityAllowed(original, requested)).toBe(false)),
    );
  });

  it('une lecture booléenne et une liste disent la même chose sur les 81 paires', () => {
    POST_VISIBILITIES.forEach((original) =>
      POST_VISIBILITIES.forEach((requested) =>
        expect(isRepostVisibilityAllowed(original, requested)).toBe(allowedRepostVisibilities(original).includes(requested)),
      ),
    );
  });
});

describe('la variante de points d\'une audience de cercle', () => {
  it('Connaissances reste une audience d\'amis ; Proches et Sang, plus étroits, valent « autre »', () => {
    expect(visibilityVariant('ACQUAINTANCES')).toBe('friends');
    expect(visibilityVariant('CLOSE')).toBe('other');
    expect(visibilityVariant('BLOOD')).toBe('other');
  });
});
