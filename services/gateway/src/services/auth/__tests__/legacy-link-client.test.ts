/**
 * #10878 — la TRANSITION MESURÉE du lien lié à l'appareil (#10872) : seul un
 * client iOS qui s'annonce sous la première version capable de confirmer
 * garde la connexion directe ; le web, les nouveaux binaires et tout client
 * qui ne s'annonce pas passent par la liaison (fail-closed). Chaque passage
 * par ce chemin hérité est COMPTÉ, par jour et par version, pour qu'on le
 * retire à zéro usage mesuré.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { Redis } from 'ioredis';

import {
  LEGACY_LINK_IOS_FIRST_CONFIRMING_VERSION,
  legacyLinkClientOf,
  legacyLinkLoginKey,
  createLegacyLinkLoginCounter,
  countedLegacyVersion,
  countLegacyLinkLogin,
  linkLoginConsent,
} from '../legacy-link-client';

const SECRET = 'c2VjcmV0LWRlLWNldC1hcHBhcmVpbC0zMi1vY3RldHM';

const iosHeaders = (version: string, extra: Record<string, string> = {}) => ({
  'x-meeshy-platform': 'ios',
  'x-meeshy-version': version,
  'x-app-platform': 'ios',
  'x-app-version': version,
  ...extra,
});

describe('#10878 — qui est un ANCIEN client iOS', () => {
  it('la première version qui sait confirmer est la 1.1.4 (la 1.1.3 publiée ne contient pas #10872)', () => {
    expect(LEGACY_LINK_IOS_FIRST_CONFIRMING_VERSION).toBe('1.1.4');
  });

  it.each(['1.0.0', '1.1.2', '1.1.3', '1.1'])('iOS %s, sans secret ⇒ ancien client', (version) => {
    expect(legacyLinkClientOf({ headers: iosHeaders(version), presentedSecret: undefined })).toEqual({ platform: 'ios', version });
  });

  it.each(['1.1.4', '1.2.0', '2.0.0'])('iOS %s ⇒ nouveau client', (version) => {
    expect(legacyLinkClientOf({ headers: iosHeaders(version), presentedSecret: undefined })).toBeNull();
  });

  it('un binaire publié avant la paire X-App-* s’identifie par la télémétrie X-Meeshy-*', () => {
    expect(legacyLinkClientOf({ headers: { 'x-meeshy-platform': 'ios', 'x-meeshy-version': '1.0.5' }, presentedSecret: undefined }))
      .toEqual({ platform: 'ios', version: '1.0.5' });
  });

  it('un binaire qui DÉCLARE la capacité link-device-binding n’est jamais ancien — les builds de dev/TestFlight portant #10872 s’annoncent encore 1.1.3', () => {
    expect(legacyLinkClientOf({ headers: iosHeaders('1.1.3', { 'x-meeshy-capabilities': 'onboarding-age,link-device-binding' }), presentedSecret: undefined })).toBeNull();
  });

  it('une AUTRE capacité ne suffit pas', () => {
    expect(legacyLinkClientOf({ headers: iosHeaders('1.1.3', { 'x-meeshy-capabilities': 'onboarding-age' }), presentedSecret: undefined }))
      .toEqual({ platform: 'ios', version: '1.1.3' });
  });

  it('un client qui présente un secret connaît la liaison ⇒ jamais ancien, quelle que soit sa version', () => {
    expect(legacyLinkClientOf({ headers: iosHeaders('1.1.3'), presentedSecret: SECRET })).toBeNull();
  });

  it.each([
    ['le web', { 'x-meeshy-platform': 'web', 'x-meeshy-version': '1.0.0' }],
    ['la PWA', { 'x-meeshy-platform': 'pwa', 'x-meeshy-version': '1.0.0' }],
    ['la coque Android', { 'x-meeshy-platform': 'android-shell', 'x-meeshy-version': '1.0.0' }],
    ['un client sans en-tête', {}],
    ['iOS sans version', { 'x-meeshy-platform': 'ios' }],
    ['une version hors format', iosHeaders('1.0.0-beta<script>')],
    ['une version vide', iosHeaders('')],
    ['une version démesurée', iosHeaders('1.0.0.0.0.0.0')],
    ['une version à zéro de tête', iosHeaders('01.1.3')],
  ])('%s ⇒ comportement NOUVEAU (fail-closed)', (_label, headers) => {
    expect(legacyLinkClientOf({ headers, presentedSecret: undefined })).toBeNull();
  });

  it('deux plateformes qui se contredisent ⇒ pas ancien (iOS doit être dit par chaque en-tête présent)', () => {
    expect(legacyLinkClientOf({ headers: { ...iosHeaders('1.1.2'), 'x-app-platform': 'android' }, presentedSecret: undefined })).toBeNull();
  });
});

type FakeRedis = { readonly client: Redis; readonly hashes: Map<string, Map<string, number>>; readonly ttls: Map<string, number> };

function fakeRedis(options: { broken?: boolean } = {}): FakeRedis {
  const hashes = new Map<string, Map<string, number>>();
  const ttls = new Map<string, number>();
  const client = {
    multi() {
      const ops: Array<() => readonly [Error | null, unknown]> = [];
      const chain = {
        hincrby(key: string, field: string, by: number) {
          ops.push(() => {
            const hash = hashes.get(key) ?? new Map<string, number>();
            const next = (hash.get(field) ?? 0) + by;
            hashes.set(key, new Map([...hash, [field, next]]));
            return [null, next] as const;
          });
          return chain;
        },
        expire(key: string, seconds: number) {
          ops.push(() => {
            ttls.set(key, seconds);
            return [null, 1] as const;
          });
          return chain;
        },
        async exec() {
          if (options.broken) throw new Error('Connection is closed.');
          return ops.map((op) => op());
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as Redis, hashes, ttls };
}

const AT = new Date('2026-10-17T09:30:00Z');

describe('#10878 — le compteur du chemin hérité', () => {
  it('une clé par JOUR UTC, un champ par route et version', () => {
    expect(legacyLinkLoginKey(AT)).toBe('metrics:legacy-link-login:2026-10-17');
  });

  it('chaque passage incrémente route|ios|version, et la clé vit 180 jours', async () => {
    const redis = fakeRedis();
    const logs: unknown[] = [];
    const counter = createLegacyLinkLoginCounter({ redis: () => redis.client, log: (entry) => logs.push(entry), now: () => AT });

    await counter.record({ route: 'verify-email', client: { platform: 'ios', version: '1.1.2' } });
    await counter.record({ route: 'verify-email', client: { platform: 'ios', version: '1.1.2' } });
    await counter.record({ route: 'magic-link-validate', client: { platform: 'ios', version: '1.1.3' } });

    const hash = redis.hashes.get('metrics:legacy-link-login:2026-10-17');
    expect(hash?.get('verify-email|ios|1.1.2')).toBe(2);
    expect(hash?.get('magic-link-validate|ios|1.1.3')).toBe(1);
    expect(redis.ttls.get('metrics:legacy-link-login:2026-10-17')).toBe(180 * 24 * 60 * 60);
  });

  it('chaque passage laisse un journal STRUCTURÉ, sans identité', async () => {
    const logs: unknown[] = [];
    const counter = createLegacyLinkLoginCounter({ redis: () => null, log: (entry) => logs.push(entry), now: () => AT });

    await counter.record({ route: 'verify-email', client: { platform: 'ios', version: '1.1.2' } });

    expect(logs).toEqual([{ event: 'legacy-link-login', route: 'verify-email', platform: 'ios', version: '1.1.2' }]);
  });

  it('Redis en panne : la connexion n’échoue pas, le journal reste', async () => {
    const logs: unknown[] = [];
    const counter = createLegacyLinkLoginCounter({ redis: () => fakeRedis({ broken: true }).client, log: (entry) => logs.push(entry), now: () => AT });

    await expect(counter.record({ route: 'verify-email', client: { platform: 'ios', version: '1.1.2' } })).resolves.toBeUndefined();
    expect(logs).toHaveLength(1);
  });
});

describe('#10878 — la version COMPTÉE reste dans un vocabulaire borné', () => {
  it.each([
    ['1.1.3', '1.1.3'],
    ['1.1', '1.1.0'],
    ['1.0.7', '1.0.7'],
    ['1.1.20', '1.1.20'],
    ['1.1.21', 'other'],
    ['0.1234.5678.9', 'other'],
    ['0.0.0', 'other'],
  ])('%s ⇒ %s', (version, counted) => {
    expect(countedLegacyVersion(version)).toBe(counted);
  });

  it('le compteur range une version exotique sous `other`', async () => {
    const redis = fakeRedis();
    const counter = createLegacyLinkLoginCounter({ redis: () => redis.client, log: () => undefined, now: () => AT });

    await counter.record({ route: 'verify-email', client: { platform: 'ios', version: '0.1234.5678.9' } });

    expect([...(redis.hashes.get('metrics:legacy-link-login:2026-10-17') ?? new Map()).keys()]).toEqual(['verify-email|ios|other']);
  });
});

describe('#10878 — le oui implicite d’un ancien client', () => {
  it('ancien client iOS, lien sans oui ⇒ oui implicite, porteur du client à compter', () => {
    expect(linkLoginConsent({ headers: iosHeaders('1.1.2'), confirm: undefined, linkDeviceSecret: undefined }))
      .toEqual({ confirmed: true, legacyClient: { platform: 'ios', version: '1.1.2' } });
  });

  it('nouveau client iOS ⇒ aucun oui implicite', () => {
    expect(linkLoginConsent({ headers: iosHeaders('1.1.4'), confirm: undefined, linkDeviceSecret: undefined }))
      .toEqual({ confirmed: false, legacyClient: null });
  });

  it('client inconnu ⇒ aucun oui implicite', () => {
    expect(linkLoginConsent({ headers: {}, confirm: undefined, linkDeviceSecret: undefined })).toEqual({ confirmed: false, legacyClient: null });
  });

  it('un oui EXPLICITE reste un oui, et ne se compte pas comme chemin hérité', () => {
    expect(linkLoginConsent({ headers: iosHeaders('1.1.2'), confirm: true, linkDeviceSecret: undefined })).toEqual({ confirmed: true, legacyClient: null });
  });

  it('le comptage ne compte que le chemin hérité, et ne lève jamais', async () => {
    const entries: unknown[] = [];
    const counter = { record: async (entry: unknown) => { entries.push(entry); } };
    countLegacyLinkLogin({ route: 'verify-email', consent: { confirmed: true, legacyClient: null }, counter });
    countLegacyLinkLogin({ route: 'verify-email', consent: { confirmed: true, legacyClient: { platform: 'ios', version: '1.1.2' } }, counter });
    expect(() => countLegacyLinkLogin({
      route: 'verify-email',
      consent: { confirmed: true, legacyClient: { platform: 'ios', version: '1.1.2' } },
      counter: { record: async () => { throw new Error('panne'); } },
    })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(entries).toEqual([{ route: 'verify-email', client: { platform: 'ios', version: '1.1.2' } }]);
  });
});
