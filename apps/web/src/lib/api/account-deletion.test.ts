import { describe, expect, test } from 'bun:test';

import { scriptedGateway, scriptedTransport } from '@/test-support/scripted-transport';

import {
  DELETION_CONFIRMATION_PHRASE,
  deletionFailureOf,
  deletionLinkFrom,
  isDeletionPhraseTyped,
  requestAccountDeletion,
  requestFailureOf,
  resolveAccountDeletion,
} from './account-deletion';

/**
 * LA SUPPRESSION DE COMPTE (#6715) — deux portes de la passerelle :
 * `POST /account/deletion/resolve` (PUBLIQUE, le lien de l'e-mail, #4183) et
 * `POST /me/account/deletion` (la demande ouverte depuis les réglages, sous
 * mot de passe). Aucune ne se déclenche sans un geste humain : c'est l'écran
 * qui en décide, ce port ne fait que parler juste.
 */

const RESOLVE = 'POST /api/v1/account/deletion/resolve';
const OPEN = 'POST /api/v1/me/account/deletion';

describe('deletionLinkFrom — ce que le lien de l’e-mail porte', () => {
  test('le jeton et l’une des trois actions', () => {
    expect(deletionLinkFrom(new URLSearchParams('token=abc&action=confirm'))).toEqual({ token: 'abc', action: 'confirm' });
    expect(deletionLinkFrom(new URLSearchParams('action=cancel&token=xyz'))).toEqual({ token: 'xyz', action: 'cancel' });
    expect(deletionLinkFrom(new URLSearchParams('token=abc&action=purge'))).toEqual({ token: 'abc', action: 'purge' });
  });

  test('incomplet : jeton absent ou vide, action absente ou inconnue', () => {
    for (const query of ['', 'action=confirm', 'token=&action=confirm', 'token=abc', 'token=abc&action=delete']) {
      expect({ query, link: deletionLinkFrom(new URLSearchParams(query)) }).toEqual({ query, link: null });
    }
  });
});

describe('resolveAccountDeletion — POST /account/deletion/resolve', () => {
  test('le clic envoie le jeton et l’action ; la réponse dit l’état', async () => {
    const { deps, calls } = scriptedGateway({
      [RESOLVE]: {
        ok: true,
        data: { status: 'CONFIRMED', gracePeriodEndsAt: '2026-10-15T10:00:00.000Z', canCancelUntil: '2026-10-15T10:00:00.000Z', dataPurged: false },
      },
    });

    expect(await resolveAccountDeletion(deps, { token: 'abc', action: 'confirm' })).toEqual({
      ok: true,
      data: { status: 'CONFIRMED', gracePeriodEndsAt: '2026-10-15T10:00:00.000Z', dataPurged: false },
    });
    expect(calls()).toEqual([{ method: 'POST', path: '/api/v1/account/deletion/resolve', body: { token: 'abc', action: 'confirm' } }]);
  });

  test('un état que la page ne sait pas dire est illisible, jamais un succès deviné', async () => {
    const { deps } = scriptedGateway({ [RESOLVE]: { ok: true, data: { status: 'PENDING_EMAIL_CONFIRMATION', dataPurged: false } } });
    const result = await resolveAccountDeletion(deps, { token: 'abc', action: 'confirm' });
    expect(result.ok ? null : result.code).toBe('UNREADABLE');
  });
});

describe('deletionFailureOf — un refus motivé', () => {
  test('expiré, invalide, trop de tentatives, hors ligne, panne', () => {
    expect(deletionFailureOf({ ok: false, status: 410, error: 'x', code: 'TOKEN_EXPIRED' })).toBe('expired');
    expect(deletionFailureOf({ ok: false, status: 410, error: 'x', code: 'TOKEN_INVALID' })).toBe('invalid');
    expect(deletionFailureOf({ ok: false, status: 400, error: 'x' })).toBe('invalid');
    expect(deletionFailureOf({ ok: false, status: 429, error: 'x' })).toBe('rate-limited');
    expect(deletionFailureOf({ ok: false, status: 0, error: 'x' })).toBe('offline');
    expect(deletionFailureOf({ ok: false, status: 0, error: 'x', code: 'TIMEOUT' })).toBe('unavailable');
    expect(deletionFailureOf({ ok: false, status: 500, error: 'x' })).toBe('unavailable');
  });
});

describe('requestAccountDeletion — POST /me/account/deletion', () => {
  test('la phrase exacte et le mot de passe courant, rien d’autre', async () => {
    const { deps, calls } = scriptedGateway({ [OPEN]: { ok: true, data: { message: 'ok', tokenExpiresAt: '2026-09-18T10:00:00.000Z' } } });

    expect(await requestAccountDeletion(deps, 'hunter2')).toEqual({ ok: true, data: null });
    expect(calls()).toEqual([
      { method: 'POST', path: '/api/v1/me/account/deletion', body: { confirmationPhrase: 'SUPPRIMER MON COMPTE', currentPassword: 'hunter2' } },
    ]);
  });

  /* La passerelle compare un LITTÉRAL (`z.literal`, `delete-account-schemas.ts`) :
     iOS et Android exigent la phrase à la lettre, sans rognage ni casse. */
  test('la phrase se tape à la lettre', () => {
    expect(DELETION_CONFIRMATION_PHRASE).toBe('SUPPRIMER MON COMPTE');
    expect(isDeletionPhraseTyped('SUPPRIMER MON COMPTE')).toBe(true);
    for (const typed of ['supprimer mon compte', ' SUPPRIMER MON COMPTE', 'SUPPRIMER MON COMPTE ', 'SUPPRIMER  MON COMPTE', '']) {
      expect({ typed, accepted: isDeletionPhraseTyped(typed) }).toEqual({ typed, accepted: false });
    }
  });

  test('chaque refus a son motif', () => {
    expect(requestFailureOf({ ok: false, status: 400, error: 'Mot de passe incorrect', code: 'INVALID_PASSWORD' })).toBe('wrong-password');
    expect(requestFailureOf({ ok: false, status: 409, error: 'x', code: 'ALREADY_PENDING' })).toBe('already-pending');
    expect(requestFailureOf({ ok: false, status: 409, error: 'x', code: 'NO_EMAIL' })).toBe('no-email');
    expect(requestFailureOf({ ok: false, status: 401, error: 'x' })).toBe('signed-out');
    expect(requestFailureOf({ ok: false, status: 429, error: 'x' })).toBe('rate-limited');
    expect(requestFailureOf({ ok: false, status: 0, error: 'x' })).toBe('offline');
    expect(requestFailureOf({ ok: false, status: 404, error: 'x', code: 'ACCOUNT_NOT_FOUND' })).toBe('unavailable');
  });
});

describe('les fixtures ne touchent jamais le réseau', () => {
  test('résoudre et demander répondent sans transport', async () => {
    const { transport, calls } = scriptedTransport({});
    const deps = { source: 'fixtures' as const, transport };

    const cancelled = await resolveAccountDeletion(deps, { token: 'demo', action: 'cancel' });
    expect(cancelled.ok ? cancelled.data.status : null).toBe('CANCELLED');
    expect((await requestAccountDeletion(deps, 'hunter2')).ok).toBe(true);
    expect(calls()).toEqual([]);
  });
});
