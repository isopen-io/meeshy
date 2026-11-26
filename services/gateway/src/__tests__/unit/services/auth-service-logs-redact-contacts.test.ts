/**
 * Les journaux d'`AuthService` n'écrivent ni adresse ni numéro en clair (#16049).
 *
 * Le témoin lit le MESSAGE journalisé : renvoyer une vérification, ou chercher
 * un compte par son adresse ou son numéro, ne laisse aucune de ces valeurs
 * dans une ligne de journal, quel que soit le niveau.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const journal: unknown[][] = [];
const record = (...args: unknown[]): void => {
  journal.push(args);
};
const childLogger = { info: record, debug: record, warn: record, error: record };

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => childLogger) },
}));

jest.mock('../../../services/SessionService', () => ({
  generateSessionToken: jest.fn(),
  createSession: jest.fn(),
  initSessionService: jest.fn(),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn(),
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: jest.fn(() => Promise.resolve(undefined)),
  })),
}));

import { AuthService } from '../../../services/AuthService';

const EMAIL = 'alice.martin@exemple.com';
const PHONE = '+33612345678';

function journalText(): string {
  return journal.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n');
}

function makePrisma(user: Record<string, unknown> | null) {
  return {
    user: {
      findFirst: jest.fn(() => Promise.resolve(user)),
      update: jest.fn(() => Promise.resolve(user)),
    },
  };
}

function makeService(user: Record<string, unknown> | null): AuthService {
  const prisma = makePrisma(user);
  return new AuthService(prisma as unknown as ConstructorParameters<typeof AuthService>[0], 'secret');
}

const unverifiedUser = {
  id: 'user-123',
  email: EMAIL,
  firstName: 'Alice',
  lastName: 'Martin',
  displayName: 'Alice Martin',
  systemLanguage: 'fr',
  emailVerifiedAt: null,
};

describe('AuthService — journaux sans coordonnée en clair (#16049)', () => {
  beforeEach(() => {
    journal.length = 0;
  });

  it('le renvoi de vérification réussi ne journalise pas l’adresse', async () => {
    const result = await makeService(unverifiedUser).resendVerificationEmail(EMAIL);

    expect(result.success).toBe(true);
    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('alice.martin');
    expect(journalText()).not.toContain('exemple.com');
  });

  it('la recherche d’un compte par adresse ne journalise pas l’adresse', async () => {
    const result = await makeService(null).authenticate({ username: EMAIL, password: 'x' });

    expect(result).toBeNull();
    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('alice.martin');
  });

  it('la recherche d’un compte par numéro ne journalise pas le numéro', async () => {
    const result = await makeService(null).authenticate({ username: '06 12 34 56 78', password: 'x' });

    expect(result).toBeNull();
    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('612345');
    expect(journalText()).not.toContain('12 34 56');
  });
});
