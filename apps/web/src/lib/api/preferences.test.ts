import { describe, expect, test } from 'bun:test';

import { customNameOf, flagsOf, pushConversationFlags, pushRead, pushUnread } from './preferences';
import type { Transport } from '../net/transport';
import type { Conversation } from './types';

/** Le SEUL champ que `flagsOf`/`customNameOf` lisent — le reste du domaine
 * n'a pas sa place dans une fixture qui teste un narrowing. */
const withPreferences = (userPreferences: unknown): Conversation =>
  ({ userPreferences }) as Conversation;

describe('flagsOf — narrowing FAIL-CLOSED de userPreferences (§3.1)', () => {
  test('forme wire nominale : { isPinned, isMuted, isArchived } lus tels quels', () => {
    expect(flagsOf(withPreferences([{ isPinned: true, isMuted: false, isArchived: true }]))).toEqual({
      isPinned: true,
      isMuted: false,
      isArchived: true,
    });
  });

  test('champ absent ⇒ false', () => {
    expect(flagsOf(withPreferences(undefined))).toEqual({ isPinned: false, isMuted: false, isArchived: false });
  });

  test('tableau vide ⇒ false partout (aucune préférence enregistrée)', () => {
    expect(flagsOf(withPreferences([]))).toEqual({ isPinned: false, isMuted: false, isArchived: false });
  });

  test('forme inattendue : non-tableau ⇒ false FAIL-CLOSED', () => {
    expect(flagsOf(withPreferences({ isPinned: true }))).toEqual({ isPinned: false, isMuted: false, isArchived: false });
  });

  test('forme inattendue : entrée non-objet ⇒ false FAIL-CLOSED', () => {
    expect(flagsOf(withPreferences(['pin']))).toEqual({ isPinned: false, isMuted: false, isArchived: false });
  });

  test('forme inattendue : booléen manquant sur l’entrée ⇒ false pour ce champ', () => {
    expect(flagsOf(withPreferences([{ isPinned: true }]))).toEqual({ isPinned: true, isMuted: false, isArchived: false });
  });
});

describe('customNameOf', () => {
  test('chaîne non vide servie', () => {
    expect(customNameOf(withPreferences([{ customName: 'Sany' }]))).toBe('Sany');
  });

  test('absent ⇒ undefined', () => {
    expect(customNameOf(withPreferences([{}]))).toBeUndefined();
    expect(customNameOf(withPreferences(undefined))).toBeUndefined();
  });

  test('chaîne vide ⇒ undefined (rien à afficher)', () => {
    expect(customNameOf(withPreferences([{ customName: '' }]))).toBeUndefined();
  });
});

const recording = (): { readonly transport: Transport; readonly calls: { method: string; path: string; body: unknown }[] } => {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const transport: Transport = async (request) => {
    calls.push({ method: request.method, path: request.path, body: request.body });
    return { success: true };
  };
  return { transport, calls };
};

describe('pushConversationFlags — PUT /user-preferences/conversations/:id (§3.2)', () => {
  test('un seul champ modifié ⇒ un seul champ dans le corps', async () => {
    const { transport, calls } = recording();
    await pushConversationFlags(transport, 'c-amina', { isPinned: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      method: 'PUT',
      path: '/api/v1/user-preferences/conversations/c-amina',
      body: { isPinned: true },
    });
  });

  test('ne compose jamais les trois champs pour un seul changé', async () => {
    const { transport, calls } = recording();
    await pushConversationFlags(transport, 'c-annonces', { isMuted: true });
    expect(calls[0]?.body).toEqual({ isMuted: true });
  });
});

describe('pushRead / pushUnread — receipts et mark-unread (§3.3, §3.4)', () => {
  test('pushRead : POST …/receipts, corps { type: "read" } — jamais l’alias déprécié', async () => {
    const { transport, calls } = recording();
    await pushRead(transport, 'c-deploiement');
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/v1/conversations/c-deploiement/receipts',
      body: { type: 'read' },
    });
  });

  test('pushUnread : POST …/mark-unread, sans corps', async () => {
    const { transport, calls } = recording();
    await pushUnread(transport, 'c-deploiement');
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/v1/conversations/c-deploiement/mark-unread',
      body: undefined,
    });
  });
});
