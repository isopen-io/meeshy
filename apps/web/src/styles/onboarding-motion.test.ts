import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * L'ACCUEIL N'ANIME QUE CE QUI SE COMPOSE (#18322, M6) — ni l'ombre du bouton
 * principal au passage actif ↔ désactivé, ni le fond de l'anneau de la carte
 * Story : seuls transform, rotate, scale et opacity bougent image par image.
 */
const CSS = readFileSync(new URL('./onboarding.css', import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const transitions = [...CSS.matchAll(/\btransition\s*:\s*([^;]*);/g)].map((found) => found[1]);
const keyframeBodies = [...CSS.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\n\}/g)].map((found) => found[1]);

describe('onboarding.css — l’accueil anime sans repeindre', () => {
  test('aucune transition ne porte l’ombre', () => {
    expect(transitions.filter((value) => /box-shadow/.test(value))).toEqual([]);
  });

  test('aucune keyframe n’anime une propriété personnalisée qui pilote une peinture', () => {
    expect(keyframeBodies.filter((body) => /--[\w-]+\s*:/.test(body))).toEqual([]);
  });

  test('l’anneau de la Story se révèle par une rotation et un fondu, sur sa propre couche', () => {
    const ring = CSS.slice(CSS.indexOf('.onb-story-ring::before {'), CSS.indexOf('}', CSS.indexOf('.onb-story-ring::before {')));
    expect(ring).toContain('animation: onb-ring');
    const frames = CSS.slice(CSS.indexOf('@keyframes onb-ring {'), CSS.indexOf('@keyframes onb-ring-bell'));
    expect(frames).toMatch(/rotate:/);
    expect(frames).toMatch(/opacity:/);
  });
});
