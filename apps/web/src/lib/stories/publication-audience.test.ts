import { describe, expect, test } from 'bun:test';

import {
  audienceAvailability,
  audienceLabelKey,
  defaultAudienceOf,
  isRememberableAudience,
  offeredAudiences,
  requestedAudienceFromSearch,
  seededAudience,
  servedAudience,
  shownAudience,
  STUDIO_AUDIENCES,
} from './publication-audience';

describe('STUDIO_AUDIENCES — l’ordre d’iOS (`PostVisibility.composerSelectableCases`, #13939)', () => {
  test('l’échelle des cercles, du plus large au plus étroit, puis les nominatifs et le privé', () => {
    expect(STUDIO_AUDIENCES).toEqual(['PUBLIC', 'COMMUNITY', 'ACQUAINTANCES', 'FRIENDS', 'CLOSE', 'BLOOD', 'EXCEPT', 'ONLY', 'PRIVATE']);
  });
});

describe('servedAudience — une audience SERVIE se lit fail-closed (`PostVisibility(served:)`, #13939)', () => {
  test('les neuf valeurs connues se lisent telles quelles, quelle que soit la casse', () => {
    for (const visibility of STUDIO_AUDIENCES) expect(servedAudience(visibility)).toBe(visibility);
    expect(servedAudience('close')).toBe('CLOSE');
  });

  test('une valeur inconnue se lit RESTREINTE, jamais Public', () => {
    expect(servedAudience('ATOM')).toBe('RESTRICTED');
    expect(servedAudience('FAMILY')).toBe('RESTRICTED');
    expect(servedAudience(3)).toBe('RESTRICTED');
  });

  test('absente, elle reste absente : la passerelle n’a rien dit', () => {
    expect(servedAudience(null)).toBeNull();
    expect(servedAudience(undefined)).toBeNull();
  });
});

describe('offeredAudiences — la loi D-100 importée, jamais recopiée', () => {
  test('aucune republication ⇒ les neuf', () => {
    expect(offeredAudiences({ repostOfId: null })).toEqual(STUDIO_AUDIENCES);
  });

  test('une republication ⇒ sans EXCEPT ni ONLY (repostVisibilityInheritsAudienceList)', () => {
    const offered = offeredAudiences({ repostOfId: 'p1' });
    expect(offered).toEqual(['PUBLIC', 'COMMUNITY', 'ACQUAINTANCES', 'FRIENDS', 'CLOSE', 'BLOOD', 'PRIVATE']);
  });
});

describe('audienceAvailability — grisé AVEC sa raison, jamais absent (loi 4)', () => {
  test('ONLY et EXCEPT ne sont pas choisissables, et disent pourquoi', () => {
    expect(audienceAvailability('ONLY')).toEqual({ choosable: false, reasonKey: 'story.studio.audience.refusal.people' });
    expect(audienceAvailability('EXCEPT')).toEqual({ choosable: false, reasonKey: 'story.studio.audience.refusal.people' });
  });

  test('les sept autres — cercles compris — sont choisissables, et le verdict porte l’audience rétrécie', () => {
    for (const visibility of ['PUBLIC', 'COMMUNITY', 'ACQUAINTANCES', 'FRIENDS', 'CLOSE', 'BLOOD', 'PRIVATE'] as const) {
      expect(audienceAvailability(visibility)).toEqual({ choosable: true, audience: visibility });
    }
  });
});

describe('isRememberableAudience — jamais EXCEPT/ONLY (StoryVisibilityPreferenceStore.isRememberable)', () => {
  test('FRIENDS et les trois cercles sont mémorisables : le dernier choix reste l’audience par défaut', () => {
    for (const visibility of ['FRIENDS', 'ACQUAINTANCES', 'CLOSE', 'BLOOD'] as const) expect(isRememberableAudience(visibility)).toBe(true);
  });

  test('ONLY et EXCEPT ne le sont pas', () => {
    expect(isRememberableAudience('ONLY')).toBe(false);
    expect(isRememberableAudience('EXCEPT')).toBe(false);
  });

  test('une valeur inconnue n’est pas mémorisable', () => {
    expect(isRememberableAudience('BOGUS')).toBe(false);
    expect(isRememberableAudience(null)).toBe(false);
  });
});

describe('defaultAudienceOf — le défaut de la passerelle, épinglé (core.ts:421)', () => {
  test('une story par défaut à FRIENDS, un post et un réel à PUBLIC', () => {
    expect(defaultAudienceOf('STORY')).toBe('FRIENDS');
    expect(defaultAudienceOf('POST')).toBe('PUBLIC');
    expect(defaultAudienceOf('REEL')).toBe('PUBLIC');
  });
});

describe('seededAudience — le brouillon prime, la mémoire ensuite, jamais un nominatif', () => {
  test('le brouillon (rang 1) l’emporte sur la mémoire (rang 2)', () => {
    expect(seededAudience({ draftVisibility: 'FRIENDS', memoryVisibility: 'PUBLIC' })).toBe('FRIENDS');
  });

  test('sans brouillon, la mémoire (rang 2) sert', () => {
    expect(seededAudience({ draftVisibility: null, memoryVisibility: 'COMMUNITY' })).toBe('COMMUNITY');
  });

  test('ni l’un ni l’autre ⇒ null (la pastille affichera le défaut de la passerelle)', () => {
    expect(seededAudience({ draftVisibility: null, memoryVisibility: null })).toBeNull();
  });

  test('une mémoire NOMINATIVE ne sert jamais de graine', () => {
    expect(seededAudience({ draftVisibility: null, memoryVisibility: 'ONLY' })).toBeNull();
  });

  /** Revue-correction #7683 : un brouillon qui porte un mode NOMINATIF (écrit
   * par une version antérieure, ou altéré) partirait sans `visibilityUserIds`
   * — 400 `VALIDATION_ERROR` à la passerelle (`types.ts:319-323`). Le rang 1
   * se tait alors, et le rang 2 sert. */
  test('un brouillon NOMINATIF ne sert jamais de graine — la mémoire (rang 2) prend le relais', () => {
    expect(seededAudience({ draftVisibility: 'EXCEPT', memoryVisibility: 'COMMUNITY' })).toBe('COMMUNITY');
    expect(seededAudience({ draftVisibility: 'ONLY', memoryVisibility: null })).toBeNull();
  });
});

describe('audienceLabelKey — une entrée par audience, toutes distinctes', () => {
  test('chaque audience a un libellé défini', () => {
    for (const visibility of STUDIO_AUDIENCES) expect(audienceLabelKey(visibility)).toBeTruthy();
  });

  test('les neuf libellés sont distincts', () => {
    expect(new Set(STUDIO_AUDIENCES.map(audienceLabelKey)).size).toBe(STUDIO_AUDIENCES.length);
  });
});

describe('requestedAudienceFromSearch — l’audience DEMANDÉE par l’adresse (#7729)', () => {
  test('?audience=friends et ?audience=public se lisent, rien d’autre', () => {
    expect(requestedAudienceFromSearch(new URLSearchParams('audience=friends'))).toBe('FRIENDS');
    expect(requestedAudienceFromSearch(new URLSearchParams('audience=public'))).toBe('PUBLIC');
    expect(requestedAudienceFromSearch(new URLSearchParams('audience=PRIVATE'))).toBeNull();
    expect(requestedAudienceFromSearch(new URLSearchParams(''))).toBeNull();
  });
});

describe('seededAudience — l’audience demandée passe AVANT la mémoire, jamais avant le brouillon', () => {
  test('le brouillon garde la main', () => {
    expect(seededAudience({ draftVisibility: 'PUBLIC', requestedVisibility: 'FRIENDS', memoryVisibility: null })).toBe('PUBLIC');
  });

  test('la demande de l’accueil (régime protégé ⇒ amis) l’emporte sur un souvenir « public »', () => {
    expect(seededAudience({ draftVisibility: null, requestedVisibility: 'FRIENDS', memoryVisibility: 'PUBLIC' })).toBe('FRIENDS');
  });

  test('sans demande, la mémoire', () => {
    expect(seededAudience({ draftVisibility: null, requestedVisibility: null, memoryVisibility: 'PRIVATE' })).toBe('PRIVATE');
  });
});

describe('shownAudience — ce que la pastille DIT, jamais un défaut à la place d’une audience servie (#13939)', () => {
  test('un choix fait se dit choisi', () => {
    expect(shownAudience({ chosen: 'CLOSE', served: 'CLOSE', fallback: 'PUBLIC' })).toEqual({ value: 'CLOSE', source: 'chosen' });
  });

  test('rien choisi, rien servi : le défaut de la passerelle', () => {
    expect(shownAudience({ chosen: null, served: null, fallback: 'PUBLIC' })).toEqual({ value: 'PUBLIC', source: 'default' });
  });

  test('l’édition d’une publication à l’audience inconnue dit « Restreinte », jamais « Public · par défaut »', () => {
    expect(shownAudience({ chosen: null, served: servedAudience('FAMILY'), fallback: 'PUBLIC' })).toEqual({ value: 'RESTRICTED', source: 'served' });
  });

  test('l’édition d’une publication nominative dit son mode servi, sans le rendre choisissable', () => {
    expect(shownAudience({ chosen: null, served: 'ONLY', fallback: 'FRIENDS' })).toEqual({ value: 'ONLY', source: 'served' });
  });
});
