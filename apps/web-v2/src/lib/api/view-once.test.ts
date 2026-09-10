import { afterEach, describe, expect, test } from 'bun:test';

import { applyConsumption, consumeViewOnce } from './view-once';
import type { Transport } from '../net/transport';
import {
  PROTECTION_CONVERSATION_ID,
  VIEW_ONCE_OFFLINE_WITNESS_ID,
  messagesOf,
  recordViewOnceConsumption,
  resetViewOnceConsumptionForTests,
} from './fixtures';

/**
 * `consumedViewOnceIds` (`fixtures.ts`) vit pour la durée du PROCESSUS —
 * `bun test` partage le registre de modules entre TOUS les fichiers, pas
 * seulement entre les montages d'une route. Sans ce nettoyage,
 * `fixtures.test.ts` (qui attend `VIEW_ONCE_WITNESS_ID` à `viewOnceCount: 0`)
 * dépendrait de l'ORDRE d'exécution des fichiers — même discipline que
 * `scheme.test.ts` pour un état global comparable.
 */
afterEach(() => {
  resetViewOnceConsumptionForTests();
});

describe('consumeViewOnce — le port serveur (D-10, D-23)', () => {
  test('compose la MÉTHODE, le chemin EXACT de la route POST …/consume, SANS corps', async () => {
    const calls: { readonly method: string; readonly path: string; readonly body?: unknown }[] = [];
    const transport: Transport = async (request) => {
      calls.push(request);
      return { success: true };
    };

    await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'm1' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe('/api/v1/conversations/c1/messages/m1/consume');
    expect(calls[0]?.body).toBeUndefined();
  });
});

describe('applyConsumption — le réducteur IMMUABLE', () => {
  test('le message consommé porte le nouveau compte, les autres sont IDENTIQUES par référence', () => {
    const messages = messagesOf('c-deploiement');
    const target = messages[0]!;
    const updated = applyConsumption(messages, { messageId: target.id, viewOnceCount: 1 });

    expect(updated).not.toBe(messages);
    expect(updated.find((m) => m.id === target.id)?.viewOnceCount).toBe(1);
    for (let i = 0; i < messages.length; i += 1) {
      if (messages[i]?.id === target.id) continue;
      expect(updated[i]).toBe(messages[i]);
    }
  });

  test('un id absent du fil ne change rien (toutes les références identiques)', () => {
    const messages = messagesOf('c-deploiement');
    const updated = applyConsumption(messages, { messageId: 'introuvable', viewOnceCount: 3 });
    expect(updated).toEqual(messages);
    for (let i = 0; i < messages.length; i += 1) {
      expect(updated[i]).toBe(messages[i]);
    }
  });
});

describe('recordViewOnceConsumption — la consommation SURVIT au démontage de la route (revue #5676, défaut 7)', () => {
  test('avant tout appel, le témoin part bien de viewOnceCount: 0', () => {
    const before = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === VIEW_ONCE_OFFLINE_WITNESS_ID);
    expect(before?.viewOnceCount).toBe(0);
  });

  test('après record, une SECONDE lecture (nouveau montage simulé) rend viewOnceCount >= maxViewOnceCount', () => {
    recordViewOnceConsumption(VIEW_ONCE_OFFLINE_WITNESS_ID);

    // `messagesOf` REPART du tableau constant à chaque appel — exactement ce
    // qu'un remontage de route fait (`routes/thread.tsx:69`,
    // `useState(() => messagesOf(id))`). Deux appels DISTINCTS, pas une
    // relecture du même tableau : c'est ce que la route rejoue en quittant
    // le fil puis en y revenant.
    const first = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === VIEW_ONCE_OFFLINE_WITNESS_ID);
    const second = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === VIEW_ONCE_OFFLINE_WITNESS_ID);
    expect(first?.viewOnceCount).toBeGreaterThanOrEqual(first?.maxViewOnceCount ?? Infinity);
    expect(second?.viewOnceCount).toBeGreaterThanOrEqual(second?.maxViewOnceCount ?? Infinity);
  });

  test('un message NON vue-unique ignore un enregistrement (aucun crash, aucun champ étranger touché)', () => {
    const before = messagesOf('c-deploiement');
    recordViewOnceConsumption(before[0]!.id);
    const after = messagesOf('c-deploiement');
    expect(after).toEqual(before);
  });
});
