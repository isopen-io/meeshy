import { describe, expect, test } from 'bun:test';

import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';

import { episodeTargetOf, faceTargetOf, summaryExits } from './summary-exits';

function entryOf(evidenceMessageIds: readonly string[]): FaceRampEntry {
  return {
    id: 'p-1',
    displayName: 'Bruno',
    avatarUrl: null,
    colorHex: '#000000',
    participant: undefined,
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
    const exits = summaryExits({ selectMode, requestJump, setReplyTarget, replyable: () => true, resumeTarget: () => null });

    exits.onReplyToPerson(entryOf(['m-a', 'm-b']));

    expect(calls).toEqual(['mode:script', 'jump:m-a', 'reply:m-a']);
  });

  test('visage sans preuve ⇒ saut et pré-adressage sur null', () => {
    const calls: string[] = [];
    const exits = summaryExits({
      selectMode: (mode) => calls.push(`mode:${mode}`),
      requestJump: (id) => calls.push(`jump:${id}`),
      setReplyTarget: (id) => calls.push(`reply:${id}`),
      replyable: () => true,
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
      replyable: () => true,
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
      replyable: () => true,
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
      replyable: () => true,
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
      replyable: () => true,
      resumeTarget: () => null,
    });
    exits.onReplyToPerson(entryOf(['m-a']));
    exits.onOpenEpisode(episodeOf(['m-b']));
    exits.onResumeThread();
    expect(modes).toEqual(['script', 'script', 'script']);
  });

  test('visage sur un message auquel on ne peut pas répondre d’ici (bout en bout, droit d’écrire retiré) ⇒ script + saut, sans pré-adressage (#11372)', () => {
    const calls: string[] = [];
    const exits = summaryExits({
      selectMode: (mode) => calls.push(`mode:${mode}`),
      requestJump: (id) => calls.push(`jump:${id}`),
      setReplyTarget: (id) => calls.push(`reply:${id}`),
      replyable: (id) => id !== 'm-a',
      resumeTarget: () => null,
    });

    exits.onReplyToPerson(entryOf(['m-a', 'm-b']));

    expect(calls).toEqual(['mode:script', 'jump:m-a']);
  });
});

describe('LE MENU D’UNE ENTRÉE DU RÉSUMÉ (#11225) — Aller au message · Répondre, Répondre gardé par la loi', () => {
  const journal = (replyable: (id: string) => boolean) => {
    const calls: string[] = [];
    const exits = summaryExits({
      selectMode: (mode) => calls.push(`mode:${mode}`),
      requestJump: (id) => calls.push(`jump:${id}`),
      setReplyTarget: (id) => calls.push(`reply:${id}`),
      replyable,
      resumeTarget: () => null,
    });
    return { calls, menu: exits.entryMenu };
  };

  test('une entrée désigne le message où son toucher mène : la PREMIÈRE preuve d’un visage, le PREMIER message d’un épisode', () => {
    expect(faceTargetOf(entryOf(['m-a', 'm-b']))).toBe('m-a');
    expect(faceTargetOf(entryOf([]))).toBeNull();
    expect(episodeTargetOf(episodeOf(['m-x', 'm-y']))).toBe('m-x');
    expect(episodeTargetOf(episodeOf([]))).toBeNull();
  });

  test('un message auquel on peut répondre d’ici ⇒ Aller au message · Répondre, dans cet ordre', () => {
    const { menu } = journal(() => true);
    expect(menu.actionsOf('m-a')).toEqual(['goToMessage', 'reply']);
  });

  test('un message auquel on ne peut PAS répondre d’ici (bout en bout, droit d’écrire retiré) ⇒ Aller au message seul', () => {
    const { menu } = journal((id) => id !== 'm-locked');
    expect(menu.actionsOf('m-locked')).toEqual(['goToMessage']);
  });

  test('« Aller au message » ⇒ script + saut, SANS pré-adressage (c’est ce qui le distingue du toucher d’un visage)', () => {
    const { calls, menu } = journal(() => true);
    menu.run('goToMessage', 'm-a');
    expect(calls).toEqual(['mode:script', 'jump:m-a']);
  });

  test('« Répondre » ⇒ script + saut + pré-adressage du message désigné', () => {
    const { calls, menu } = journal(() => true);
    menu.run('reply', 'm-x');
    expect(calls).toEqual(['mode:script', 'jump:m-x', 'reply:m-x']);
  });

  test('« Répondre » relit la loi AU MOMENT du geste : un droit retiré entre l’ouverture et le choix ne cite rien', () => {
    let allowed = true;
    const { calls, menu } = journal(() => allowed);
    expect(menu.actionsOf('m-a')).toEqual(['goToMessage', 'reply']);
    allowed = false;
    menu.run('reply', 'm-a');
    expect(calls).toEqual(['mode:script', 'jump:m-a']);
  });
});
