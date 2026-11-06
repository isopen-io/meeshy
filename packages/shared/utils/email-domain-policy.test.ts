import { describe, expect, it } from 'vitest';

import {
  DISPOSABLE_EMAIL_DOMAINS,
  classifyEmailDomain,
  emailDomainOf,
  isEmailDomainAllowed,
} from './email-domain-policy';

/**
 * SEULES DE VRAIES ADRESSES OUVRENT UN COMPTE (#16491). Une adresse d'un
 * domaine RÉSERVÉ (RFC 2606, 6761, 6762) ou d'une messagerie JETABLE ne
 * désigne aucune personne joignable : la passerelle la refuse à chaque porte
 * qui pose une adresse saisie sur un compte.
 */

describe('emailDomainOf', () => {
  it('rend le domaine en minuscules, sans espace ni point final', () => {
    expect(emailDomainOf('  USER@Example.COM.  ')).toBe('example.com');
  });

  it('lit le domaine après le DERNIER @', () => {
    expect(emailDomainOf('"a@b"@mailinator.com')).toBe('mailinator.com');
  });

  it('laisse un domaine internationalisé tel quel', () => {
    expect(emailDomainOf('a@bücher.de')).toBe('bücher.de');
  });

  it("rend une chaîne vide quand l'adresse n'a pas de domaine", () => {
    expect(emailDomainOf('sans-arobase')).toBe('');
    expect(emailDomainOf('a@')).toBe('');
  });
});

describe('classifyEmailDomain — domaines réservés', () => {
  it.each([
    'user@example.com',
    'user@example.net',
    'user@example.org',
    'USER@EXAMPLE.COM',
    'user@example.com.',
    'a@sub.example.org',
    'a@foo.test',
    'a@x.invalid',
    'a@deleted.meeshy.invalid',
    'a@machine.localhost',
    'a@localhost',
    'a@imprimante.local',
    'a@demo.example',
    'a@FOO.TEST.',
  ])('%s est réservé', (email) => {
    expect(classifyEmailDomain(email)).toBe('reserved');
  });

  it("refuse une adresse sans domaine plutôt que de la déclarer distribuable", () => {
    expect(classifyEmailDomain('sans-arobase')).toBe('reserved');
    expect(isEmailDomainAllowed('a@')).toBe(false);
  });
});

describe('classifyEmailDomain — messageries jetables', () => {
  it.each([
    'a@mailinator.com',
    'a@x.mailinator.com',
    'A@MAILINATOR.COM.',
    'a@yopmail.com',
    'a@guerrillamail.com',
    'a@sharklasers.com',
    'a@grr.la',
    'a@10minutemail.com',
    'a@temp-mail.org',
    'a@maildrop.cc',
    'a@33mail.com',
    'a@alias.33mail.com',
  ])('%s est jetable', (email) => {
    expect(classifyEmailDomain(email)).toBe('disposable');
  });

  it('couvre une trentaine de fournisseurs majeurs, en minuscules et sans doublon', () => {
    expect(DISPOSABLE_EMAIL_DOMAINS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(DISPOSABLE_EMAIL_DOMAINS).size).toBe(DISPOSABLE_EMAIL_DOMAINS.length);
    expect(DISPOSABLE_EMAIL_DOMAINS.every((d) => d === d.toLowerCase())).toBe(true);
  });
});

describe('classifyEmailDomain — domaines réels', () => {
  it.each([
    'a@exampleshop.com',
    'a@test.com',
    'a@gmail.com',
    'a@meeshy.me',
    'a@notmailinator.com',
    'a@example.co.uk',
    'a@local.fr',
    'a@bücher.de',
  ])('%s est distribuable', (email) => {
    expect(classifyEmailDomain(email)).toBe('deliverable');
    expect(isEmailDomainAllowed(email)).toBe(true);
  });
});

describe('isEmailDomainAllowed', () => {
  it('refuse le réservé et le jetable', () => {
    expect(isEmailDomainAllowed('x@example.com')).toBe(false);
    expect(isEmailDomainAllowed('x@mailinator.com')).toBe(false);
  });
});
