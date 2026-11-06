/**
 * L'ÉCHAPPATOIRE D'ENVIRONNEMENT DE LA GARDE DE DOMAINE (#16491).
 *
 * `ALLOW_RESERVED_EMAIL_DOMAINS=true` — et cette seule valeur — ouvre les
 * adresses réservées et jetables (staging, dev, tests). Absente, la garde est
 * active : la production n'a pas à la poser pour être protégée. La variable se
 * lit UNE fois, au chargement du module.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';

type Guard = typeof import('../../../services/auth/email-domain-guard');

const ORIGINAL = process.env.ALLOW_RESERVED_EMAIL_DOMAINS;

const chargerAvec = (valeur: string | undefined): Guard => {
  if (valeur === undefined) delete process.env.ALLOW_RESERVED_EMAIL_DOMAINS;
  else process.env.ALLOW_RESERVED_EMAIL_DOMAINS = valeur;
  let guard: Guard | undefined;
  jest.isolateModules(() => {
    guard = require('../../../services/auth/email-domain-guard') as Guard;
  });
  if (!guard) throw new Error('module non chargé');
  return guard;
};

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ALLOW_RESERVED_EMAIL_DOMAINS;
  else process.env.ALLOW_RESERVED_EMAIL_DOMAINS = ORIGINAL;
});

describe('ALLOW_RESERVED_EMAIL_DOMAINS', () => {
  it('absente : la garde refuse le réservé et le jetable, laisse passer le réel', () => {
    const guard = chargerAvec(undefined);

    expect(guard.isEmailDomainRefused('x@example.com')).toBe(true);
    expect(guard.isEmailDomainRefused('x@mailinator.com')).toBe(true);
    expect(guard.isEmailDomainRefused('x@gmail.com')).toBe(false);
  });

  it.each(['false', '1', 'TRUE', ''])('« %s » ne vaut pas ouverture', (valeur) => {
    expect(chargerAvec(valeur).isEmailDomainRefused('x@example.com')).toBe(true);
  });

  it('« true » : la garde laisse passer le réservé et le jetable', () => {
    const guard = chargerAvec('true');

    expect(guard.isEmailDomainRefused('x@example.com')).toBe(false);
    expect(guard.isEmailDomainRefused('x@mailinator.com')).toBe(false);
  });

  it('lue au chargement : la changer ensuite ne rouvre pas une garde déjà chargée', () => {
    const guard = chargerAvec(undefined);
    process.env.ALLOW_RESERVED_EMAIL_DOMAINS = 'true';

    expect(guard.isEmailDomainRefused('x@example.com')).toBe(true);
  });
});
