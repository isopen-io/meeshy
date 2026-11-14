import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { STOW_REDUCED_MS } from './call-pill-motion';
import { REACTION_LIFETIME_MS } from './call-control-state';

/**
 * **« RÉDUIRE LES ANIMATIONS » GARDE SES FONDUS COURTS** (loi 17.10) — la règle générale de la feuille (`app.css`,
 * règle 32) ramène toute animation CSS à 0,01 ms : les fondus réduits que l'appel déclare (`call-motion.css`,
 * `call-captions.css`, `call-unfolded-original.css`, la réaction) ne se voyaient donc jamais, et panneaux de la
 * pilule, feuilles et phrases paraissaient d'un coup. La règle générale lit désormais sa durée dans une propriété
 * `--reduced-fade`, enregistrée SANS héritage (sa valeur initiale est l'ancien instant) : ce qui déclare un fondu
 * réduit y pose sa durée, le fondu court du moteur (`STOW_REDUCED_MS`), et rien d'autre ne change.
 */

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const sheet = (name: string): string => strip(readFileSync(new URL(`../../styles/${name}`, import.meta.url), 'utf8'));

/** Le contenu des blocs `@media (prefers-reduced-motion: reduce)` d'une feuille, accolades comprises. */
const reducedBlocks = (css: string): string => {
  const parts: string[] = [];
  let from = css.indexOf('@media (prefers-reduced-motion: reduce)');
  while (from >= 0) {
    const open = css.indexOf('{', from);
    let depth = 1;
    let at = open + 1;
    while (depth > 0 && at < css.length) {
      depth += css[at] === '{' ? 1 : css[at] === '}' ? -1 : 0;
      at += 1;
    }
    parts.push(css.slice(open, at));
    from = css.indexOf('@media (prefers-reduced-motion: reduce)', at);
  }
  return parts.join('\n');
};

/** La durée que le bloc `selector { … }` de `css` pose sur `--reduced-fade`, s'il en pose une. */
const fadeOf = (css: string, selector: string): string | null => {
  const at = css.indexOf(selector);
  if (at < 0) return null;
  const body = css.slice(css.indexOf('{', at), css.indexOf('}', at));
  return /--reduced-fade:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? null;
};

describe('la règle générale lit sa durée dans une propriété que l’appel peut poser (app.css)', () => {
  const app = sheet('app.css');

  test('sous « Réduire les animations », la durée de toute animation est `--reduced-fade`, toujours imposée', () => {
    expect(reducedBlocks(app)).toMatch(/animation-duration:\s*var\(--reduced-fade\)\s*!important/);
    expect(reducedBlocks(app)).toMatch(/transition-duration:\s*0s\s*!important/);
  });

  test('la propriété est enregistrée sans héritage, et vaut par défaut l’ancien instant : rien d’autre ne change', () => {
    const registered = /@property\s+--reduced-fade\s*\{([^}]*)\}/.exec(app)?.[1] ?? '';
    expect(registered).toMatch(/syntax:\s*'<time>'/);
    expect(registered).toMatch(/inherits:\s*false/);
    expect(registered).toMatch(/initial-value:\s*0\.01ms/);
  });
});

describe('ce que l’appel fond sous « Réduire les animations » garde un fondu court', () => {
  const short = `${STOW_REDUCED_MS}ms`;

  test('le texte de la pilule, l’image dans l’image, les rangées, le réseau et la feuille (call-motion.css)', () => {
    const reduced = reducedBlocks(sheet('call-motion.css'));
    for (const selector of ['[data-call-pill-text]', '[data-call-pip]', "[data-call-deck-content='rows']", '[data-call-signal]', '[data-call-sheet-panel]', '[data-call-sheet-scrim]']) expect({ selector, fade: fadeOf(reduced, selector) }).toEqual({ selector, fade: short });
  });

  test('les trois points d’attente et la traduction qui remplace l’original (call-captions.css)', () => {
    const reduced = reducedBlocks(sheet('call-captions.css'));
    for (const selector of ['[data-call-caption-waiting]', "button[data-call-caption-line] > span[dir='auto']"]) expect({ selector, fade: fadeOf(reduced, selector) }).toEqual({ selector, fade: short });
  });

  test('l’original déplié sous sa phrase (call-unfolded-original.css)', () => {
    expect(fadeOf(reducedBlocks(sheet('call-unfolded-original.css')), '[data-call-unfolded-original]')).toBe(short);
  });

  test('ces fondus réduits n’animent que l’opacité : aucun déplacement', () => {
    for (const name of ['call-motion.css', 'call-captions.css', 'call-unfolded-original.css']) expect({ name, moves: /transform:\s*(?!none)/.test(reducedBlocks(sheet(name)).replace(/--reduced-fade[^;]*;/g, '')) }).toEqual({ name, moves: false });
  });

  test('la réaction s’efface sur place le temps de sa vie, au lieu de disparaître en 0,01 ms', () => {
    const overlays = readFileSync(new URL('../../components/call-control-overlays.tsx', import.meta.url), 'utf8');
    expect(overlays).toContain('@media (prefers-reduced-motion:reduce){[data-call-reaction]{--reduced-fade:${REACTION_LIFETIME_MS}ms;animation-name:call-reaction-fade');
    expect(REACTION_LIFETIME_MS).toBeGreaterThan(STOW_REDUCED_MS);
  });
});
