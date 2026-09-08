/**
 * LES TÉMOINS DE L'ADAPTATEUR DE PRISME.
 *
 * La RÈGLE est celle de `@meeshy/shared`, qui a ses propres témoins ; ce qui
 * se vérifie ici est que l'application l'appelle JUSTE — et c'est là que les
 * trois familles divergentes du dépôt sont nées, pas dans la règle.
 *
 * Le premier cas est celui qui compte : un témoin de RANG s'écrit sur un rang
 * AUTRE que le premier, sinon le court-circuit interdit (« la langue d'origine
 * est dans le prisme ⇒ afficher l'original ») et la règle juste rendent le
 * même verdict, et le témoin ne peut pas tomber.
 */
import { expect, test } from 'bun:test';

import { served } from './prism';

/** La forme que rend un message : un tableau de lignes `MessageTranslation`. */
const rows = (targetLanguage: string, translatedContent: string) => [
  {
    id: 't1',
    messageId: 'm1',
    targetLanguage,
    translatedContent,
    translationModel: 'medium' as const,
    createdAt: new Date(),
  },
];

test('la langue primaire gagne même quand la langue d’origine est dans le prisme à un rang inférieur', () => {
  const r = served({
    preferredLanguages: ['fr', 'en'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Bonjour', language: 'fr', translated: true });
});

test('sans traduction vers la langue primaire, le rang suivant est servi', () => {
  const r = served({
    preferredLanguages: ['de', 'fr'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r.text).toBe('Bonjour');
  expect(r.language).toBe('fr');
});

test('le message déjà écrit dans une langue du prisme est servi À SON RANG', () => {
  const r = served({
    preferredLanguages: ['en', 'fr'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Hello', language: 'en', translated: false });
});

test('aucune langue servie : l’original, jamais translations[0]', () => {
  const r = served({
    preferredLanguages: ['de'],
    originalLanguage: 'en',
    translations: rows('fr', 'Bonjour'),
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Hello', language: 'en', translated: false });
});

/**
 * La CARTE `{ langue: texte }` est la seconde forme, celle que la passerelle
 * précalcule pour une ligne de liste (`lastMessageTranslations`). Les deux
 * entrent par la même porte : c'est tout l'objet de l'adaptateur, et le seul
 * endroit où l'application pouvait se tromper de dialecte.
 */
test('la carte précalculée d’une ligne de liste descend le même prisme', () => {
  const r = served({
    preferredLanguages: ['fr'],
    originalLanguage: 'en',
    translations: { fr: 'Bonjour' },
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Bonjour', language: 'fr', translated: true });
});

test('une carte absente sert l’original sans lever', () => {
  const r = served({
    preferredLanguages: ['fr'],
    originalLanguage: 'en',
    translations: undefined,
    original: 'Hello',
  });
  expect(r).toEqual({ text: 'Hello', language: 'en', translated: false });
});
