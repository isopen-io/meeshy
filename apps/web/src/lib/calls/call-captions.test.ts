import { describe, expect, test } from 'bun:test';

import { nextCaptionsMode } from './call-captions';

describe('les sous-titres d’un appel (#8048)', () => {
  test('le bouton suit le cycle d’iOS : off → traduit → original → off', () => {
    expect(nextCaptionsMode('off')).toBe('translated');
    expect(nextCaptionsMode('translated')).toBe('original');
    expect(nextCaptionsMode('original')).toBe('off');
  });
});
