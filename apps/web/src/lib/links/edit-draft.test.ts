import { describe, expect, test } from 'bun:test';

import type { MyShareLink, ShareLinkPolicy } from '@/lib/api/links';

import { editDraftOf, patchedLink, validateEditDraft, type ShareLinkEditDraft } from './edit-draft';

/**
 * L'ÉDITION D'UN LIEN (#7797) — le brouillon part de ce que le lien EST, et
 * seul ce qui a CHANGÉ part vers `PATCH /links/:linkId`.
 */

const POLICY: ShareLinkPolicy = {
  maxConcurrentUsers: 50,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowAnonymousMessages: true,
  allowAnonymousImages: true,
  allowAnonymousFiles: false,
  allowViewHistory: false,
  allowedLanguages: [],
};

const link = (overrides: Partial<MyShareLink> = {}): MyShareLink => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: null,
  name: 'Invitation',
  isActive: true,
  currentUses: 12,
  maxUses: null,
  expiresAt: '2026-10-01T21:59:00.000Z',
  createdAt: '2026-09-10T09:00:00.000Z',
  conversationTitle: 'Nova Club',
  inactiveReason: null,
  description: 'Viens !',
  policy: POLICY,
  ...overrides,
});

const NOW = new Date('2026-09-24T12:00:00.000Z');

const draftOf = (overrides: Partial<ShareLinkEditDraft> = {}, base: MyShareLink = link()): ShareLinkEditDraft => ({
  ...editDraftOf(base, POLICY),
  ...overrides,
});

describe('editDraftOf — le brouillon part de ce que le lien EST', () => {
  test('nom, message, expiration gardée, limites et politique', () => {
    expect(editDraftOf(link({ maxUses: 40 }), POLICY)).toEqual({
      name: 'Invitation',
      description: 'Viens !',
      expiration: 'keep',
      limitUses: true,
      maxUses: 40,
      limitConcurrent: true,
      maxConcurrent: 50,
      requireAccount: false,
      requireNickname: true,
      requireEmail: false,
      requireBirthday: false,
      allowAnonymousMessages: true,
      allowAnonymousImages: true,
      allowAnonymousFiles: false,
      allowViewHistory: false,
      allLanguages: true,
      languages: [],
    });
  });

  test('sans limite ni expiration : des défauts raisonnables prêts à activer', () => {
    const draft = editDraftOf(link({ expiresAt: null, name: null, description: null }), { ...POLICY, maxConcurrentUsers: null, allowedLanguages: ['fr'] });
    expect([draft.name, draft.description, draft.expiration, draft.limitUses, draft.maxUses, draft.limitConcurrent]).toEqual(['', '', 'never', false, 100, false]);
    expect([draft.allLanguages, draft.languages]).toEqual([false, ['fr']]);
  });
});

describe('validateEditDraft — seul ce qui a CHANGÉ part', () => {
  test('rien de changé : un corps vide', () => {
    expect(validateEditDraft(draftOf(), link(), POLICY, NOW)).toEqual({ ok: true, patch: {} });
  });

  test('nom et message rognés ; vidés, ils partent vides pour être effacés', () => {
    expect(validateEditDraft(draftOf({ name: '  Nova — Discord ', description: '' }), link(), POLICY, NOW)).toEqual({
      ok: true,
      patch: { name: 'Nova — Discord', description: '' },
    });
  });

  test('limites : un maximum activé part en entier, retiré il part `null`', () => {
    expect(validateEditDraft(draftOf({ limitUses: true, maxUses: 25 }), link(), POLICY, NOW)).toEqual({ ok: true, patch: { maxUses: 25 } });
    expect(validateEditDraft(draftOf({ limitConcurrent: false }), link(), POLICY, NOW)).toEqual({ ok: true, patch: { maxConcurrentUsers: null } });
  });

  test('une limite hors bornes se refuse sur SON champ, et rien ne part', () => {
    expect(validateEditDraft(draftOf({ limitUses: true, maxUses: 0 }), link(), POLICY, NOW)).toEqual({ ok: false, field: 'maxUses' });
    expect(validateEditDraft(draftOf({ limitConcurrent: true, maxConcurrent: 2.5 }), link(), POLICY, NOW)).toEqual({ ok: false, field: 'maxConcurrent' });
    expect(validateEditDraft(draftOf({ limitConcurrent: true, maxConcurrent: Number.NaN }), link(), POLICY, NOW)).toEqual({ ok: false, field: 'maxConcurrent' });
  });

  test('expiration : gardée ne part pas, « jamais » part `null`, une durée part en ISO depuis le geste', () => {
    expect(validateEditDraft(draftOf({ expiration: 'never' }), link(), POLICY, NOW)).toEqual({ ok: true, patch: { expiresAt: null } });
    expect(validateEditDraft(draftOf({ expiration: 'd7' }), link(), POLICY, NOW)).toEqual({ ok: true, patch: { expiresAt: '2026-10-01T12:00:00.000Z' } });
    expect(validateEditDraft(draftOf({ expiration: 'never' }), link({ expiresAt: null }), POLICY, NOW)).toEqual({ ok: true, patch: {} });
  });

  test('« compte requis » éteint pseudo, e-mail et naissance — ce qui part est ce qui s’applique', () => {
    expect(validateEditDraft(draftOf({ requireAccount: true, requireEmail: true }), link(), POLICY, NOW)).toEqual({
      ok: true,
      patch: { requireAccount: true, requireNickname: false },
    });
  });

  test('les droits des invités ne partent que changés', () => {
    expect(validateEditDraft(draftOf({ allowAnonymousFiles: true, allowViewHistory: true }), link(), POLICY, NOW)).toEqual({
      ok: true,
      patch: { allowAnonymousFiles: true, allowViewHistory: true },
    });
  });

  test('langues : une sélection part triée et dédoublonnée ; « toutes » part vide ; une sélection VIDE se refuse', () => {
    expect(validateEditDraft(draftOf({ allLanguages: false, languages: ['ko', 'fr', 'ko'] }), link(), POLICY, NOW)).toEqual({
      ok: true,
      patch: { allowedLanguages: ['fr', 'ko'] },
    });
    expect(validateEditDraft(draftOf({ allLanguages: true }), link(), { ...POLICY, allowedLanguages: ['fr'] }, NOW)).toEqual({
      ok: true,
      patch: { allowedLanguages: [] },
    });
    expect(validateEditDraft(draftOf({ allLanguages: false, languages: [] }), link(), POLICY, NOW)).toEqual({ ok: false, field: 'languages' });
  });
});

describe('patchedLink — ce que le cache peint AU GESTE', () => {
  test('nom, message, limites et politique appliqués ; les vides deviennent nuls', () => {
    const next = patchedLink(link(), { name: '', description: 'Salut', maxUses: 30, maxConcurrentUsers: null, allowAnonymousFiles: true, allowedLanguages: ['fr'] });
    expect(next.name).toBeNull();
    expect(next.description).toBe('Salut');
    expect(next.maxUses).toBe(30);
    expect(next.policy).toEqual({ ...POLICY, maxConcurrentUsers: null, allowAnonymousFiles: true, allowedLanguages: ['fr'] });
  });

  test('un lien sans politique lue n’en reçoit pas une inventée', () => {
    expect(patchedLink(link({ policy: null }), { allowAnonymousFiles: true }).policy).toBeNull();
  });
});
