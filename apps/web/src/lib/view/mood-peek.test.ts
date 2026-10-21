import { afterEach, describe, expect, test } from 'bun:test';

import type { StatusMoodPost } from '@/lib/api/stories';

import { closeMoodPeek, currentMoodPeek, peekMood, registerMoodPeekHost } from './mood-peek';
import { moodPeekContent } from './mood-peek-content';

/**
 * **CE QUE MONTRE UN TOUCHER SUR L'HUMEUR** (#10528) — l'humeur et le texte
 * qui l'accompagne, lus dans le corpus DÉJÀ servi (`?scope=statuses`) : le
 * client ne demande rien de plus et n'invente rien.
 */

afterEach(() => {
  closeMoodPeek();
});

const posts: readonly StatusMoodPost[] = [
  { id: 'st-2', authorId: 'u-nour', moodEmoji: '🎉', content: 'On fête ça ce soir', originalLanguage: 'fr', translations: { en: { text: 'Celebrating tonight' } } },
  { id: 'st-1', authorId: 'u-nour', moodEmoji: '😴', content: 'Fatiguée' },
  { id: 'st-3', authorId: 'u-sam', moodEmoji: '☕', content: null },
];

describe('le magasin du toucher', () => {
  test('sans hôte, rien ne s’ouvre', () => {
    expect(peekMood({ authorId: 'u-nour', emoji: '🎉' })).toBe(false);
    expect(currentMoodPeek()).toBeNull();
  });

  test('avec un hôte, le toucher pose l’humeur ; la fermeture la retire', () => {
    const release = registerMoodPeekHost();
    expect(peekMood({ authorId: 'u-nour', emoji: '🎉', name: 'Nour' })).toBe(true);
    expect(currentMoodPeek()).toEqual({ authorId: 'u-nour', emoji: '🎉', name: 'Nour' });
    closeMoodPeek();
    expect(currentMoodPeek()).toBeNull();
    release();
  });

  test('le dernier hôte qui part referme', () => {
    const release = registerMoodPeekHost();
    peekMood({ authorId: 'u-nour', emoji: '🎉' });
    release();
    expect(currentMoodPeek()).toBeNull();
  });
});

describe('le contenu montré', () => {
  test('l’humeur COURANTE de l’auteur et son texte', () => {
    expect(moodPeekContent({ posts, authorId: 'u-nour', emoji: '🎉', languages: ['fr'] })).toEqual({
      emoji: '🎉',
      text: 'On fête ça ce soir',
      language: 'fr',
      postId: 'st-2',
    });
  });

  /** Témoin de RANG sur un rang autre que le premier (leçon 261) : `de` n'est
   * pas servi, `en` l'est. */
  test('le texte descend le Prisme du lecteur', () => {
    expect(moodPeekContent({ posts, authorId: 'u-nour', emoji: '🎉', languages: ['de', 'en'] })).toEqual({
      emoji: '🎉',
      text: 'Celebrating tonight',
      language: 'en',
      postId: 'st-2',
    });
  });

  test('une humeur sans texte ne montre que l’humeur', () => {
    expect(moodPeekContent({ posts, authorId: 'u-sam', emoji: '☕', languages: ['fr'] })).toEqual({ emoji: '☕', text: '', postId: 'st-3' });
  });

  test('un auteur absent du corpus : l’humeur touchée, sans texte inventé', () => {
    expect(moodPeekContent({ posts, authorId: 'u-zed', emoji: '🌙', languages: ['fr'] })).toEqual({ emoji: '🌙', text: '' });
  });
});
