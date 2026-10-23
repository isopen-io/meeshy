import { describe, it, expect } from 'vitest';
import {
  CLIENT_CAPABILITIES,
  CLIENT_CAPABILITIES_AUTH_KEY,
  CLIENT_CAPABILITIES_MAX,
  readClientCapabilities,
} from '../utils/client-capabilities';

describe('les capacités qu’une socket annonce à son ouverture', () => {
  it('nomme la clé de `handshake.auth` et les capacités connues', () => {
    expect(CLIENT_CAPABILITIES_AUTH_KEY).toBe('capabilities');
    expect(CLIENT_CAPABILITIES).toContain('call-live-frame-group');
  });

  it('lit les capacités connues annoncées par le client', () => {
    const declared = readClientCapabilities({ token: 'jwt', capabilities: ['call-live-frame-group'] });

    expect(declared.has('call-live-frame-group')).toBe(true);
  });

  it('un ancien client qui n’annonce rien n’a aucune capacité', () => {
    expect(readClientCapabilities({ token: 'jwt' }).size).toBe(0);
    expect(readClientCapabilities(undefined).size).toBe(0);
    expect(readClientCapabilities(null).size).toBe(0);
    expect(readClientCapabilities('call-live-frame-group').size).toBe(0);
  });

  it('une forme inattendue ne vaut rien, et une capacité inconnue est ignorée', () => {
    expect(readClientCapabilities({ capabilities: 'call-live-frame-group' }).size).toBe(0);
    expect(readClientCapabilities({ capabilities: { 'call-live-frame-group': true } }).size).toBe(0);
    expect([...readClientCapabilities({ capabilities: ['future-thing', 42, null, 'call-live-frame-group'] })]).toEqual([
      'call-live-frame-group',
    ]);
  });

  it('une liste démesurée n’est lue que jusqu’à sa borne', () => {
    const flood = [...Array.from({ length: CLIENT_CAPABILITIES_MAX }, () => 'noise'), 'call-live-frame-group'];

    expect(readClientCapabilities({ capabilities: flood }).size).toBe(0);
  });
});
