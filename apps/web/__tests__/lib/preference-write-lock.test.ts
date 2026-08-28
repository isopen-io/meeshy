/**
 * Une écriture de préférence en vol doit être DÉCLARÉE, parce qu'une relecture
 * qui gagne la course contre elle annule un geste de l'utilisateur.
 *
 * `updatePrivacy` / `updateEncryption` appliquent OPTIMISTEMENT puis écrivent.
 * Entre les deux, la valeur juste n'existe que localement : une relecture qui
 * part pendant cette fenêtre rend l'ANCIENNE valeur du serveur et défait le
 * geste — et aucune annonce ne reste pour le refaire. Un réglage qui revient
 * tout seul est PIRE qu'un réglage périmé (leçon 310).
 *
 * Le verrou compte les écritures plutôt que d'en marquer une seule : deux
 * interrupteurs basculés coup sur coup se chevauchent, et la fin de la première
 * écriture ne prouve rien sur la seconde.
 */

import {
  isPreferenceWriteInFlight,
  trackPreferenceWrite,
} from '@/lib/preferences/preference-write-lock';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('preference write lock', () => {
  it('ne déclare aucune écriture au repos', () => {
    expect(isPreferenceWriteInFlight()).toBe(false);
  });

  it("déclare l'écriture pendant toute sa durée", async () => {
    const write = deferred<void>();
    const tracked = trackPreferenceWrite(() => write.promise);

    expect(isPreferenceWriteInFlight()).toBe(true);

    write.resolve(undefined);
    await tracked;

    expect(isPreferenceWriteInFlight()).toBe(false);
  });

  it('rend la valeur de l\'écriture', async () => {
    await expect(trackPreferenceWrite(async () => 'ok')).resolves.toBe('ok');
  });

  it('libère le verrou quand l\'écriture ÉCHOUE', async () => {
    // Sans le `finally`, un PATCH refusé laisserait le verrou posé pour toute
    // la vie de l'onglet : plus aucune relecture, donc plus aucun rattrapage.
    await expect(
      trackPreferenceWrite(async () => {
        throw new Error('offline');
      })
    ).rejects.toThrow('offline');

    expect(isPreferenceWriteInFlight()).toBe(false);
  });

  it('reste posé tant que la SECONDE de deux écritures chevauchantes court', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const a = trackPreferenceWrite(() => first.promise);
    const b = trackPreferenceWrite(() => second.promise);

    first.resolve(undefined);
    await a;

    expect(isPreferenceWriteInFlight()).toBe(true);

    second.resolve(undefined);
    await b;

    expect(isPreferenceWriteInFlight()).toBe(false);
  });
});
