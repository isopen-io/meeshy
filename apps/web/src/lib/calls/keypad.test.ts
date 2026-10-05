import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { lookupUserByPhone } from '@/lib/api/users-phone';

import { classifyKeypadInput, KEYPAD_KEYS, keypadAppend, keypadDeleteLast, phoneLookupKey } from './keypad';

/**
 * LE PAVÉ DU HUB APPELS (#6454) — miroir de `KeypadViewModel.swift` : une seule
 * saisie qui est à la fois un numéro et un nom. Faite SEULEMENT de caractères
 * de téléphone, elle cherche un compte par numéro exact (`GET /users/phone/:phone`,
 * trois chiffres au moins) ; sinon par nom (deux caractères au moins).
 */

describe('la saisie se classe seule — la complexité se paie dans le code', () => {
  test('des chiffres, un « + » et des séparateurs : un numéro, dès trois chiffres', () => {
    expect(classifyKeypadInput('+33 6 12-34 (56).78')).toEqual({ kind: 'phone', value: '+33612345678' });
    expect(classifyKeypadInput('06')).toEqual({ kind: 'idle' });
    expect(classifyKeypadInput('061')).toEqual({ kind: 'phone', value: '061' });
  });

  test('toute autre saisie est un nom, dès deux caractères, espaces du bord retirés', () => {
    expect(classifyKeypadInput('  am ')).toEqual({ kind: 'name', value: 'am' });
    expect(classifyKeypadInput('a')).toEqual({ kind: 'idle' });
    expect(classifyKeypadInput('amina2')).toEqual({ kind: 'name', value: 'amina2' });
  });

  test('vide : au repos', () => {
    expect(classifyKeypadInput('   ')).toEqual({ kind: 'idle' });
  });

  test('« # » et « * » ne sont pas des caractères de téléphone : un nom', () => {
    expect(classifyKeypadInput('12#')).toEqual({ kind: 'name', value: '12#' });
  });
});

describe('les touches du pavé', () => {
  test('douze touches, dans l’ordre d’un téléphone, avec leurs lettres', () => {
    expect(KEYPAD_KEYS.map((key) => key.digit).join('')).toBe('123456789+0#');
    expect(KEYPAD_KEYS.find((key) => key.digit === '7')?.letters).toBe('PQRS');
  });

  test('ajouter, effacer le dernier caractère — sans rien casser sur une saisie vide', () => {
    expect(keypadAppend('06', '1')).toBe('061');
    expect(keypadDeleteLast('061')).toBe('06');
    expect(keypadDeleteLast('')).toBe('');
  });

  test('un numéro se cherche sous une clé stable, ses séparateurs retirés', () => {
    expect(phoneLookupKey('+33612345678')).toEqual(['keypad', 'phone', '+33612345678']);
  });
});

describe('le port de recherche par numéro — `GET /api/v1/users/phone/:phone`', () => {
  const replying = (status: number, body: unknown) => {
    const paths: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      paths.push(new URL(String(input)).pathname);
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    };
    return { paths, deps: { source: 'gateway' as const, transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }) } };
  };

  test('rend la personne servie, sans sa présence ni son numéro', async () => {
    const { paths, deps } = replying(200, {
      success: true,
      data: { id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null, isOnline: true, phoneNumber: '+33612345678' },
    });
    const result = await lookupUserByPhone(deps, '+33612345678');
    expect(paths).toEqual(['/api/v1/users/phone/%2B33612345678']);
    expect(result).toEqual({ ok: true, data: { id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null } });
  });

  test('un numéro sans compte (404) ou mal formé (400) : aucun résultat, jamais une erreur', async () => {
    expect(await lookupUserByPhone(replying(404, { success: false, error: 'User not found' }).deps, '061')).toEqual({ ok: true, data: null });
    expect(await lookupUserByPhone(replying(400, { success: false, error: 'Invalid phone number format' }).deps, '061')).toEqual({ ok: true, data: null });
  });

  test('une panne ou un refus de débit restent des pannes — l’écran dit l’erreur', async () => {
    expect((await lookupUserByPhone(replying(500, { success: false }).deps, '061')).ok).toBe(false);
    expect((await lookupUserByPhone(replying(429, { success: false }).deps, '061')).ok).toBe(false);
  });
});
