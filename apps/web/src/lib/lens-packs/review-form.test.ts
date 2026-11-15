import { describe, expect, test } from 'bun:test';

import { lensReviewRefusalOf, reviewOfApproval } from './review-form';

/**
 * W16 (#11322) — PUBLIER UNE LENS EN FIXANT SA FENÊTRE ET SES COMMUNAUTÉS, loi
 * pure. Les dates se saisissent en UTC ; une fenêtre se donne entière (début ET
 * fin) ou pas du tout (celle du document vaut alors) ; les communautés sont des
 * identifiants de 24 caractères hexadécimaux. Le géo-créneau n'existe pas ici
 * (décision #11251 en attente).
 */
describe('reviewOfApproval', () => {
  test('sans fenêtre ni communauté : publier tel que le document le déclare', () => {
    expect(reviewOfApproval({ startsAt: '', endsAt: '', communities: '', note: '' })).toEqual({ ok: true, review: { decision: 'approve' } });
  });

  test('une fenêtre entière, des communautés et un mot', () => {
    expect(
      reviewOfApproval({ startsAt: '2026-12-01T00:00', endsAt: '2026-12-31T23:59', communities: '64b7f0c2a1b2c3d4e5f60718, 64b7f0c2a1b2c3d4e5f60719', note: ' Belle lens ' }),
    ).toEqual({
      ok: true,
      review: {
        decision: 'approve',
        note: 'Belle lens',
        window: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T23:59:00Z' },
        communities: ['64b7f0c2a1b2c3d4e5f60718', '64b7f0c2a1b2c3d4e5f60719'],
      },
    });
  });

  test('une fenêtre à moitié, inversée, ou une communauté mal formée : refusée avant le réseau', () => {
    expect(reviewOfApproval({ startsAt: '2026-12-01T00:00', endsAt: '', communities: '', note: '' }).ok).toBe(false);
    expect(reviewOfApproval({ startsAt: '2026-12-02T00:00', endsAt: '2026-12-01T00:00', communities: '', note: '' }).ok).toBe(false);
    expect(reviewOfApproval({ startsAt: '', endsAt: '', communities: 'paris', note: '' }).ok).toBe(false);
  });
});

describe('lensReviewRefusalOf', () => {
  test('chaque refus de la passerelle a sa cause', () => {
    expect(lensReviewRefusalOf({ ok: false, status: 403, error: 'x', code: 'LENS_SELF_REVIEW' })).toBe('self-review');
    expect(lensReviewRefusalOf({ ok: false, status: 422, error: 'x', code: 'LENS_INVALID_WINDOW' })).toBe('invalid-window');
    expect(lensReviewRefusalOf({ ok: false, status: 500, error: 'x', code: 'LENS_AUDIT_UNAVAILABLE' })).toBe('audit');
    expect(lensReviewRefusalOf({ ok: false, status: 404, error: 'x', code: 'LENS_NOT_FOUND' })).toBe('not-found');
    expect(lensReviewRefusalOf({ ok: false, status: 403, error: 'x' })).toBe('forbidden');
    expect(lensReviewRefusalOf({ ok: false, status: 0, error: 'x' })).toBe('failed');
  });
});
