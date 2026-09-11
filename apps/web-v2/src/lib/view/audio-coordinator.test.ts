import { describe, expect, test } from 'bun:test';

import { createAudioCoordinator } from './audio-coordinator';

/**
 * `createAudioCoordinator()` — SANS DOM : le module ne touche à rien
 * d'autre que ses propres closures, miroir de
 * `ConversationAudioCoordinator.play()` (§ Étape 3 de la spécification).
 */
describe('createAudioCoordinator', () => {
  test('claim(a) puis claim(b) : le pause de a est appelé UNE fois, b devient actif', () => {
    const coordinator = createAudioCoordinator();
    let pauseACalls = 0;
    let pauseBCalls = 0;

    coordinator.claim('a', () => {
      pauseACalls += 1;
    });
    expect(pauseACalls).toBe(0);
    expect(coordinator.active()).toBe('a');

    coordinator.claim('b', () => {
      pauseBCalls += 1;
    });
    expect(pauseACalls).toBe(1);
    expect(pauseBCalls).toBe(0);
    expect(coordinator.active()).toBe('b');
  });

  test('release(b) libère l’actif ; release(a), déjà remplacé, ne rappelle rien', () => {
    const coordinator = createAudioCoordinator();
    let pauseACalls = 0;
    coordinator.claim('a', () => {
      pauseACalls += 1;
    });
    coordinator.claim('b', () => {});
    expect(pauseACalls).toBe(1);

    coordinator.release('b');
    expect(coordinator.active()).toBeNull();

    // 'a' n'est déjà plus l'actif depuis le claim('b', …) — le relâcher une
    // seconde fois ne doit RIEN faire, et surtout jamais rappeler pauseA.
    coordinator.release('a');
    expect(pauseACalls).toBe(1);
    expect(coordinator.active()).toBeNull();
  });

  test('claim(a) deux fois : idempotent, pauseA jamais appelé', () => {
    const coordinator = createAudioCoordinator();
    let pauseACalls = 0;
    const pauseA = () => {
      pauseACalls += 1;
    };
    coordinator.claim('a', pauseA);
    coordinator.claim('a', pauseA);
    expect(pauseACalls).toBe(0);
    expect(coordinator.active()).toBe('a');
  });

  test('subscribe : notifié seulement sur un CHANGEMENT de active(), jamais sur un claim redondant', () => {
    const coordinator = createAudioCoordinator();
    let notifications = 0;
    const unsubscribe = coordinator.subscribe(() => {
      notifications += 1;
    });

    coordinator.claim('a', () => {});
    expect(notifications).toBe(1);

    // Claim redondant du MÊME id : aucune notification.
    coordinator.claim('a', () => {});
    expect(notifications).toBe(1);

    coordinator.claim('b', () => {});
    expect(notifications).toBe(2);

    coordinator.release('b');
    expect(notifications).toBe(3);

    unsubscribe();
    coordinator.claim('c', () => {});
    expect(notifications).toBe(3);
  });
});
