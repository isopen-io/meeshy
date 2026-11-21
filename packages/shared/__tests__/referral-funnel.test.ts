/**
 * Le parrainage — l'entonnoir et les invitations envoyées (#19207, chantier #18857).
 *
 * La vue Parrainage montre « Visites → Inscriptions → Actifs », « 9 inscrits ce mois », et
 * la liste des invitations envoyées, adresse MASQUÉE (`ma•••••@gmail.com`), avec leur état
 * (« non ouverte », « ouverte hier · pas inscrit ») et un bouton Relancer plafonné.
 */
import { describe, it, expect } from 'vitest';
import {
  INVITATION_MAX_RESENDS,
  INVITATION_RESEND_INTERVAL_HOURS,
  REFERRAL_ACTIVE_WINDOW_DAYS,
  invitationResendWindow,
  invitationState,
  isReferralActive,
  maskEmailAddress,
  utcMonthStart,
} from '../utils/referral-funnel';

const HOUR = 3_600_000;

describe('maskEmailAddress — jamais l’adresse complète d’un tiers', () => {
  it('garde deux lettres du nom, cinq points médians et le domaine', () => {
    expect(maskEmailAddress('marie.dupont@gmail.com')).toBe('ma•••••@gmail.com');
  });

  it('ne garde qu’une lettre d’un nom de deux lettres ou moins', () => {
    expect(maskEmailAddress('jo@example.org')).toBe('j•••••@example.org');
    expect(maskEmailAddress('a@example.org')).toBe('a•••••@example.org');
  });

  it('met le domaine en minuscules et ne révèle pas la longueur du nom', () => {
    expect(maskEmailAddress('AB12345678901@Example.ORG')).toBe('ab•••••@example.org');
    expect(maskEmailAddress('abc@x.io')).toBe(maskEmailAddress('abzzzzzzzzzzzzzz@x.io'));
  });

  it('rend un masque entier pour une valeur qui n’est pas une adresse', () => {
    expect(maskEmailAddress('pas-une-adresse')).toBe('•••••');
    expect(maskEmailAddress('@domaine.fr')).toBe('•••••');
  });
});

describe('isReferralActive — un filleul actif a été vu dans les trente derniers jours', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');

  it('vaut trente jours', () => {
    expect(REFERRAL_ACTIVE_WINDOW_DAYS).toBe(30);
  });

  it('est actif jusqu’à trente jours pile, inactif au-delà', () => {
    expect(isReferralActive({ lastActiveAt: new Date(now.getTime() - 30 * 24 * HOUR), now })).toBe(true);
    expect(isReferralActive({ lastActiveAt: new Date(now.getTime() - 30 * 24 * HOUR - 1), now })).toBe(false);
  });

  it('n’est pas actif sans date', () => {
    expect(isReferralActive({ lastActiveAt: null, now })).toBe(false);
  });
});

describe('utcMonthStart — « inscrits ce mois » se compte depuis le premier du mois UTC', () => {
  it('rend minuit UTC le premier du mois', () => {
    expect(utcMonthStart(new Date('2026-11-17T23:59:00.000Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(utcMonthStart(new Date('2026-01-01T00:00:00.000Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('invitationState — l’ouverture se lit sur le jeton de l’invitation, sans pixel', () => {
  it('rejoint l’emporte sur ouverte, ouverte sur envoyée', () => {
    expect(invitationState({ joined: true, opened: true })).toBe('joined');
    expect(invitationState({ joined: true, opened: false })).toBe('joined');
    expect(invitationState({ joined: false, opened: true })).toBe('opened');
    expect(invitationState({ joined: false, opened: false })).toBe('sent');
  });
});

describe('invitationResendWindow — une relance par 72 h, trois au plus', () => {
  const sentAt = new Date('2026-11-10T08:00:00.000Z');

  it('vaut 72 h et trois relances', () => {
    expect(INVITATION_RESEND_INTERVAL_HOURS).toBe(72);
    expect(INVITATION_MAX_RESENDS).toBe(3);
  });

  it('attend 72 h après l’envoi avant la première relance', () => {
    const tooSoon = invitationResendWindow({ sentAt, lastResentAt: null, resendCount: 0, now: new Date(sentAt.getTime() + 71 * HOUR) });
    expect(tooSoon.canResend).toBe(false);
    expect(tooSoon.resendsLeft).toBe(3);
    expect(tooSoon.nextResendAt?.toISOString()).toBe('2026-11-13T08:00:00.000Z');

    const ready = invitationResendWindow({ sentAt, lastResentAt: null, resendCount: 0, now: new Date(sentAt.getTime() + 72 * HOUR) });
    expect(ready.canResend).toBe(true);
  });

  it('compte les 72 h depuis la dernière relance', () => {
    const lastResentAt = new Date('2026-11-14T08:00:00.000Z');
    const window = invitationResendWindow({ sentAt, lastResentAt, resendCount: 1, now: new Date('2026-11-16T08:00:00.000Z') });
    expect(window.canResend).toBe(false);
    expect(window.resendsLeft).toBe(2);
    expect(window.nextResendAt?.toISOString()).toBe('2026-11-17T08:00:00.000Z');
  });

  it('refuse toute relance après la troisième', () => {
    const window = invitationResendWindow({ sentAt, lastResentAt: sentAt, resendCount: 3, now: new Date('2027-01-01T00:00:00.000Z') });
    expect(window.canResend).toBe(false);
    expect(window.resendsLeft).toBe(0);
    expect(window.nextResendAt).toBeNull();
  });

  it('lit un compte absent (ancienne ligne) comme zéro', () => {
    const window = invitationResendWindow({ sentAt, lastResentAt: null, resendCount: null, now: new Date('2026-12-01T00:00:00.000Z') });
    expect(window.canResend).toBe(true);
    expect(window.resendsLeft).toBe(3);
  });
});
