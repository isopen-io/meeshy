import { describe, expect, test } from 'bun:test';

import { firstFrameSrc, isLocalMediaSrc, localAwarePreload } from './local-media';

describe('un média aux octets locaux (#15111)', () => {
  test('une URL blob est locale ; une adresse servie ne l’est pas', () => {
    expect(isLocalMediaSrc('blob:http://app/1')).toBe(true);
    expect(isLocalMediaSrc('https://gate.meeshy.me/api/v1/attachments/a/stream')).toBe(false);
  });

  test('une source locale charge ses métadonnées ; une servie garde la règle du fil', () => {
    expect(localAwarePreload('blob:http://app/1', 'none')).toBe('metadata');
    expect(localAwarePreload('https://cdn/v.mp4', 'none')).toBe('none');
    expect(localAwarePreload('https://cdn/v.mp4', 'auto')).toBe('auto');
  });

  test('seule une URL blob reçoit le fragment de première image, une seule fois', () => {
    expect(firstFrameSrc('blob:http://app/1')).toBe('blob:http://app/1#t=0.001');
    expect(firstFrameSrc('blob:http://app/1#t=0.001')).toBe('blob:http://app/1#t=0.001');
    expect(firstFrameSrc('https://cdn/v.mp4')).toBe('https://cdn/v.mp4');
    expect(firstFrameSrc('')).toBe('');
  });
});
