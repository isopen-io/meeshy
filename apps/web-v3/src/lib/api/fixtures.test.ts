/**
 * LE CORPUS DE FIXTURES NE PEUT PAS FAIRE ÉCHOUER UN TÉMOIN DE PRISME S'IL
 * NE PEUT PAS LE VALIDER. Correction de revue #5648, défaut majeur 4 :
 * `RIVER_MESSAGES` servait `content` (l'original) comme SA PROPRE
 * traduction « en » sur les 32 messages d'origine française — ouvrir 🇬🇧 sur
 * l'un d'eux affichait le français. Une traduction identique au texte
 * d'origine ne peut faire tomber AUCUN témoin de Prisme (`resolvePrismTranslation`
 * rendrait le même résultat qu'une absence de traduction) : ce témoin
 * garde tout le corpus, pas seulement `c-salon-riviere`.
 */
import { expect, test } from 'bun:test';

import {
  CONVERSATIONS,
  RIVER_CONTINUATION_WITNESS_ID,
  RIVER_NO_TRANSLATION_WITNESS_ID,
  THREAD_MESSAGES,
  messagesOf,
} from './fixtures';
import { place } from '../grouping';

const ALL_MESSAGES = [
  ...THREAD_MESSAGES,
  ...messagesOf('c-salon-riviere'),
  ...CONVERSATIONS.flatMap((c) => (c.lastMessage ? [c.lastMessage] : [])),
];

test('aucune traduction du corpus ne répète le texte du message d’origine', () => {
  const offenders = ALL_MESSAGES.flatMap((message) =>
    (message.translations ?? [])
      .filter((t) => t.translatedContent.trim() === message.content.trim())
      .map((t) => `${message.id} → ${t.targetLanguage}`),
  );
  expect(offenders).toEqual([]);
});

test('le Salon Rivière traduit ses 32 messages français par une VRAIE traduction anglaise, sauf le TÉMOIN sans traduction (#5648)', () => {
  const river = messagesOf('c-salon-riviere');
  const frenchOriginals = river.filter((m) => m.originalLanguage === 'fr');
  expect(frenchOriginals.length).toBe(32);
  // `RIVER_NO_TRANSLATION_WITNESS_ID` viole DÉLIBÉRÉMENT cet invariant — la
  // forme « message sans traduction ni réaction » que §10 de
  // `check-reading-mode.mjs` élit pour prouver l'absence de recouvrement du
  // tampon de focus (défaut 1, correction de revue #5648). Son absence de
  // traduction est vérifiée à part, ci-dessous.
  for (const message of frenchOriginals) {
    if (message.id === RIVER_NO_TRANSLATION_WITNESS_ID) continue;
    const en = message.translations?.find((t) => t.targetLanguage === 'en');
    expect(en).toBeDefined();
    expect(en?.translatedContent.trim()).not.toBe(message.content.trim());
  }
});

/**
 * LES DEUX TÉMOINS DU DÉFAUT 1 (#5648, correction de revue) — `place()` (la
 * MÊME loi de regroupement que la rangée plate consomme) doit rendre
 * `tail === false` pour le témoin de continuation, et le témoin sans
 * traduction doit porter un tableau `translations` VIDE et aucune réaction :
 * sans ces deux formes dans le corpus, `mountsBottomLine` ne peut jamais
 * rendre `false` sur `c-salon-riviere` et le témoin visuel de non-
 * recouvrement (`check-reading-mode.mjs` §10) ne prouve rien.
 */
test('le Salon Rivière porte une rangée de CONTINUATION (tail === false)', () => {
  const river = messagesOf('c-salon-riviere');
  const placed = place(river);
  const witness = placed.find((p) => p.message.id === RIVER_CONTINUATION_WITNESS_ID);
  expect(witness).toBeDefined();
  expect(witness?.tail).toBe(false);
  expect((witness?.message.translations?.length ?? 0) > 0).toBe(true);
});

test('le Salon Rivière porte une rangée SANS traduction ni réaction', () => {
  const river = messagesOf('c-salon-riviere');
  const witness = river.find((m) => m.id === RIVER_NO_TRANSLATION_WITNESS_ID);
  expect(witness).toBeDefined();
  expect(witness?.translations ?? []).toEqual([]);
  expect(Object.keys(witness?.reactionSummary ?? {}).length).toBe(0);
});
