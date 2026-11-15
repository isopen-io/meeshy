import { describe, expect, test } from 'bun:test';

import { DEFAULT_DEVICE_RUNTIME_URL, DEVICE_RUNTIME_VERSION, deviceRuntimeUrl } from './model';

describe('deviceRuntimeUrl — d’où le Worker charge transformers.js (#9898)', () => {
  test('sans réglage de construction, le moteur vient du CDN, à la version épinglée', () => {
    expect(deviceRuntimeUrl(undefined)).toBe(DEFAULT_DEVICE_RUNTIME_URL);
    expect(DEFAULT_DEVICE_RUNTIME_URL).toContain(`@huggingface/transformers@${DEVICE_RUNTIME_VERSION}/`);
  });

  test('une adresse fixée au build est celle qu’on charge : le moteur peut être hébergé chez nous', () => {
    expect(deviceRuntimeUrl('https://static.meeshy.me/vendor/transformers.min.js')).toBe('https://static.meeshy.me/vendor/transformers.min.js');
  });

  test('un ARG que le Dockerfile laisse vide vaut « pas de réglage » : import("") ne ferait jamais un moteur', () => {
    expect(deviceRuntimeUrl('')).toBe(DEFAULT_DEVICE_RUNTIME_URL);
    expect(deviceRuntimeUrl('   ')).toBe(DEFAULT_DEVICE_RUNTIME_URL);
  });

  test('les espaces autour d’une adresse ne la changent pas', () => {
    expect(deviceRuntimeUrl(' https://static.meeshy.me/t.js\n')).toBe('https://static.meeshy.me/t.js');
  });
});
