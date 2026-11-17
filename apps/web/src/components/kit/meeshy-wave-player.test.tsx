import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyWaveBars, MeeshyWavePlayer, meeshyWaveBarsLaw, meeshyWavePlayerRecipe, type MeeshyWavePlayerWords } from './meeshy-wave-player';

const { mount, render, act } = kitMount();

const WORDS: MeeshyWavePlayerWords = {
  play: 'Lire',
  pause: 'Mettre en pause',
  replay: 'Rejouer',
  buffering: 'chargement',
  unavailable: 'indisponible',
  position: 'Position',
  positionText: (elapsed, total) => `${elapsed} secondes sur ${total}`,
};
const SAMPLES = Array.from({ length: 120 }, (_, index) => ((index * 37) % 100) / 100);

const disc = (container: HTMLElement): HTMLButtonElement => container.querySelector('[data-kit-wave-disc]') as HTMLButtonElement;
const wave = (container: HTMLElement): HTMLElement => container.querySelector('[data-kit-wave-zone]') as HTMLElement;

describe('MeeshyWavePlayer — la loi des barres', () => {
  test('une barre tous les 6 px au plus, quels que soient la largeur et le nombre de niveaux', () => {
    for (const width of [80, 123, 300, 600]) {
      for (const count of [0, 1, 2, 15, 500, 2000]) {
        const levels = meeshyWaveBarsLaw.resample(Array.from({ length: count }, () => 0.5), width);
        expect(levels.length).toBeLessThanOrEqual(Math.floor(width / 6));
        expect(levels.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('zéro niveau : barres plates, jamais une onde inventée', () => {
    expect(meeshyWaveBarsLaw.resample([], 300).every((level) => level === 0)).toBe(true);
  });

  test('jamais de barre sous 3 de haut, jamais au-delà de la hauteur de l’onde', () => {
    const heights = meeshyWaveBarsLaw.heights([0, 0.01, 0.5, 1, 4], 40);
    expect(heights.every((height) => height >= 3 && height <= 40)).toBe(true);
    expect(heights[0]).toBe(3);
    expect(heights[3]).toBe(40);
  });

  test('le rééchantillonnage garde les extrémités de l’onde', () => {
    const levels = meeshyWaveBarsLaw.resample([0.2, 0.9], 120);
    expect(levels[0]).toBeCloseTo(0.2, 5);
    expect(levels[levels.length - 1]).toBeCloseTo(0.9, 5);
  });

  test('le nombre de barres pleines ne dépend que de progress : 0 aucune, 1 toutes', () => {
    expect(meeshyWaveBarsLaw.filled(0, 40)).toBe(0);
    expect(meeshyWaveBarsLaw.filled(1, 40)).toBe(40);
    expect(meeshyWaveBarsLaw.filled(0.5, 40)).toBe(20);
    expect(meeshyWaveBarsLaw.filled(7, 40)).toBe(40);
    expect(meeshyWaveBarsLaw.filled(-2, 40)).toBe(0);
  });
});

describe('MeeshyWavePlayer — la recette en valeurs', () => {
  test('rangée : disque 60, glyphe 22, écart 14, onde 40, barres de 3 · 3 ; compacte : 44, 18, 10, 28', () => {
    expect(meeshyWavePlayerRecipe({ size: 'row' })).toMatchObject({ disc: 60, glyph: 22, gap: 14, height: 60, waveHeight: 40, barWidth: 3, barGap: 3, zoneHeight: 44 });
    expect(meeshyWavePlayerRecipe({ size: 'compact' })).toMatchObject({ disc: 44, glyph: 18, gap: 10, height: 44, waveHeight: 28 });
  });

  test('le disque garde 44 au moins dans les deux tailles', () => {
    expect(meeshyWavePlayerRecipe({ size: 'compact' }).tapTarget).toBeGreaterThanOrEqual(44);
  });

  test('la phase dit le glyphe : repos lecture, lecture pause, terminé rejouer', () => {
    expect(meeshyWavePlayerRecipe({ progress: 0, isPlaying: false }).glyphKind).toBe('play');
    expect(meeshyWavePlayerRecipe({ progress: 0.4, isPlaying: true }).glyphKind).toBe('pause');
    expect(meeshyWavePlayerRecipe({ progress: 0.4, isPlaying: false }).glyphKind).toBe('play');
    expect(meeshyWavePlayerRecipe({ progress: 1, isPlaying: false }).glyphKind).toBe('replay');
  });

  test('les barres ne respirent que pendant la lecture ; jamais en mouvement réduit', () => {
    expect(meeshyWavePlayerRecipe({ isPlaying: true }).barsLive).toBe(true);
    expect(meeshyWavePlayerRecipe({ isPlaying: false }).barsLive).toBe(false);
    expect(meeshyWavePlayerRecipe({ isPlaying: true, reduceMotion: true }).barsLive).toBe(false);
    expect(meeshyWavePlayerRecipe({ isPlaying: true, phase: 'unavailable' }).barsLive).toBe(false);
  });

  test('indisponible : disque éteint, aucune action ; tampon : anneau', () => {
    expect(meeshyWavePlayerRecipe({ phase: 'unavailable' })).toMatchObject({ isActionable: false, discOpacity: 0.4 });
    expect(meeshyWavePlayerRecipe({ phase: 'buffering' }).showsRing).toBe(true);
    expect(meeshyWavePlayerRecipe({ phase: 'ready' }).showsRing).toBe(false);
  });

  test('pressé : le disque descend à 0,94', () => {
    expect(meeshyWavePlayerRecipe({ isPressed: true }).pressedScale).toBe(0.94);
  });

  test('la durée : total au repos, temps restant en lecture, écoulé si demandé', () => {
    expect(meeshyWavePlayerRecipe({ progress: 0, isPlaying: false, duration: 9 }).clockSeconds).toBe(9);
    expect(meeshyWavePlayerRecipe({ progress: 0.5, isPlaying: true, duration: 10 }).clockSeconds).toBe(5);
    expect(meeshyWavePlayerRecipe({ progress: 0.25, isPlaying: true, duration: 8, clock: 'elapsed' }).clockSeconds).toBe(2);
    expect(meeshyWavePlayerRecipe({ progress: 0.25, isPlaying: true, duration: 8, clock: 'total' }).clockSeconds).toBe(8);
    expect(meeshyWavePlayerRecipe({ duration: 0 }).clockSeconds).toBeNull();
    expect(meeshyWavePlayerRecipe({ phase: 'unavailable', duration: 9 }).clockSeconds).toBeNull();
  });

  test('pendant le glissement, le remplissage suit le doigt et ignore le progress reçu', () => {
    expect(meeshyWavePlayerRecipe({ progress: 0.2, isScrubbing: true, scrubFraction: 0.8 }).shownProgress).toBe(0.8);
    expect(meeshyWavePlayerRecipe({ progress: 0.2 }).shownProgress).toBe(0.2);
  });
});

describe('MeeshyWavePlayer — le composant', () => {
  const props = { label: 'Voix de Léo', samples: SAMPLES, duration: 9, words: WORDS } as const;

  test('deux éléments : le disque, nommé « Lire Voix de Léo », et l’onde réglable', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={0} isPlaying={false} onToggle={() => {}} onScrub={() => {}} />);
    expect(disc(container).getAttribute('aria-label')).toBe('Lire, Voix de Léo');
    expect(disc(container).tagName).toBe('BUTTON');
    const zone = wave(container);
    expect(zone.getAttribute('role')).toBe('slider');
    expect(zone.getAttribute('aria-valuenow')).toBe('0');
    expect(zone.getAttribute('aria-valuemax')).toBe('9');
  });

  test('en lecture : « Mettre en pause », valeur « 5 secondes sur 9 »', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={5 / 9} isPlaying onToggle={() => {}} onScrub={() => {}} />);
    expect(disc(container).getAttribute('aria-label')).toBe('Mettre en pause, Voix de Léo');
    expect(wave(container).getAttribute('aria-valuetext')).toBe('5 secondes sur 9');
  });

  test('terminé : « Rejouer »', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={1} isPlaying={false} onToggle={() => {}} />);
    expect(disc(container).getAttribute('aria-label')).toBe('Rejouer, Voix de Léo');
  });

  test('les barres sont muettes', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={0.5} isPlaying={false} onToggle={() => {}} />);
    expect(container.querySelector('[data-kit-wave-bars]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('toucher le disque appelle onToggle une fois', () => {
    let toggles = 0;
    const container = mount(<MeeshyWavePlayer {...props} progress={0} isPlaying={false} onToggle={() => (toggles += 1)} />);
    act(() => disc(container).click());
    expect(toggles).toBe(1);
  });

  test('indisponible : ni action ni tic, dit en mots', () => {
    let toggles = 0;
    const container = mount(<MeeshyWavePlayer {...props} phase="unavailable" progress={0} isPlaying={false} onToggle={() => (toggles += 1)} />);
    act(() => disc(container).click());
    expect(toggles).toBe(0);
    expect(disc(container).getAttribute('aria-disabled')).toBe('true');
    expect(container.textContent).toContain('indisponible');
    expect(container.querySelector('[data-kit-wave-clock]')?.textContent).toBe('–:––');
  });

  test('tampon : dit « chargement » et reste un bouton qui met en pause', () => {
    const container = mount(<MeeshyWavePlayer {...props} phase="buffering" progress={0.3} isPlaying onToggle={() => {}} />);
    expect(container.textContent).toContain('chargement');
    expect(disc(container).getAttribute('aria-disabled')).toBeNull();
  });

  test('la durée tient sur une ligne, en chiffres tabulaires : « 0:09 »', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={0} isPlaying={false} onToggle={() => {}} />);
    expect(container.querySelector('[data-kit-wave-clock]')?.textContent).toBe('0:09');
  });

  test('sans onScrub, l’onde ne se touche pas : une image, pas un curseur', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={0.5} isPlaying={false} onToggle={() => {}} />);
    expect(container.querySelector('[role="slider"]')).toBeNull();
    expect(container.querySelector('[data-kit-wave-zone]')?.getAttribute('role')).toBe('img');
  });

  test('un toucher bref sur l’onde place la lecture, borné de 0 à 1, une fois au relâcher', () => {
    const scrubs: number[] = [];
    const container = mount(<MeeshyWavePlayer {...props} progress={0} isPlaying={false} onToggle={() => {}} onScrub={(fraction) => scrubs.push(fraction)} />);
    const zone = wave(container);
    zone.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 44, height: 44, x: 0, y: 0, toJSON: () => ({}) });
    zone.setPointerCapture = () => {};
    act(() => {
      zone.dispatchEvent(Object.assign(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }), { clientX: 50 }));
    });
    expect(scrubs).toEqual([]);
    act(() => {
      zone.dispatchEvent(Object.assign(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }), { clientX: 50 }));
    });
    expect(scrubs).toEqual([0.25]);
  });

  test('un glissement suit le doigt, signale doigt posé et doigt levé, et n’envoie qu’au relâcher', () => {
    const scrubs: number[] = [];
    const states: boolean[] = [];
    const container = mount(<MeeshyWavePlayer {...props} progress={0.1} isPlaying={false} onToggle={() => {}} onScrub={(fraction) => scrubs.push(fraction)} onScrubbingChange={(value) => states.push(value)} />);
    const zone = wave(container);
    zone.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 44, height: 44, x: 0, y: 0, toJSON: () => ({}) });
    zone.setPointerCapture = () => {};
    const fire = (type: string, clientX: number) =>
      act(() => {
        zone.dispatchEvent(Object.assign(new PointerEvent(type, { bubbles: true, pointerId: 1 }), { clientX }));
      });
    fire('pointerdown', 20);
    fire('pointermove', 100);
    fire('pointermove', 900);
    expect(scrubs).toEqual([]);
    expect(zone.getAttribute('data-scrubbing')).toBe('');
    fire('pointerup', 900);
    expect(scrubs).toEqual([1]);
    expect(states).toEqual([true, false]);
  });

  test('un défilement vertical de la page ne déclenche aucun glissement : touch-action pan-y', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={0} isPlaying={false} onToggle={() => {}} onScrub={() => {}} />);
    expect(wave(container).getAttribute('data-kit-wave-zone')).toBe('');
    const css = readFileSync(fileURLToPath(new URL('../../styles/kit-wave-player.css', import.meta.url)), 'utf8');
    expect(css).toMatch(/touch-action:\s*pan-y/);
  });

  test('les flèches déplacent la lecture de 5 %, Début et Fin vont aux extrémités', () => {
    const scrubs: number[] = [];
    const container = mount(<MeeshyWavePlayer {...props} progress={0.5} isPlaying={false} onToggle={() => {}} onScrub={(fraction) => scrubs.push(fraction)} />);
    const zone = wave(container);
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      act(() => {
        zone.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    }
    expect(scrubs.map((value) => Math.round(value * 100) / 100)).toEqual([0.55, 0.45, 0, 1]);
  });

  test('trailing : l’emplacement après la durée, vide par défaut', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={0} isPlaying={false} onToggle={() => {}} trailing={<b>1×</b>} />);
    expect(container.querySelector('[data-kit-wave-trailing]')?.textContent).toBe('1×');
    expect(mount(<MeeshyWavePlayer {...props} progress={0} isPlaying={false} onToggle={() => {}} />).querySelector('[data-kit-wave-trailing]')).toBeNull();
  });

  test('la teinte est opaque et remise par l’hôte', () => {
    const container = mount(<MeeshyWavePlayer {...props} tint="#7C5CFF" progress={0} isPlaying={false} onToggle={() => {}} />);
    expect(container.querySelector<HTMLElement>('[data-kit-wave-player]')?.style.getPropertyValue('--kit-wave-tint')).toBe('#7C5CFF');
  });

  test('le remplissage avance sans que le disque ni la durée se re-rendent : la valeur dite suit progress', () => {
    const container = mount(<MeeshyWavePlayer {...props} progress={0.1} isPlaying onToggle={() => {}} onScrub={() => {}} />);
    render(<MeeshyWavePlayer {...props} progress={0.6} isPlaying onToggle={() => {}} onScrub={() => {}} />);
    expect(wave(container).getAttribute('aria-valuenow')).toBe('5');
  });

  test('label obligatoire et non vide', () => {
    expect(() => mount(<MeeshyWavePlayer {...props} label="" progress={0} isPlaying={false} onToggle={() => {}} />)).toThrow();
  });
});

describe('MeeshyWaveBars — l’onde seule', () => {
  test('rend des barres, jamais de disque ni de durée', () => {
    const container = mount(<MeeshyWaveBars samples={SAMPLES} progress={0.5} isLive={false} />);
    expect(container.querySelectorAll('[data-kit-wave-bar]').length).toBeGreaterThan(0);
    expect(container.querySelector('button')).toBeNull();
  });

  test('la moitié des barres est jouée à progress 0,5', () => {
    const container = mount(<MeeshyWaveBars samples={SAMPLES} progress={0.5} isLive={false} />);
    const bars = [...container.querySelectorAll('[data-kit-wave-bar]')];
    expect(bars.filter((bar) => bar.hasAttribute('data-played')).length).toBe(Math.round(bars.length / 2));
  });
});

describe('MeeshyWavePlayer — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucun appel de lecture, aucun flou', () => {
    for (const file of ['./meeshy-wave-player.tsx', './meeshy-wave-player-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|useMediaPlayback|new Audio|HTMLAudioElement|\.play\(|backdrop-filter|box-shadow/);
    }
  });
});
