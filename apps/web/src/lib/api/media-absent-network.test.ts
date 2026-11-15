import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { isMediaAbsent, noteMediaAbsent, resetAbsentMedia } from './media-absent';

/**
 * LE REGISTRE DES MÉDIAS ABSENTS NE SURVIT PAS À UNE RECONNEXION (#7022 suivi
 * — revue adversariale 2026-09-18).
 *
 * `media-absent.test.ts` garde la garde HORS LIGNE (un échec sous
 * `navigator.onLine === false` ne s'enregistre pas). Ce fichier garde son
 * COMPLÉMENT, qui a besoin d'un vrai `window` (happy-dom) : le retour du
 * réseau doit vider ce qu'une session hors-ligne aurait quand même gravé —
 * par exemple une absence apprise juste AVANT que `offline` ne se déclenche,
 * ou une absence VRAIE gravée en ligne, mais qui mérite d'être re-tentée une
 * fois la connexion meilleure (un timeout réseau bref peut produire le même
 * `onError` qu'un 404, sans que la garde `navigator.onLine` ne l'attrape —
 * l'interface reste `true` tant qu'une carte réseau existe, § `online.ts`).
 */
describe('le registre des médias absents et le retour du réseau — #7022', () => {
  beforeAll(() => {
    ensureHappyDomRegistered();
  });

  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  afterEach(() => {
    resetAbsentMedia();
  });

  test('l’évènement `online` vide le registre — une absence gravée redevient demandable', () => {
    const src = 'https://gate.meeshy.me/api/v1/attachments/file/2025%2F10%2Fretente.jpg';
    noteMediaAbsent(src);
    expect(isMediaAbsent(src)).toBe(true);

    window.dispatchEvent(new Event('online'));

    expect(isMediaAbsent(src)).toBe(false);
  });

  /**
   * CONTRE-ÉPREUVE — un autre évènement du même objet (`offline`, ou un
   * `online` qui ne se déclenche jamais) ne doit RIEN vider. Sans elle,
   * n'importe quel évènement passerait, et le témoin ne prouverait pas que
   * c'est bien `online` qui est écouté.
   */
  test('un `offline` ne vide RIEN — seul le retour du réseau redonne sa chance à une source', () => {
    const src = 'https://gate.meeshy.me/api/v1/attachments/file/2025%2F10%2Fretente-2.jpg';
    noteMediaAbsent(src);

    window.dispatchEvent(new Event('offline'));

    expect(isMediaAbsent(src)).toBe(true);
  });
});
