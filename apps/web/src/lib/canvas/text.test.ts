import { describe, expect, test } from 'bun:test';

import { resolveSceneText } from './text';
import type { CanvasObject } from './document';

const textObject = (overrides: Partial<CanvasObject> = {}): CanvasObject => ({
  id: 't1',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

describe('resolveSceneText — le Prisme d’un objet texte de scène', () => {
  test('locale es, traductions en/de, prisme [fr,en] ⇒ anglais au RANG 2 (leçon 261)', () => {
    const result = resolveSceneText({
      object: textObject({
        locale: 'es',
        payload: { text: 'La escena habla sola.', translations: { en: 'The scene speaks for itself.', de: 'Die Szene spricht für sich.' } },
      }),
      preferredLanguages: ['fr', 'en'],
    });
    expect(result.text).toBe('The scene speaks for itself.');
    expect(result.language).toBe('en');
    expect(result.translated).toBe(true);
  });

  test('traduction fr seule, prisme [fr] ⇒ fr', () => {
    const result = resolveSceneText({
      object: textObject({ locale: 'en', payload: { text: 'Hello', translations: { fr: 'Bonjour' } } }),
      preferredLanguages: ['fr'],
    });
    expect(result.text).toBe('Bonjour');
    expect(result.language).toBe('fr');
    expect(result.translated).toBe(true);
  });

  test('aucune traduction ⇒ original, language = locale', () => {
    const result = resolveSceneText({
      object: textObject({ locale: 'de', payload: { text: 'Hallo' } }),
      preferredLanguages: ['fr', 'en'],
    });
    expect(result.text).toBe('Hallo');
    expect(result.language).toBe('de');
    expect(result.translated).toBe(false);
  });

  test('textColor prime sur color', () => {
    const result = resolveSceneText({
      object: textObject({ payload: { text: 'x', textColor: '#111111', color: '#222222' } }),
      preferredLanguages: [],
    });
    expect(result.color).toBe('#111111');
  });

  test('color seul, sans textColor', () => {
    const result = resolveSceneText({ object: textObject({ payload: { text: 'x', color: '#333333' } }), preferredLanguages: [] });
    expect(result.color).toBe('#333333');
  });

  /* LE CORPUS RÉEL écrit `textColor: "FFFFFF"` SANS dièse (relevé sur
     `gate.staging.meeshy.me` le 2026-09-17, quatre stories v3 sur sept) : posé
     tel quel, `color: FFFFFF` est une déclaration CSS INVALIDE, que le
     navigateur ignore — le texte héritait alors la couleur de son hôte (blanc
     dans le lecteur par hasard, sombre sur une carte du fil en clair). iOS lit
     l'hexadécimal avec ou sans dièse (`Color(hex:)`). */
  test('un hexadécimal SANS dièse (corpus réel) ⇒ une couleur CSS valide', () => {
    const result = resolveSceneText({ object: textObject({ payload: { text: 'x', textColor: 'FF3B30' } }), preferredLanguages: [] });
    expect(result.color).toBe('#FF3B30');
  });

  test('une couleur illisible ⇒ le blanc par défaut, jamais une déclaration invalide', () => {
    const result = resolveSceneText({ object: textObject({ payload: { text: 'x', textColor: 'rouge vif' } }), preferredLanguages: [] });
    expect(result.color).toBe('#FFFFFF');
  });

  test('aucune couleur déclarée ⇒ blanc (défaut Swift, fontSize 64/textColor blanc)', () => {
    const result = resolveSceneText({ object: textObject({ payload: { text: 'x' } }), preferredLanguages: [] });
    expect(result.color).toBe('#FFFFFF');
  });
});

/** Revue-correction #6898 — un texte se dimensionne sur la LARGEUR de la
 * scène rendue (`CanvasGeometry.scaleFactor = largeur / 1080`), jamais en
 * pixels fixes : la même scène se lit à la même échelle relative dans une
 * tuile réduite et sur une carte. */
describe('resolveSceneText — la taille, fraction de la largeur de scène', () => {
  test('fontSize 108 ⇒ un dixième de la largeur de la scène', () => {
    expect(resolveSceneText({ object: textObject({ payload: { text: 'x', fontSize: 108 } }), preferredLanguages: ['fr'] }).widthFraction).toBe(0.1);
  });

  test('fontSize absent ⇒ le défaut du décodeur iOS, 64 (`CanvasV3Migration.swift:877`)', () => {
    expect(resolveSceneText({ object: textObject({ payload: { text: 'x' } }), preferredLanguages: ['fr'] }).widthFraction).toBe(64 / 1080);
  });

  test('fontSize non numérique ou nul ⇒ le défaut, jamais un texte de taille nulle', () => {
    expect(resolveSceneText({ object: textObject({ payload: { text: 'x', fontSize: '92' } }), preferredLanguages: ['fr'] }).widthFraction).toBe(64 / 1080);
    expect(resolveSceneText({ object: textObject({ payload: { text: 'x', fontSize: 0 } }), preferredLanguages: ['fr'] }).widthFraction).toBe(64 / 1080);
  });
});
