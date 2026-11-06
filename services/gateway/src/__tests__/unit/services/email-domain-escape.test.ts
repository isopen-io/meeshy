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

import { describe, it, expect, afterEach, jest } from '@jest/globals';

import { resolveReservedEmailDomainsAllowed } from '../../../services/auth/email-domain-escape';

type Guard = typeof import('../../../services/auth/email-domain-guard');

const ORIGINAL = process.env.ALLOW_RESERVED_EMAIL_DOMAINS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

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
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
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

describe('ALLOW_RESERVED_EMAIL_DOMAINS en production', () => {
  const resoudre = (env: Record<string, string>) => {
    const signale = jest.fn<(message: string) => void>();
    return { ouverte: resolveReservedEmailDomainsAllowed(env, signale), signale };
  };

  it('est IGNORÉE en production, et la passerelle le dit fort', () => {
    const { ouverte, signale } = resoudre({ NODE_ENV: 'production', ALLOW_RESERVED_EMAIL_DOMAINS: 'true' });

    expect(ouverte).toBe(false);
    expect(signale).toHaveBeenCalledTimes(1);
    expect(signale.mock.calls[0]?.[0]).toMatch(/ALLOW_RESERVED_EMAIL_DOMAINS.*ignor/);
  });

  it('reste honorée sur le staging, qui tourne aussi en NODE_ENV=production', () => {
    const { ouverte, signale } = resoudre({ NODE_ENV: 'production', MEESHY_ENV: 'staging', ALLOW_RESERVED_EMAIL_DOMAINS: 'true' });

    expect(ouverte).toBe(true);
    expect(signale).not.toHaveBeenCalled();
  });

  it('absente en production : garde active, rien à signaler', () => {
    const { ouverte, signale } = resoudre({ NODE_ENV: 'production' });

    expect(ouverte).toBe(false);
    expect(signale).not.toHaveBeenCalled();
  });

  it('au chargement du module en production, la garde refuse malgré la variable', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MEESHY_ENV;

    expect(chargerAvec('true').isEmailDomainRefused('x@example.com')).toBe(true);
  });
});
