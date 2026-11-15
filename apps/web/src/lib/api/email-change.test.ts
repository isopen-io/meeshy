import { describe, expect, test } from 'bun:test';

import { scriptedGateway, scriptedTransport } from '@/test-support/scripted-transport';

import { emailChangeFailureOf, verifyEmailChange } from './email-change';

/**
 * LE CHANGEMENT D'ADRESSE E-MAIL (#6715) — le lien de l'e-mail porte un jeton
 * que la route UNIFIÉE `POST /users/me/contact-changes/email/verify` reçoit en
 * `code` (`routes/users/contact-changes.ts`). L'ancienne adresse
 * (`/users/me/verify-email-change`), que le legacy appelait, est dépréciée.
 */

const VERIFY = 'POST /api/v1/users/me/contact-changes/email/verify';

describe('verifyEmailChange — POST /users/me/contact-changes/email/verify', () => {
  test('le jeton du lien part en « code », et la nouvelle adresse revient', async () => {
    const { deps, calls } = scriptedGateway({
      [VERIFY]: { ok: true, data: { message: 'Contact updated successfully', user: { id: 'u1', username: 'awa', email: 'awa@nouveau.example' } } },
    });

    expect(await verifyEmailChange(deps, 'tok')).toEqual({ ok: true, data: { email: 'awa@nouveau.example' } });
    expect(calls()).toEqual([{ method: 'POST', path: '/api/v1/users/me/contact-changes/email/verify', body: { code: 'tok' } }]);
  });

  test('un succès dont le profil est illisible reste un succès — le changement est fait', async () => {
    const { deps } = scriptedGateway({ [VERIFY]: { ok: true, data: { message: 'ok' } } });
    expect(await verifyEmailChange(deps, 'tok')).toEqual({ ok: true, data: { email: null } });
  });

  test('les fixtures ne touchent pas le réseau', async () => {
    const { transport, calls } = scriptedTransport({});
    expect((await verifyEmailChange({ source: 'fixtures', transport }, 'tok')).ok).toBe(true);
    expect(calls()).toEqual([]);
  });
});

/* La passerelle ne sert, sur ces refus, qu'une phrase ANGLAISE et aucun code
   (`sendBadRequest(reply, 'Verification token has expired')`). Elle est lue
   ICI, une fois ; jamais affichée. */
describe('emailChangeFailureOf — un refus motivé', () => {
  test('expiré, invalide, sans demande, adresse prise', () => {
    expect(emailChangeFailureOf({ ok: false, status: 400, error: 'Verification token has expired' })).toBe('expired');
    expect(emailChangeFailureOf({ ok: false, status: 400, error: 'Invalid verification token' })).toBe('invalid');
    expect(emailChangeFailureOf({ ok: false, status: 400, error: 'No pending email change' })).toBe('invalid');
    expect(emailChangeFailureOf({ ok: false, status: 400, error: 'This email address is no longer available' })).toBe('taken');
  });

  test('sans session, trop de tentatives, hors ligne, panne', () => {
    expect(emailChangeFailureOf({ ok: false, status: 401, error: 'Authentication required' })).toBe('signed-out');
    expect(emailChangeFailureOf({ ok: false, status: 429, error: 'x' })).toBe('rate-limited');
    expect(emailChangeFailureOf({ ok: false, status: 0, error: 'x' })).toBe('offline');
    expect(emailChangeFailureOf({ ok: false, status: 500, error: 'x' })).toBe('unavailable');
  });
});
