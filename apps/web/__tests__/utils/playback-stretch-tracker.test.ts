/**
 * Capture fidèle de l'interaction avec un média, pilotée par les ÉVÉNEMENTS.
 *
 * Un échantillonnage périodique perd structurellement du contenu : un média
 * d'une seconde n'est jamais échantillonné, une écoute de 500 ms non plus, et
 * même sur du contenu long la portion entre le dernier échantillon et la pause
 * disparaît. Réduire l'intervalle ne fait que déplacer le seuil de perte.
 *
 * Le lecteur, lui, connaît les frontières exactes. Chaque intervalle entre deux
 * frontières est une écoute continue — donc un segment exact — et la FRONTIÈRE
 * ELLE-MÊME est une information : s'être arrêté en pause, avoir sauté ailleurs,
 * coupé le son ou laissé le média finir ne racontent pas la même chose.
 *
 * La trace est donc chronologique et motivée. La couverture s'en déduit ; elle
 * n'est pas stockée à part.
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 */

import { PlaybackStretchTracker } from '@/utils/playback-stretch-tracker';

describe('PlaybackStretchTracker — capture exacte', () => {
  it('capture une écoute de 500 ms, qu\'un échantillonnage à 10 s aurait perdue', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.pause(500);

    expect(tracker.drain()).toEqual([{ startMs: 0, endMs: 500, endedBy: 'pause' }]);
  });

  it('capture un média d\'une seconde écouté en entier', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.completed(1000);

    expect(tracker.drain()).toEqual([{ startMs: 0, endMs: 1000, endedBy: 'completed' }]);
  });

  it('ne perd pas la portion écoutée après le dernier repère', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.pause(47_000);

    expect(tracker.drain()).toEqual([{ startMs: 0, endMs: 47_000, endedBy: 'pause' }]);
  });
});

describe('PlaybackStretchTracker — fidélité de l\'interaction', () => {
  it('distingue une pause d\'un déplacement de curseur', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.pause(1000);
    tracker.begin(1000);
    tracker.seek(2000, 8000);
    tracker.pause(8500);

    expect(tracker.drain()).toEqual([
      { startMs: 0, endMs: 1000, endedBy: 'pause' },
      { startMs: 1000, endMs: 2000, endedBy: 'seek' },
      { startMs: 8000, endMs: 8500, endedBy: 'pause' },
    ]);
  });

  it('retient qu\'un média a été abandonné plutôt que terminé', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.dismissed(1200);

    expect(tracker.drain()).toEqual([{ startMs: 0, endMs: 1200, endedBy: 'dismissed' }]);
  });

  it('retient une coupure du son — un média muet n\'est pas écouté', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.muted(800);

    expect(tracker.drain()).toEqual([{ startMs: 0, endMs: 800, endedBy: 'muted' }]);
    expect(tracker.hasOpenStretch).toBe(false);
  });

  it('préserve l\'ordre chronologique, pas l\'ordre des positions', () => {
    // L'utilisateur écoute la fin, puis revient au début : la trace doit dire
    // « fin d'abord », ce qu'un tri par position effacerait.
    const tracker = new PlaybackStretchTracker();
    tracker.begin(9000);
    tracker.seek(9500, 0);
    tracker.pause(400);

    expect(tracker.drain()).toEqual([
      { startMs: 9000, endMs: 9500, endedBy: 'seek' },
      { startMs: 0, endMs: 400, endedBy: 'pause' },
    ]);
  });

  it('distingue trois écoutes hachées d\'une seule continue', () => {
    const hachee = new PlaybackStretchTracker();
    hachee.begin(0); hachee.pause(300);
    hachee.begin(300); hachee.pause(600);
    hachee.begin(600); hachee.pause(900);

    const continue_ = new PlaybackStretchTracker();
    continue_.begin(0); continue_.pause(900);

    expect(hachee.drain()).toHaveLength(3);
    expect(continue_.drain()).toHaveLength(1);
  });
});

describe('PlaybackStretchTracker — robustesse', () => {
  it('ignore une fermeture sans ouverture', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.pause(500);

    expect(tracker.drain()).toEqual([]);
  });

  it('ignore une écoute de durée nulle', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(300);
    tracker.pause(300);

    expect(tracker.drain()).toEqual([]);
  });

  it('ignore une fermeture antérieure à l\'ouverture', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(900);
    tracker.pause(400);

    expect(tracker.drain()).toEqual([]);
  });

  it('une seconde ouverture sans fermeture clôt la première', () => {
    // Le lecteur a manqué un événement : on ne perd pas ce qui précède, on le
    // ferme à la position d'ouverture suivante en le marquant comme tel.
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.begin(700);
    tracker.pause(1200);

    expect(tracker.drain()).toEqual([
      { startMs: 0, endMs: 700, endedBy: 'superseded' },
      { startMs: 700, endMs: 1200, endedBy: 'pause' },
    ]);
  });

  it('déplacer le curseur à l\'arrêt n\'ouvre aucune écoute', () => {
    // Parcourir la barre de progression d'un média en pause ne fait rien
    // entendre : compter cela comme une écoute serait inventer une consommation.
    const tracker = new PlaybackStretchTracker();
    tracker.seek(0, 5000);

    expect(tracker.hasOpenStretch).toBe(false);
    tracker.pause(6000);
    expect(tracker.drain()).toEqual([]);
  });

  it('déplacer le curseur en lecture rouvre bien une écoute', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.seek(1000, 5000);

    expect(tracker.hasOpenStretch).toBe(true);
  });

  it('drain vide l\'état sans rendre deux fois la même écoute', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.pause(500);

    expect(tracker.drain()).toHaveLength(1);
    expect(tracker.drain()).toEqual([]);
  });

  it('drain préserve une écoute encore ouverte', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.pause(400);
    tracker.begin(400);

    expect(tracker.drain()).toEqual([{ startMs: 0, endMs: 400, endedBy: 'pause' }]);
    expect(tracker.hasOpenStretch).toBe(true);

    tracker.pause(900);
    expect(tracker.drain()).toEqual([{ startMs: 400, endMs: 900, endedBy: 'pause' }]);
  });

  it('dismissed sans position ferme au dernier repère observé', () => {
    // Fermeture brutale : la position finale n'est pas toujours lisible, mais
    // la dernière observée vaut mieux que perdre l'écoute entière.
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.observe(650);
    tracker.dismissed();

    expect(tracker.drain()).toEqual([{ startMs: 0, endMs: 650, endedBy: 'dismissed' }]);
  });

  it('observe ne crée pas de segment par lui-même', () => {
    const tracker = new PlaybackStretchTracker();
    tracker.begin(0);
    tracker.observe(200);
    tracker.observe(400);

    expect(tracker.drain()).toEqual([]);
    expect(tracker.hasOpenStretch).toBe(true);
  });
});
