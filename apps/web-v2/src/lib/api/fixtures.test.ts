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
  BLURRED_WITNESS_ID,
  BURNED_WITNESS_ID,
  CONVERSATIONS,
  DELETED_WITNESS_ID,
  EPHEMERAL_WITNESS_ID,
  PROTECTION_CONVERSATION_ID,
  RIVER_CONTINUATION_WITNESS_ID,
  RIVER_NO_TRANSLATION_WITNESS_ID,
  THREAD_MESSAGES,
  VIEW_ONCE_OFFLINE_WITNESS_ID,
  VIEW_ONCE_WITNESS_ID,
  messagesOf,
} from './fixtures';
import { flagsOf } from './preferences';
import { place } from '../grouping';

const ALL_MESSAGES = [
  ...THREAD_MESSAGES,
  ...messagesOf('c-salon-riviere'),
  ...messagesOf('c-rattrapage'),
  ...messagesOf('c-medias'),
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
  const placed = place(river, { locale: 'fr' });
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

/**
 * LA SALLE SÉCURISÉE (D-23, #5676) — les six témoins de protection, chacun
 * dans son état exact, dans l'ordre chronologique.
 */
test('la Salle sécurisée porte les six témoins de protection, chronologiques, dans SA conversation', () => {
  const room = messagesOf(PROTECTION_CONVERSATION_ID);
  const ids = [
    BLURRED_WITNESS_ID,
    VIEW_ONCE_WITNESS_ID,
    VIEW_ONCE_OFFLINE_WITNESS_ID,
    EPHEMERAL_WITNESS_ID,
    DELETED_WITNESS_ID,
    BURNED_WITNESS_ID,
  ];
  for (const id of ids) {
    expect(room.some((m) => m.id === id)).toBe(true);
  }
  for (const m of room) {
    expect(m.conversationId).toBe(PROTECTION_CONVERSATION_ID);
  }
  const times = room.map((m) => new Date(m.createdAt).getTime());
  expect(times).toEqual([...times].sort((a, b) => a - b));
});

test('BLURRED_WITNESS_ID : isBlurred, contenu non vide', () => {
  const witness = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === BLURRED_WITNESS_ID);
  expect(witness?.isBlurred).toBe(true);
  expect((witness?.content ?? '').length).toBeGreaterThan(0);
});

test('VIEW_ONCE_WITNESS_ID : vue unique non consommée, ET une traduction (le témoin « pas de drapeau » doit pouvoir rougir)', () => {
  const witness = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === VIEW_ONCE_WITNESS_ID);
  expect(witness?.isViewOnce).toBe(true);
  expect(witness?.viewOnceCount).toBe(0);
  expect(witness?.maxViewOnceCount).toBe(1);
  expect((witness?.translations?.length ?? 0) > 0).toBe(true);
});

/**
 * LA SECONDE CONDITION DU MÊME TÉMOIN (revue) — la traduction ne suffit pas :
 * `mountsBottomLine` exige aussi `isLastInGroup`. Un `prot-3` continué par un
 * message du MÊME auteur ne porterait aucun drapeau, garde `isVeiled` posée
 * ou non — le témoin DOM de `check-thread-states.mjs` restait alors vert avec
 * la garde retirée des deux peaux (mesuré). Ce test épingle la PLACE, pas
 * seulement le champ : c'est elle qui rend le témoin falsifiable.
 */
test('VIEW_ONCE_WITNESS_ID est le DERNIER de son groupe — sans quoi le témoin « pas de drapeau » ne peut pas rougir', () => {
  const placed = place(messagesOf(PROTECTION_CONVERSATION_ID), { locale: 'fr' });
  expect(placed.find((p) => p.message.id === VIEW_ONCE_WITNESS_ID)?.tail).toBe(true);
});

test('EPHEMERAL_WITNESS_ID : expiresAt dans le futur', () => {
  const witness = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === EPHEMERAL_WITNESS_ID);
  expect(witness?.expiresAt).toBeDefined();
  expect(new Date(witness!.expiresAt!).getTime()).toBeGreaterThan(Date.now());
});

test('DELETED_WITNESS_ID : deletedAt posé ET contenu NON VIDE (la fuite doit pouvoir rougir)', () => {
  const witness = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === DELETED_WITNESS_ID);
  expect(witness?.deletedAt).toBeDefined();
  expect((witness?.content ?? '').length).toBeGreaterThan(0);
});

test('BURNED_WITNESS_ID : viewOnceCount >= maxViewOnceCount (brûlé à l’arrivée)', () => {
  const witness = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === BURNED_WITNESS_ID);
  expect(witness?.viewOnceCount ?? 0).toBeGreaterThanOrEqual(witness?.maxViewOnceCount ?? Infinity);
});

test('l’aperçu de liste de la Salle sécurisée a un sujet flouté', () => {
  const room = CONVERSATIONS.find((c) => c.id === PROTECTION_CONVERSATION_ID);
  expect(room?.lastMessage?.isBlurred).toBe(true);
});

test('la Salle sécurisée n’est ni épinglée ni archivée (check-list-actions.mjs compte 2 archivées, 1 épinglée)', () => {
  const room = CONVERSATIONS.find((c) => c.id === PROTECTION_CONVERSATION_ID);
  expect(room).toBeDefined();
  const flags = flagsOf(room!);
  expect(flags.isPinned).toBe(false);
  expect(flags.isArchived).toBe(false);
});
