/**
 * Un appel passe derrière un pare-feu qui ne laisse sortir que le 443 (#11278).
 *
 * `TURN_TLS_SERVERS` déclare des relais TURN joignables en TLS sur un nom et
 * un port libres, 443 par défaut : la passerelle les sert EN PLUS des `turn:`
 * et des `turns:` dérivés (5349), avec les mêmes identifiants.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { logger } from '../../../utils/logger';
import { TURNCredentialService } from '../../../services/TURNCredentialService';
import { parseTurnTlsServers } from '../../../services/turn-tls-servers';

const ENV_KEYS = ['TURN_SERVERS', 'TURN_TLS_PORT', 'TURN_TLS_SERVERS', 'TURN_SECRET', 'NODE_ENV'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function serviceWith(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): TURNCredentialService {
  ENV_KEYS.forEach((key) => {
    const value = key in env ? env[key] : undefined;
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  process.env.NODE_ENV = env.NODE_ENV ?? 'test';
  return new TURNCredentialService();
}

const urlsOf = (servers: RTCIceServer[]): string[] => servers.flatMap((server) => [server.urls].flat());

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
  jest.clearAllMocks();
});

describe('TURN sur TLS 443 — la liste des serveurs ICE (#11278)', () => {
  it('sert turns:<hôte>:443?transport=tcp en plus des turn: et des turns: dérivés', () => {
    const urls = urlsOf(
      serviceWith({ TURN_SERVERS: 'turn.staging.example.com:3480', TURN_TLS_SERVERS: 'turn.staging.example.com' }).generateCredentials('u1'),
    );

    expect(urls).toContain('turn:turn.staging.example.com:3480');
    expect(urls).toContain('turns:turn.staging.example.com:5349?transport=tcp');
    expect(urls).toContain('turns:turn.staging.example.com:443?transport=tcp');
  });

  it('sert le 443 même quand le TLS dérivé est coupé (TURN_TLS_PORT=0), comme sur un staging sans 5349', () => {
    const urls = urlsOf(
      serviceWith({ TURN_SERVERS: 'turn.staging.example.com:3480', TURN_TLS_PORT: '0', TURN_TLS_SERVERS: 'turn.staging.example.com:443' }).generateCredentials('u1'),
    );

    expect(urls.filter((url) => url.startsWith('turns:'))).toEqual(['turns:turn.staging.example.com:443?transport=tcp']);
  });

  it('signe l’entrée 443 avec les MÊMES identifiants éphémères que le turn: — coturn les vérifie avec le même secret', () => {
    const servers = serviceWith({ TURN_SERVERS: 'turn.example.com:3478', TURN_TLS_SERVERS: 'turn.example.com' }).generateCredentials('user-42');
    const plain = servers.find((server) => urlsOf([server])[0] === 'turn:turn.example.com:3478');
    const tls443 = servers.find((server) => urlsOf([server])[0] === 'turns:turn.example.com:443?transport=tcp');

    expect(tls443?.username).toBe(plain?.username);
    expect(tls443?.credential).toBe(plain?.credential);
    expect(tls443?.username).toMatch(/^\d+:user-42$/);
  });

  it('ne sert pas deux fois une adresse que TURN_TLS_PORT dérive déjà', () => {
    const urls = urlsOf(
      serviceWith({ TURN_SERVERS: 'turn.example.com', TURN_TLS_PORT: '443', TURN_TLS_SERVERS: 'turn.example.com:443' }).generateCredentials('u1'),
    );

    expect(urls.filter((url) => url === 'turns:turn.example.com:443?transport=tcp')).toHaveLength(1);
  });

  it('ne change RIEN quand TURN_TLS_SERVERS est absent : la production d’aujourd’hui sert la même liste', () => {
    const urls = urlsOf(serviceWith({ TURN_SERVERS: 'turn.example.com:3478' }).generateCredentials('u1'));

    expect(urls.filter((url) => url.startsWith('turn')).sort()).toEqual([
      'turn:turn.example.com:3478',
      'turns:turn.example.com:5349?transport=tcp',
    ]);
  });

  it('écarte une entrée illisible et le dit, sans écarter les autres', () => {
    const urls = urlsOf(
      serviceWith({ TURN_SERVERS: 'turn.example.com', TURN_TLS_SERVERS: 'turn.example.com:99999, ,https://x, relay.example.com:8443' }).generateCredentials('u1'),
    );

    expect(urls).toContain('turns:relay.example.com:8443?transport=tcp');
    expect(urls.some((url) => url.includes('99999') || url.includes('https'))).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('TURN_TLS_SERVERS'), expect.objectContaining({ rejected: ['turn.example.com:99999', 'https://x'] }));
  });
});

describe('parseTurnTlsServers', () => {
  it.each([
    ['turn.example.com', [{ host: 'turn.example.com', port: 443 }]],
    ['turn.example.com:5349', [{ host: 'turn.example.com', port: 5349 }]],
    [' a.example.com , b.example.com:443 ', [{ host: 'a.example.com', port: 443 }, { host: 'b.example.com', port: 443 }]],
    ['', []],
    [undefined, []],
  ])('%p → %p', (env, servers) => {
    expect(parseTurnTlsServers(env).servers).toEqual(servers);
  });

  it.each(['turn.example.com:0', 'turn.example.com:abc', 'turn.example.com:443:1', '-bad.example.com', 'host_with_underscore.example.com'])(
    'refuse %p',
    (entry) => {
      expect(parseTurnTlsServers(entry)).toEqual({ servers: [], rejected: [entry] });
    },
  );
});
