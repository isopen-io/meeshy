import { describe, expect, test } from 'bun:test';

import { createEmailGate } from './email-gate';

/**
 * **LA DEMANDE DE VALIDATION DE L'E-MAIL** (#8365) — une promesse que la vue
 * de validation tranche : `true` quand le code est validé, `false` quand le
 * lecteur la ferme. Sans vue pour la présenter, personne ne tranchera : la
 * demande est refusée tout de suite plutôt que suspendue pour toujours.
 */

describe('createEmailGate', () => {
  test('sans présentateur, la demande est refusée sur-le-champ', async () => {
    const gate = createEmailGate();

    expect(await gate.ask('publish')).toBe(false);
    expect(gate.store.getState().pending).toBeNull();
  });

  test('avec un présentateur, la demande attend sa réponse et expose sa raison', async () => {
    const gate = createEmailGate();
    gate.attach();

    const answer = gate.ask('invite');
    expect(gate.store.getState().pending?.reason).toBe('invite');

    gate.settle(true);
    expect(await answer).toBe(true);
    expect(gate.store.getState().pending).toBeNull();
  });

  test('deux demandes simultanées partagent UNE vue et UNE réponse', async () => {
    const gate = createEmailGate();
    gate.attach();

    const first = gate.ask('publish');
    const second = gate.ask('link');
    expect(gate.store.getState().pending?.reason).toBe('publish');

    gate.settle(false);
    expect(await Promise.all([first, second])).toEqual([false, false]);
  });

  test('le présentateur détaché refuse la demande en cours', async () => {
    const gate = createEmailGate();
    const detach = gate.attach();
    const answer = gate.ask('publish');

    detach();

    expect(await answer).toBe(false);
    expect(await gate.ask('publish')).toBe(false);
  });
});
