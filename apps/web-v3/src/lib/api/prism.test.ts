/**
 * Les temoins du Prisme. Le premier est celui qui compte : un temoin de RANG
 * s'ecrit sur un rang AUTRE que le premier, sinon le court-circuit interdit et
 * la regle juste rendent le meme verdict et le temoin ne peut pas tomber.
 */
import { expect, test } from 'bun:test';

import { resolvePrism, served } from './prism';

test('la langue primaire gagne meme quand la langue d origine est dans le prisme a un rang inferieur', () => {
  // Prisme ['fr','en'], message ecrit en anglais, traduction francaise dispo.
  const r = resolvePrism(['fr', 'en'], 'en', [{ language: 'fr', text: 'Bonjour' }]);
  expect(r).toEqual({ language: 'fr', text: 'Bonjour' });
});

test('sans traduction vers la langue primaire, le rang suivant est servi', () => {
  const r = resolvePrism(['de', 'fr'], 'en', [{ language: 'fr', text: 'Bonjour' }]);
  expect(r).toEqual({ language: 'fr', text: 'Bonjour' });
});

test('le message deja ecrit dans une langue du prisme est servi a SON rang', () => {
  const r = resolvePrism(['en', 'fr'], 'en', [{ language: 'fr', text: 'Bonjour' }]);
  expect(r).toBe(null);
});

test('aucune langue servie : l original, jamais translations[0]', () => {
  const r = resolvePrism(['de'], 'en', [{ language: 'fr', text: 'Bonjour' }]);
  expect(r).toBe(null);
});

test('servi() dit la langue ET si le texte est traduit', () => {
  expect(served(['fr'], 'en', [{ language: 'fr', text: 'Bonjour' }], 'Hello')).toEqual({
    text: 'Bonjour',
    language: 'fr',
    translated: true,
  });
  expect(served(['de'], 'en', [], 'Hello')).toEqual({ text: 'Hello', language: 'en', translated: false });
});
