import { describe, expect, test } from 'bun:test';

import { cancel, getState, start, subscribe } from './save-store';

/**
 * `storySaveStore` (#7116) — l'état d'un export vit HORS de React, miroir du
 * singleton `StoryPhotoSaveService` (`jobs`, `generations`,
 * `StoryPhotoSaveService.swift:36-366`).
 *
 * **REVUE** — trois défauts du premier jet que ces témoins gardent :
 *  1. l'hôte doublait le store d'un `useState` local : revenir sur une story
 *     dont l'export tournait rendait « Enregistrer » au lieu de l'anneau, et
 *     ce bouton était INERTE (le store refusait le second `start`) ; la
 *     progression d'un export se peignait sur l'anneau d'une AUTRE story.
 *     Le store est désormais la SEULE source, lue par un instantané STABLE.
 *  2. `report` gardait une valeur déjà réduite (0,45 pour 0,5) que personne
 *     ne lisait, pendant que l'anneau en recalculait une autre. Le store tient
 *     la progression BRUTE — `null` pour un flux sans `Content-Length`, le
 *     cas NOMINAL de la passerelle (`createReadStream`).
 *  3. un job ANNULÉ puis relancé : le `finish` tardif du premier retirait le
 *     SECOND. Chaque job reçoit une poignée liée à SA génération (miroir des
 *     `generations` iOS) — une poignée périmée n'écrit plus rien.
 */
describe('storySaveStore — une poignée par job, liée à SA génération', () => {
  test('`start` crée un job INDÉTERMINÉ (aucune longueur connue avant la réponse), annulable', () => {
    const job = start('st-1');
    expect(getState('st-1')).toEqual({ progress: null, cancellable: true });
    job?.finish();
  });

  test('un SECOND `start` pendant un job déjà en cours est IGNORÉ (idempotent, `:191`)', () => {
    const first = start('st-2');
    const second = start('st-2');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    first?.finish();
  });

  test('`report` garde la progression BRUTE ; `null` dit « indéterminée »', () => {
    const job = start('st-3');
    job?.report(0.5);
    expect(getState('st-3')?.progress).toBe(0.5);
    job?.report(null);
    expect(getState('st-3')?.progress).toBeNull();
    job?.finish();
  });

  test('`lockDelivery` : téléchargement plein, plus d’annulation (`isCancellable`, `:118-132`)', () => {
    const job = start('st-4');
    job?.report(null);
    job?.lockDelivery();
    expect(getState('st-4')).toEqual({ progress: 1, cancellable: false });
    job?.finish();
  });

  test('`cancel` coupe le flux (`signal`) et retire le job', () => {
    const job = start('st-5');
    cancel('st-5');
    expect(job?.signal.aborted).toBe(true);
    expect(getState('st-5')).toBeNull();
  });

  test('`cancel` sur une livraison entamée est SANS EFFET (`:236`)', () => {
    const job = start('st-6');
    job?.lockDelivery();
    cancel('st-6');
    expect(job?.signal.aborted).toBe(false);
    expect(getState('st-6')).toEqual({ progress: 1, cancellable: false });
    job?.finish();
  });

  test('UNE POIGNÉE PÉRIMÉE N’ÉCRIT PLUS : annulé puis relancé, le `finish` tardif du premier laisse le second en vol', () => {
    const first = start('st-7');
    cancel('st-7');
    const second = start('st-7');
    first?.report(0.9);
    first?.finish();
    expect(getState('st-7')).toEqual({ progress: null, cancellable: true });
    second?.finish();
    expect(getState('st-7')).toBeNull();
  });

  test('l’instantané est STABLE tant que rien ne change (`useSyncExternalStore` bouclerait sinon)', () => {
    const job = start('st-8');
    expect(getState('st-8')).toBe(getState('st-8'));
    job?.finish();
  });

  test('le job d’une story SURVIT au changement de story affichée : il est lu par sa clé, pas par l’écran', () => {
    const job = start('st-9');
    job?.report(0.2);
    expect(getState('st-autre')).toBeNull();
    expect(getState('st-9')?.progress).toBe(0.2);
    job?.finish();
  });

  test('`report` ne notifie que quand le CHIFFRE de l’anneau change — un rendu par pour-cent, jamais un par paquet réseau', () => {
    const job = start('st-10');
    let notifications = 0;
    const unsubscribe = subscribe(() => {
      notifications += 1;
    });
    job?.report(0.1);
    job?.report(0.1001);
    job?.report(0.1002);
    job?.report(0.5);
    job?.report(null);
    job?.report(null);
    job?.lockDelivery();
    job?.finish();
    expect(notifications).toBe(5);
    unsubscribe();
  });
});
