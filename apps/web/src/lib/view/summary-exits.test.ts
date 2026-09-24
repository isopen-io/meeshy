import { describe, expect, test } from 'bun:test';

import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';

import { summaryExits } from './summary-exits';

function entryOf(evidenceMessageIds: readonly string[]): FaceRampEntry {
  return {
    id: 'p-1',
    displayName: 'Bruno',
    avatarUrl: null,
    colorHex: '#000000',
    presence: 'offline',
    awaitingCount: evidenceMessageIds.length,
    needScore: 1,
    evidenceMessageIds,
  };
}

function episodeOf(messageIds: readonly string[]): ConversationEpisode {
  return {
    id: 'e-1',
    start: 0,
    end: 1,
    messageIds,
    participantIds: [],
    deterministicTitle: 'Épisode',
    agentTitle: null,
  };
}

describe('summaryExits — les trois sorties du Résumé Vivant (#7429, extrait de routes/thread.tsx)', () => {
  test('visage ⇒ script + saut sur la PREMIÈRE preuve + pré-adressage', () => {
    const calls: string[] = [];
    const selectMode = (mode: string) => calls.push(`mode:${mode}`);
    const requestJump = (id: string | null) => calls.push(`jump:${id}`);
    const setReplyTarget = (id: string | null) => calls.push(`reply:${id}`);
    const exits = summaryExits({ selectMode, requestJump, setReplyTarget, resumeTarget: () => null });

    exits.onReplyToPerson(entryOf(['m-a', 'm-b']));

    expect(calls).toEqual(['mode:script', 'jump:m-a', 'reply:m-a']);
  });

  test('visage sans preuve ⇒ saut et pré-adressage sur null', () => {
    const calls: string[] = [];
    const exits = summaryExits({
      selectMode: (mode) => calls.push(`mode:${mode}`),
      requestJump: (id) => calls.push(`jump:${id}`),
      setReplyTarget: (id) => calls.push(`reply:${id}`),
      resumeTarget: () => null,
    });

    exits.onReplyToPerson(entryOf([]));

    expect(calls).toEqual(['mode:script', 'jump:null', 'reply:null']);
  });

  test('épisode ⇒ script + saut sur son PREMIER message', () => {
    const calls: string[] = [];
    const exits = summaryExits({
      selectMode: (mode) => calls.push(`mode:${mode}`),
      requestJump: (id) => calls.push(`jump:${id}`),
      setReplyTarget: () => {},
      resumeTarget: () => null,
    });

    exits.onOpenEpisode(episodeOf(['m-x', 'm-y']));

    expect(calls).toEqual(['mode:script', 'jump:m-x']);
  });

  test('épisode vide ⇒ saut sur null', () => {
    const calls: string[] = [];
    const exits = summaryExits({
      selectMode: (mode) => calls.push(`mode:${mode}`),
      requestJump: (id) => calls.push(`jump:${id}`),
      setReplyTarget: () => {},
      resumeTarget: () => null,
    });

    exits.onOpenEpisode(episodeOf([]));

    expect(calls).toEqual(['mode:script', 'jump:null']);
  });

  test('reprendre ⇒ script + la cible CALCULÉE AU MOMENT du geste (un thunk, jamais une valeur figée à la construction)', () => {
    const calls: string[] = [];
    let currentTarget = 'm-1';
    const exits = summaryExits({
      selectMode: (mode) => calls.push(`mode:${mode}`),
      requestJump: (id) => calls.push(`jump:${id}`),
      setReplyTarget: () => {},
      resumeTarget: () => currentTarget,
    });

    currentTarget = 'm-2'; // change APRÈS la construction, AVANT le geste
    exits.onResumeThread();

    expect(calls).toEqual(['mode:script', 'jump:m-2']);
  });

  test('aucune des trois sorties n’appelle selectMode avec autre chose que "script"', () => {
    const modes: string[] = [];
    const exits = summaryExits({
      selectMode: (mode) => modes.push(mode),
      requestJump: () => {},
      setReplyTarget: () => {},
      resumeTarget: () => null,
    });
    exits.onReplyToPerson(entryOf(['m-a']));
    exits.onOpenEpisode(episodeOf(['m-b']));
    exits.onResumeThread();
    expect(modes).toEqual(['script', 'script', 'script']);
  });
});
