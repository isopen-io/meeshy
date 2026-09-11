import { describe, expect, test } from 'bun:test';

import { messagesOf } from './fixtures';
import { STATES_CONVERSATION_ID } from './fixtures-states';
import { place } from '@/lib/grouping';
import { VIEWER_ID } from './fixtures-base';

/**
 * T15 (#5936) — le corpus `c-states` porte un message PAR ÉTAT, RÉELLEMENT
 * servi par `messagesOf` (le chemin que `check-message-states.mjs` ouvre au
 * navigateur) — pas seulement déclaré dans `fixtures-states.ts`.
 */

const messages = () => messagesOf(STATES_CONVERSATION_ID);

const findOrThrow = (id: string) => {
  const found = messages().find((m) => m.id === id);
  if (found === undefined) throw new Error(`témoin introuvable : ${id}`);
  return found;
};

describe('le corpus c-states porte un message par état, RÉELLEMENT servi', () => {
  test('chaque témoin de la spécification existe', () => {
    const ids = messages().map((m) => m.id);
    expect(ids).toEqual([
      'st-intro',
      'st-badges',
      'st-fwd-group',
      'st-edited',
      'st-call',
      'st-join',
      'st-notice',
      'st-emoji-1',
      'st-emoji-2',
      'st-emoji-3',
      'st-sticker',
      'st-sticker-bare',
      'st-place',
      'st-story',
      'st-story-gone',
      'st-emoji-mine',
      'st-last',
    ]);
  });

  test('st-badges : pinnedAt + forwardedFromConversation.type "public" + isEdited', () => {
    const m = findOrThrow('st-badges');
    expect(m.pinnedAt).toBeDefined();
    expect(m.forwardedFromConversation?.type).toBe('public');
    expect(m.isEdited).toBe(true);
  });

  test('st-fwd-group : type "group"', () => {
    expect(findOrThrow('st-fwd-group').forwardedFromConversation?.type).toBe('group');
  });

  test('st-call, st-join, st-notice sont des messages SYSTÈME — la notice SANS messageSource', () => {
    const call = findOrThrow('st-call');
    expect(call.messageType).toBe('system');
    expect(call.messageSource).toBe('system');

    const join = findOrThrow('st-join');
    expect(join.messageType).toBe('system');
    expect(join.messageSource).toBe('system');

    const notice = findOrThrow('st-notice');
    expect(notice.messageType).toBe('system');
    expect(notice.messageSource).toBe('user');
  });

  test('st-emoji-1/2/3 portent 1, 2 puis 3 graphèmes', () => {
    expect(findOrThrow('st-emoji-1').content).toBe('👍');
    expect(findOrThrow('st-emoji-2').content).toBe('🎉🎉');
    expect(findOrThrow('st-emoji-3').content).toBe('🔥🔥🔥');
  });

  test('st-sticker a metadata.sticker ET une pièce image', () => {
    const m = findOrThrow('st-sticker');
    expect((m.metadata as { sticker?: unknown })?.sticker).toBeDefined();
    expect(m.attachments?.length).toBe(1);
    expect(m.attachments?.[0]?.mimeType).toBe('image/png');
  });

  test('st-sticker-bare n’a pas de pièce', () => {
    const m = findOrThrow('st-sticker-bare');
    expect((m.metadata as { sticker?: unknown })?.sticker).toBeDefined();
    expect(m.attachments ?? []).toHaveLength(0);
  });

  test('st-place porte metadata.location', () => {
    const location = (findOrThrow('st-place').metadata as { location?: { name?: string } })?.location;
    expect(location?.name).toBe('Tour Eiffel');
  });

  test('st-story a un id non vide, st-story-gone un id vide', () => {
    const story = findOrThrow('st-story');
    expect(story.storyReplyToId).toBe('p-story-1');
    const gone = findOrThrow('st-story-gone');
    expect(gone.storyReplyToId).toBe('p-story-2');
    expect((gone.metadata as { postReplyTo?: { id?: string } })?.postReplyTo?.id).toBe('');
  });

  /**
   * LA PLACE DE CHAQUE TÉMOIN (D-23 §1, leçon rejouée ici) — `st-call` est
   * `head` ET `tail` : un message système n'entre dans AUCUNE suite, ni
   * celle qui le précède ni celle qui le suit.
   */
  test('st-call est head ET tail — aucune suite ne le traverse', () => {
    const placed = place(messages(), { locale: 'fr' });
    const stCall = placed.find((p) => p.message.id === 'st-call');
    expect(stCall?.head).toBe(true);
    expect(stCall?.tail).toBe(true);
  });
});

/**
 * REVUE-CORRECTION #5936 — le corpus doit porter un corps NU du côté
 * ENVOYÉ : c'est la branche que `bubble.tsx` traite à part (aucune boîte
 * indigo, donc aucune teinte « meta-mine » à contraster), et aucun des
 * quatre runs du gate ne la mesurait.
 */
describe('st-emoji-mine — le corps nu du côté envoyé', () => {
  test('un emoji seul, envoyé par le lecteur', () => {
    const m = findOrThrow('st-emoji-mine');
    expect(m.senderId).toBe(VIEWER_ID);
    expect(m.content).toBe('👏');
    expect(m.attachments).toBeUndefined();
  });
});
