/**
 * Les temoins du Prisme. Le premier est celui qui compte : un temoin de RANG
 * s'ecrit sur un rang AUTRE que le premier, sinon le court-circuit interdit et
 * la regle juste rendent le meme verdict et le temoin ne peut pas tomber.
 */
import { expect, test } from 'bun:test';

import { resolutionDuPrisme, servi } from './prisme';

test('la langue primaire gagne meme quand la langue d origine est dans le prisme a un rang inferieur', () => {
  // Prisme ['fr','en'], message ecrit en anglais, traduction francaise dispo.
  const r = resolutionDuPrisme(['fr', 'en'], 'en', [{ langue: 'fr', texte: 'Bonjour' }]);
  expect(r).toEqual({ langue: 'fr', texte: 'Bonjour' });
});

test('sans traduction vers la langue primaire, le rang suivant est servi', () => {
  const r = resolutionDuPrisme(['de', 'fr'], 'en', [{ langue: 'fr', texte: 'Bonjour' }]);
  expect(r).toEqual({ langue: 'fr', texte: 'Bonjour' });
});

test('le message deja ecrit dans une langue du prisme est servi a SON rang', () => {
  const r = resolutionDuPrisme(['en', 'fr'], 'en', [{ langue: 'fr', texte: 'Bonjour' }]);
  expect(r).toBe(null);
});

test('aucune langue servie : l original, jamais translations[0]', () => {
  const r = resolutionDuPrisme(['de'], 'en', [{ langue: 'fr', texte: 'Bonjour' }]);
  expect(r).toBe(null);
});

test('servi() dit la langue ET si le texte est traduit', () => {
  expect(servi(['fr'], 'en', [{ langue: 'fr', texte: 'Bonjour' }], 'Hello')).toEqual({
    texte: 'Bonjour',
    langue: 'fr',
    traduit: true,
  });
  expect(servi(['de'], 'en', [], 'Hello')).toEqual({ texte: 'Hello', langue: 'en', traduit: false });
});
