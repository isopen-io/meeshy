/**
 * La LOI du délai de grâce de l'adresse (#8238).
 *
 * Horloge INJECTÉE partout : chaque témoin pose son « maintenant » à une
 * distance nommée du début de l'horloge — jamais l'horloge murale, qui ferait
 * tomber un témoin de frontière une fois par jour.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import {
  ACTIVATION_GRACE_EPOCH,
  BLOCK_AFTER_DAYS,
  QUIET_DAYS,
  activationStartedAt,
  isActivationBlocked,
  resolveAccountActivation,
  type ActivationSubject,
} from '../../../services/auth/account-activation';

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = new Date(ACTIVATION_GRACE_EPOCH.getTime() + 3 * DAY_MS);
const at = (days: number, from: Date = CREATED): Date => new Date(from.getTime() + days * DAY_MS);

const emailOnly = (overrides: Partial<ActivationSubject> = {}): ActivationSubject => ({
  createdAt: CREATED,
  emailVerifiedAt: null,
  phoneNumber: null,
  emailReleasedAt: null,
  ...overrides,
});

describe('les constantes nommées', () => {
  it('7 jours de calme, blocage à 28 jours', () => {
    expect(QUIET_DAYS).toBe(7);
    expect(BLOCK_AFTER_DAYS).toBe(28);
  });
});

describe("l'horloge démarre à la création, ou au déploiement pour un compte existant", () => {
  it('un compte créé après le déploiement démarre à sa création', () => {
    expect(activationStartedAt(emailOnly())).toEqual(CREATED);
  });

  it('un compte existant au déploiement démarre au déploiement', () => {
    const ancien = emailOnly({ createdAt: new Date('2025-01-01T00:00:00.000Z') });
    expect(activationStartedAt(ancien)).toEqual(ACTIVATION_GRACE_EPOCH);
  });

  it("un compte vieux d'un an n'est donc PAS bloqué le jour du déploiement", () => {
    const ancien = emailOnly({ createdAt: new Date('2025-01-01T00:00:00.000Z') });
    expect(resolveAccountActivation(ancien, at(1, ACTIVATION_GRACE_EPOCH)).phase).toBe('quiet');
    expect(resolveAccountActivation(ancien, at(27, ACTIVATION_GRACE_EPOCH)).phase).toBe('invite');
    expect(resolveAccountActivation(ancien, at(28, ACTIVATION_GRACE_EPOCH)).phase).toBe('blocked');
  });
});

describe('adresse non vérifiée, aucun numéro — les trois phases', () => {
  it.each([
    [0, 'quiet'],
    [6.99, 'quiet'],
    [7, 'invite'],
    [27.99, 'invite'],
    [28, 'blocked'],
    [400, 'blocked'],
  ] as const)('à J%s ⇒ %s', (days, phase) => {
    expect(resolveAccountActivation(emailOnly(), at(days)).phase).toBe(phase);
    expect(isActivationBlocked(emailOnly(), at(days))).toBe(phase === 'blocked');
  });

  it("l'échéance est le début + 28 jours, et il manque l'adresse et le numéro", () => {
    expect(resolveAccountActivation(emailOnly(), at(8))).toEqual({
      phase: 'invite',
      deadline: at(28).toISOString(),
      missing: ['email', 'phone'],
    });
  });
});

describe("une adresse prouvée n'est jamais bloquée", () => {
  it('`done`, sans échéance, le numéro seul manque', () => {
    const verifie = emailOnly({ emailVerifiedAt: at(1) });
    expect(resolveAccountActivation(verifie, at(400))).toEqual({ phase: 'done', deadline: null, missing: ['phone'] });
    expect(isActivationBlocked(verifie, at(400))).toBe(false);
  });

  it('`done` et rien ne manque quand le numéro est là', () => {
    const complet = emailOnly({ emailVerifiedAt: at(1), phoneNumber: '+33612345678' });
    expect(resolveAccountActivation(complet, at(2))).toEqual({ phase: 'done', deadline: null, missing: [] });
  });
});

describe("le numéro n'est jamais bloquant", () => {
  const avecNumero = emailOnly({ phoneNumber: '+33612345678' });

  it("un compte qui porte un numéro n'est jamais bloqué (#8055 : le numéro active)", () => {
    expect(isActivationBlocked(avecNumero, at(400))).toBe(false);
  });

  it("il est invité à prouver son adresse, sans échéance, et seule l'adresse manque", () => {
    expect(resolveAccountActivation(avecNumero, at(2))).toEqual({ phase: 'quiet', deadline: null, missing: ['email'] });
    expect(resolveAccountActivation(avecNumero, at(400))).toEqual({ phase: 'invite', deadline: null, missing: ['email'] });
  });
});

describe("un compte qui a CÉDÉ son adresse (#8214) n'a plus rien à prouver", () => {
  it('`done` : il ne peut prouver une adresse qu\'il n\'a plus, et il en manque une', () => {
    const cede = emailOnly({ emailReleasedAt: at(3) });
    expect(resolveAccountActivation(cede, at(400))).toEqual({ phase: 'done', deadline: null, missing: ['email', 'phone'] });
    expect(isActivationBlocked(cede, at(400))).toBe(false);
  });
});

describe('une colonne absente se lit comme `null`', () => {
  it('une ligne ancienne sans `emailReleasedAt` suit la loi ordinaire', () => {
    const { emailReleasedAt: _omis, ...sansColonne } = emailOnly();
    expect(resolveAccountActivation(sansColonne, at(30)).phase).toBe('blocked');
  });
});
