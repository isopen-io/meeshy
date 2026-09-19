import { describe, expect, test } from 'bun:test';

import {
  STORY_DEFAULT_REACTION,
  applyStoryReaction,
  hasReactedToStory,
  storyReactionPlan,
  toggleStoryReaction,
} from './reaction';

const story = (id: string, mine: readonly string[] | null | undefined, count = 0) => ({
  id,
  currentUserReactions: mine,
  reactionCount: count,
});

describe('storyReactionPlan — la LECTURE d’état qui diffère du Flux', () => {
  test('un emoji absent de MES réactions s’ajoute, un emoji présent se retire', () => {
    expect(storyReactionPlan({ mine: [], emoji: '❤️' })).toBe('add');
    expect(storyReactionPlan({ mine: ['❤️'], emoji: '❤️' })).toBe('remove');
  });

  test('un emoji DIFFÉRENT du mien s’ajoute quand même — on ne remplace pas en silence', () => {
    expect(storyReactionPlan({ mine: ['👏'], emoji: '❤️' })).toBe('add');
  });

  test('`currentUserReactions` ABSENT ou `null` vaut « aucune » — jamais une levée', () => {
    /* La passerelle sert `null` pour une colonne optionnelle, et le corpus du
       plateau (`projection=tray`) ne porte pas ce champ du tout. */
    expect(storyReactionPlan({ mine: undefined, emoji: '❤️' })).toBe('add');
    expect(storyReactionPlan({ mine: null, emoji: '❤️' })).toBe('add');
  });

  test('le défaut est celui de `LikeSchema` côté passerelle', () => {
    expect(STORY_DEFAULT_REACTION).toBe('❤️');
  });
});

describe('toggleStoryReaction — immuable, et jamais deux fois', () => {
  test('ajouter pose l’emoji et monte le compte', () => {
    const next = toggleStoryReaction(story('st-1', [], 4), { storyId: 'st-1', emoji: '❤️', plan: 'add' });
    expect(next.currentUserReactions).toEqual(['❤️']);
    expect(next.reactionCount).toBe(5);
  });

  test('retirer enlève l’emoji et descend le compte, jamais sous zéro', () => {
    const next = toggleStoryReaction(story('st-1', ['❤️'], 1), { storyId: 'st-1', emoji: '❤️', plan: 'remove' });
    expect(next.currentUserReactions).toEqual([]);
    expect(next.reactionCount).toBe(0);
    const encore = toggleStoryReaction(story('st-1', ['❤️'], 0), { storyId: 'st-1', emoji: '❤️', plan: 'remove' });
    expect(encore.reactionCount).toBe(0);
  });

  test('une bascule DÉJÀ faite rend le MÊME objet — un optimiste confirmé ne recompte pas', () => {
    const deja = story('st-1', ['❤️'], 5);
    expect(toggleStoryReaction(deja, { storyId: 'st-1', emoji: '❤️', plan: 'add' })).toBe(deja);
  });

  test('une AUTRE story n’est pas touchée', () => {
    const autre = story('st-2', [], 3);
    expect(toggleStoryReaction(autre, { storyId: 'st-1', emoji: '❤️', plan: 'add' })).toBe(autre);
  });
});

describe('applyStoryReaction — le corpus, une story touchée', () => {
  test('la liste garde son IDENTITÉ quand rien ne change', () => {
    const corpus = [story('st-1', ['❤️'], 2), story('st-2', [], 0)];
    expect(applyStoryReaction(corpus, { storyId: 'st-1', emoji: '❤️', plan: 'add' })).toBe(corpus);
    expect(applyStoryReaction(undefined, { storyId: 'st-1', emoji: '❤️', plan: 'add' })).toBeUndefined();
  });

  test('seule la story visée change, les voisines gardent leur référence', () => {
    const corpus = [story('st-1', [], 2), story('st-2', [], 0)];
    const next = applyStoryReaction(corpus, { storyId: 'st-1', emoji: '❤️', plan: 'add' });
    expect(next?.[0]?.reactionCount).toBe(3);
    expect(next?.[1]).toBe(corpus[1]);
  });
});

describe('hasReactedToStory — ce que le cœur du rail peint', () => {
  test('vrai seulement pour un emoji que J’AI posé', () => {
    expect(hasReactedToStory(story('st-1', ['❤️']), '❤️')).toBe(true);
    expect(hasReactedToStory(story('st-1', ['👏']), '❤️')).toBe(false);
    expect(hasReactedToStory(undefined, '❤️')).toBe(false);
  });
});
