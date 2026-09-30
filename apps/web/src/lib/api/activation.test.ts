import { describe, expect, test } from 'bun:test';

import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { decodeActivation, loadMyActivation, loadMyPhonePresence, requestPhoneCode, verifyPhoneCode } from './activation';

/**
 * **L'ÉTAT D'ACTIVATION SERVI** (#8239, contrat #8238) — `activation: { phase,
 * deadline, missing }` dans la charge de l'utilisateur courant. Une passerelle
 * qui ne le sert pas (ou qui sert une forme inconnue) ne change RIEN : le
 * décodage rend `null`, jamais une invitation fabriquée.
 */
const DEADLINE = '2026-10-20T10:00:00.000Z';

describe('décoder activation', () => {
  test('les quatre phases servies passent, avec leur échéance et ce qui manque', () => {
    expect(decodeActivation({ phase: 'invite', deadline: DEADLINE, missing: ['email', 'phone'] })).toEqual({
      phase: 'invite',
      deadline: DEADLINE,
      missing: ['email', 'phone'],
    });
    expect(decodeActivation({ phase: 'done', deadline: null, missing: ['phone'] })).toEqual({ phase: 'done', deadline: null, missing: ['phone'] });
    expect(decodeActivation({ phase: 'quiet', deadline: DEADLINE, missing: ['email'] })?.phase).toBe('quiet');
    expect(decodeActivation({ phase: 'blocked', deadline: DEADLINE, missing: ['email'] })?.phase).toBe('blocked');
  });

  test('champ absent ou phase inconnue ⇒ null (aucun changement)', () => {
    expect(decodeActivation(undefined)).toBeNull();
    expect(decodeActivation(null)).toBeNull();
    expect(decodeActivation({ phase: 'grace', deadline: null, missing: [] })).toBeNull();
    expect(decodeActivation({ deadline: null, missing: [] })).toBeNull();
  });

  test('un canal inconnu dans missing est écarté, pas la charge entière', () => {
    expect(decodeActivation({ phase: 'invite', deadline: DEADLINE, missing: ['email', 'pigeon'] })?.missing).toEqual(['email']);
    expect(decodeActivation({ phase: 'invite', deadline: DEADLINE })?.missing).toEqual([]);
  });
});

describe('lire l’activation de soi', () => {
  test('GET me.root ⇒ l’activation ET l’adresse EN CLAIR, gardées en mémoire vive', async () => {
    const t = routedTransport((req) =>
      pathOf(req) === '/api/v1/me'
        ? { ok: true, data: { user: { id: 'u1', username: 'amina', email: 'amina@example.test', activation: { phase: 'invite', deadline: DEADLINE, missing: ['email'] } } } }
        : undefined,
    );
    const result = await loadMyActivation({ source: 'gateway', transport: t.transport });
    expect(result).toEqual({ ok: true, data: { activation: { phase: 'invite', deadline: DEADLINE, missing: ['email'] }, email: 'amina@example.test' } });
  });

  test('l’activation posée à côté de user est lue aussi', async () => {
    const t = routedTransport(() => ({ ok: true, data: { user: { id: 'u1', email: 'a@b.test' }, activation: { phase: 'invite', deadline: DEADLINE, missing: ['phone'] } } }));
    const result = await loadMyActivation({ source: 'gateway', transport: t.transport });
    expect(result.ok && result.data.activation?.missing).toEqual(['phone']);
  });

  test('une passerelle sans activation ⇒ activation null', async () => {
    const t = routedTransport(() => ({ ok: true, data: { user: { id: 'u1', email: 'a@b.test' } } }));
    const result = await loadMyActivation({ source: 'gateway', transport: t.transport });
    expect(result).toEqual({ ok: true, data: { activation: null, email: 'a@b.test' } });
  });
});

describe('le profil a-t-il un numéro ? (#8843)', () => {
  test('GET me.root ⇒ un numéro servi, non vide ⇒ vrai', async () => {
    const t = routedTransport((req) => (pathOf(req) === '/api/v1/me' ? { ok: true, data: { user: { id: 'u1', phoneNumber: '+33612345678' } } } : undefined));
    expect(await loadMyPhonePresence({ source: 'gateway', transport: t.transport })).toEqual({ ok: true, data: true });
  });

  test('aucun numéro, ou un numéro vide ⇒ faux', async () => {
    for (const phoneNumber of [undefined, null, '', '   ']) {
      const t = routedTransport(() => ({ ok: true, data: { user: { id: 'u1', phoneNumber } } }));
      expect(await loadMyPhonePresence({ source: 'gateway', transport: t.transport })).toEqual({ ok: true, data: false });
    }
  });

  test('un échec réseau remonte tel quel — l’hôte ne propose rien sur un doute', async () => {
    const t = routedTransport(() => ({ ok: false, status: 503, error: 'down' }));
    const result = await loadMyPhonePresence({ source: 'gateway', transport: t.transport });
    expect(result.ok).toBe(false);
  });
});

describe('le numéro, par le parcours existant (celui d’iOS)', () => {
  test('envoyer le code : POST change-phone avec le numéro compacté', async () => {
    const t = routedTransport(() => ({ ok: true, data: { message: 'sent' } }));
    const result = await requestPhoneCode({ source: 'gateway', transport: t.transport }, ' +33 6 12 34 56 78 ');
    expect(result.ok).toBe(true);
    expect(t.calls()).toEqual([{ method: 'POST', path: '/api/v1/users/me/change-phone', body: { newPhoneNumber: '+33612345678' } }]);
  });

  test('un numéro qui n’est pas international ne part pas', async () => {
    const t = routedTransport(() => ({ ok: true, data: {} }));
    const result = await requestPhoneCode({ source: 'gateway', transport: t.transport }, '0612');
    expect(result.ok).toBe(false);
    expect(t.calls()).toEqual([]);
  });

  test('valider le code : POST verify-phone-change', async () => {
    const t = routedTransport(() => ({ ok: true, data: {} }));
    await verifyPhoneCode({ source: 'gateway', transport: t.transport }, '123456');
    expect(t.calls()).toEqual([{ method: 'POST', path: '/api/v1/users/me/verify-phone-change', body: { code: '123456' } }]);
  });
});
