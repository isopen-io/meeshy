import { describe, expect, test } from 'bun:test';

import { createDraftStore } from '@/lib/send/draft-store';
import { pendingAttachmentOf } from '@/lib/send/attachments';

import { createCommentDrafts } from './comment-draft';

/** #9743 — LE BROUILLON D'UN COMMENTAIRE : texte et pièces, par lecteur et par publication. */
const ouvert = () => ({ kind: 'registered' as const, token: 't' });
const piece = () => pendingAttachmentOf(new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }));

function disque() {
  const rows = new Map<string, string>();
  return { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => void rows.set(k, v), removeItem: (k: string) => void rows.delete(k), rows };
}

describe('le brouillon d’un commentaire (#9743)', () => {
  test('garde le texte et les pièces, par publication et par lecteur', () => {
    const drafts = createCommentDrafts(createDraftStore(disque()), ouvert);
    const pending = [piece()];
    drafts.set('u_a', 'p1', { text: 'Bonjour', pending });
    expect(drafts.get('u_a', 'p1')).toEqual({ text: 'Bonjour', pending });
    expect(drafts.get('u_a', 'p2')).toEqual({ text: '', pending: [] });
    expect(drafts.get('u_b', 'p1')).toEqual({ text: '', pending: [] });
  });

  test('au rechargement, le TEXTE revient du disque ; les pièces, tenues en mémoire, non', () => {
    const backend = disque();
    createCommentDrafts(createDraftStore(backend), ouvert).set('u_a', 'p1', { text: 'Bonjour', pending: [piece()] });
    expect(createCommentDrafts(createDraftStore(backend), ouvert).get('u_a', 'p1')).toEqual({ text: 'Bonjour', pending: [] });
  });

  test('un brouillon vidé ne laisse rien, ni en mémoire ni sur le disque', () => {
    const backend = disque();
    const drafts = createCommentDrafts(createDraftStore(backend), ouvert);
    drafts.set('u_a', 'p1', { text: 'Bonjour', pending: [piece()] });
    drafts.set('u_a', 'p1', { text: '', pending: [] });
    expect(drafts.get('u_a', 'p1')).toEqual({ text: '', pending: [] });
    expect(backend.rows.size).toBe(0);
  });

  test('des pièces SANS texte sont gardées', () => {
    const drafts = createCommentDrafts(createDraftStore(disque()), ouvert);
    const pending = [piece()];
    drafts.set('u_a', 'p1', { text: '', pending });
    expect(drafts.get('u_a', 'p1').pending).toBe(pending);
  });

  test('A2 (#9743) — sans son propriétaire connecté, un brouillon ne s’ÉCRIT pas ; il peut toujours s’effacer', () => {
    const backend = disque();
    let connecté: string | null = 'u_a';
    const drafts = createCommentDrafts(createDraftStore(backend), (scope) => (scope === connecté ? { kind: 'registered', token: 't' } : null));
    drafts.set('u_a', 'p1', { text: 'Avant', pending: [piece()] });
    connecté = null;
    drafts.set('u_a', 'p2', { text: 'Après la déconnexion', pending: [piece()] });
    expect(drafts.get('u_a', 'p2')).toEqual({ text: '', pending: [] });
    expect([...backend.rows.keys()].filter((key) => key.includes('p2'))).toHaveLength(0);
    drafts.set('u_a', 'p1', { text: '', pending: [] });
    expect(backend.rows.size).toBe(0);
  });

  test('la déconnexion d’un compte oublie ses pièces', () => {
    const drafts = createCommentDrafts(createDraftStore(disque()), ouvert);
    drafts.set('u_a', 'p1', { text: '', pending: [piece()] });
    drafts.forgetScope('u_a');
    expect(drafts.get('u_a', 'p1').pending).toHaveLength(0);
  });
});
