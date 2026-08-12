/**
 * Accumulateur de visibilité des messages.
 *
 * Traduit un flux d'apparitions/disparitions de bulles en lots de messages
 * RÉELLEMENT lus. Le seuil de présence (dwell) élimine les faux positifs du
 * défilement rapide : survoler 200 messages en une seconde n'en lit aucun.
 *
 * Miroir Swift : packages/MeeshySDK/.../SeenMessageAccumulator.swift — mêmes cas.
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

import { SeenMessageAccumulator } from '@/utils/seen-message-accumulator';

const DWELL = 300;

function makeAccumulator(overrides: Partial<{ dwellMs: number; batchSize: number }> = {}) {
  return new SeenMessageAccumulator({ dwellMs: DWELL, batchSize: 50, ...overrides });
}

describe('SeenMessageAccumulator — seuil de présence', () => {
  it('ne retient pas un message resté moins longtemps que le seuil', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 1000);
    acc.disappeared('m1', 1000 + DWELL - 1);

    expect(acc.drain(2000)).toEqual([]);
  });

  it('retient un message resté exactement le seuil', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 1000);
    acc.disappeared('m1', 1000 + DWELL);

    expect(acc.drain(2000)).toEqual(['m1']);
  });

  it('retient un message toujours visible dont le seuil est écoulé', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 1000);

    expect(acc.drain(1000 + DWELL)).toEqual(['m1']);
  });

  it('ne retient pas un message toujours visible dont le seuil court encore', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 1000);

    expect(acc.drain(1000 + DWELL - 1)).toEqual([]);
  });

  it('ignore une disparition jamais précédée d\'une apparition', () => {
    const acc = makeAccumulator();
    acc.disappeared('fantome', 5000);

    expect(acc.drain(9000)).toEqual([]);
  });
});

describe('SeenMessageAccumulator — réapparition', () => {
  it('cumule deux passages courts sans jamais atteindre le seuil', () => {
    // Défilement rapide dans un sens puis dans l'autre : aucune des deux
    // présences n'est une lecture, et leur somme n'en fait pas une non plus.
    const acc = makeAccumulator();
    acc.appeared('m1', 0);
    acc.disappeared('m1', 100);
    acc.appeared('m1', 500);
    acc.disappeared('m1', 600);

    expect(acc.drain(2000)).toEqual([]);
  });

  it('retient dès que la seconde présence franchit le seuil', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 0);
    acc.disappeared('m1', 100);
    acc.appeared('m1', 500);
    acc.disappeared('m1', 500 + DWELL);

    expect(acc.drain(2000)).toEqual(['m1']);
  });

  it('repart du dernier passage, sans créditer le temps hors écran', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 0);
    acc.disappeared('m1', 10);
    acc.appeared('m1', 10_000);

    expect(acc.drain(10_000 + DWELL - 1)).toEqual([]);
  });
});

describe('SeenMessageAccumulator — vidange', () => {
  it('ne signale pas deux fois le même message', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 0);

    expect(acc.drain(DWELL)).toEqual(['m1']);
    expect(acc.drain(10_000)).toEqual([]);
  });

  it('signale un lot prêt dès que la taille est atteinte', () => {
    const acc = makeAccumulator({ batchSize: 3 });
    acc.appeared('a', 0);
    acc.appeared('b', 0);
    expect(acc.isBatchReady(DWELL)).toBe(false);

    acc.appeared('c', 0);
    expect(acc.isBatchReady(DWELL)).toBe(true);
  });

  it('ne signale pas un lot prêt tant que le seuil n\'est pas écoulé', () => {
    const acc = makeAccumulator({ batchSize: 2 });
    acc.appeared('a', 0);
    acc.appeared('b', 0);

    expect(acc.isBatchReady(DWELL - 1)).toBe(false);
  });

  it('vide l\'état à la fermeture, en rendant ce qui était acquis', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 0);
    acc.appeared('m2', 0);

    // Passage en arrière-plan / fermeture : m1 et m2 ont franchi le seuil.
    expect(acc.drain(DWELL).sort()).toEqual(['m1', 'm2']);
    // Plus rien à réémettre ensuite, même si les bulles étaient encore à l'écran.
    expect(acc.drain(100_000)).toEqual([]);
  });

  it('rend les identifiants dans l\'ordre d\'acquisition', () => {
    const acc = makeAccumulator();
    acc.appeared('m1', 0);
    acc.appeared('m2', 50);
    acc.disappeared('m2', 50 + DWELL);

    // m2 franchit le seuil avant m1 malgré une apparition plus tardive.
    expect(acc.drain(60 + DWELL)).toEqual(['m2', 'm1']);
  });

  it('oublie les messages déjà signalés au-delà d\'un plafond, sans les réémettre aussitôt', () => {
    // Le garde-fou anti-doublon ne doit pas croître sans fin sur une longue
    // session : il est borné, et la conséquence d'un oubli est au pire un
    // signalement redondant — l'écriture serveur étant write-once.
    const acc = makeAccumulator({ batchSize: 1000 });
    for (let i = 0; i < 20; i++) acc.appeared(`m${i}`, 0);
    expect(acc.drain(DWELL)).toHaveLength(20);
    expect(acc.drain(DWELL + 1)).toEqual([]);
  });
});
