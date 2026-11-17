import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from './chrome-action';

/**
 * LES DISQUES D'EN-TÊTE RÉPONDENT À L'APPUI (#18412). La cible porte la classe
 * `chrome-action`, que la feuille `ui.css` lit : le disque se fonce à l'appui
 * de l'écart « soft » de K02, sans échelle, et une cible sans disque reçoit le
 * même voile sur son propre fond. Le remplissage du disque vit dans la
 * feuille, jamais en ligne : un style en ligne masquerait l'état pressé.
 */

const UI = readFileSync(new URL('../styles/ui.css', import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const blockOf = (selector: string): string => {
  const start = UI.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return UI.slice(start, UI.indexOf('}', start));
};

describe('la cible ronde du chrome répond à l’appui', () => {
  test('la classe de la cible tactile porte chrome-action', () => {
    expect(CHROME_ACTION_HIT_CLASS.split(' ')).toContain('chrome-action');
  });

  test('le disque ne porte plus de remplissage en ligne : la feuille le dessine', () => {
    const html = renderToStaticMarkup(<ChromeActionDisc>+</ChromeActionDisc>);
    expect(html).toContain('data-chrome-disc');
    expect(html).not.toContain('background');
  });

  test('au repos, le disque garde 18 % de sa propre encre', () => {
    expect(blockOf('[data-chrome-disc]')).toContain('background-color: color-mix(in srgb, transparent, currentColor var(--chrome-disc-fill, 18%))');
  });

  test('à l’appui, le disque monte de dix points, sans transition et sans échelle', () => {
    const pressed = blockOf('.chrome-action:active:not(:disabled) [data-chrome-disc]');
    expect(pressed).toContain('--chrome-disc-fill: 28%');
    expect(pressed).toContain('transition: none');
    expect(pressed).not.toMatch(/scale|transform/);
  });

  test('il revient au repos en 200 ms, le fondu de K02', () => {
    expect(blockOf('[data-chrome-disc]')).toContain('transition: background-color 200ms ease');
  });

  test('une cible sans disque reçoit le voile sur son propre fond, sans échelle', () => {
    const veil = blockOf('.chrome-action:not(:has([data-chrome-disc])):active:not(:disabled)');
    expect(veil).toContain('background-color: color-mix(in srgb, transparent, currentColor 10%)');
    expect(veil).not.toMatch(/scale|transform/);
  });
});
