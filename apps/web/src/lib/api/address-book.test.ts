import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import { eraseAddressBook, performAddressBookErase, type AddressBookState } from './address-book';

/**
 * EFFACER MON CARNET D'ADRESSES (#8167) — `DELETE /directory/contacts`. Le
 * carnet est celui qu'un téléphone a synchronisé ; le serveur ne le garde que
 * pour annoncer l'arrivée d'un ami, et l'effacement le retire pour de bon.
 */

const ERASE = 'DELETE /api/v1/directory/contacts';

describe('eraseAddressBook — DELETE /directory/contacts', () => {
  test('le geste part sans corps et rend le nombre de fiches retirées', async () => {
    const { deps, calls } = scriptedGateway({ [ERASE]: { ok: true, data: { removedCount: 42 } } });

    expect(await eraseAddressBook(deps)).toEqual({ ok: true, data: { removedCount: 42 } });
    expect(calls()).toEqual([{ method: 'DELETE', path: '/api/v1/directory/contacts' }]);
  });

  test('une réponse illisible n’est jamais un effacement deviné', async () => {
    const { deps } = scriptedGateway({ [ERASE]: { ok: true, data: { removed: 'beaucoup' } } });

    const result = await eraseAddressBook(deps);

    expect(result.ok ? null : result.code).toBe('UNREADABLE');
  });

  test('un refus remonte tel quel', async () => {
    const { deps } = scriptedGateway({ [ERASE]: { ok: false, status: 429, error: 'Trop de synchronisations' } });

    expect((await eraseAddressBook(deps)).ok).toBe(false);
  });
});

describe('performAddressBookErase — optimiste, défait sur un refus', () => {
  test('l’écran dit « effacé » AVANT la réponse, et le garde sur un succès', async () => {
    const { deps } = scriptedGateway({ [ERASE]: { ok: true, data: { removedCount: 3 } } });
    const states: AddressBookState[] = [];

    const outcome = await performAddressBookErase({ deps, onState: (state) => states.push(state) });

    expect(outcome).toBe('erased');
    expect(states).toEqual(['erased']);
  });

  test('un échec rend l’état d’avant', async () => {
    const { deps } = scriptedGateway({ [ERASE]: { ok: false, status: 0, error: 'hors ligne' } });
    const states: AddressBookState[] = [];

    const outcome = await performAddressBookErase({ deps, onState: (state) => states.push(state) });

    expect(outcome).toBe('failed');
    expect(states).toEqual(['erased', 'kept']);
  });
});
