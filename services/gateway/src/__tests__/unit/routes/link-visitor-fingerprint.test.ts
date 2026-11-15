/**
 * LA CLÉ DU VISITEUR D'UN LIEN (#9225, conformité H-6) — un HMAC à clé secrète et
 * tournante, jamais un sha256 sans clé : on ne retrouve pas l'adresse en essayant
 * les adresses, et la clé change chaque semaine.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { anonymousVisitorFingerprint, linkVisitorFromRequest, visitorKeyPeriod } from '../../../routes/links/utils/link-visitor';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 6);

describe('anonymousVisitorFingerprint', () => {
  const visitor = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0' };

  it('n’est PAS le sha256 de l’adresse et de l’agent : on ne le retrouve pas en essayant les adresses', () => {
    const naive = createHash('sha256').update(`${visitor.ip}|${visitor.userAgent}`).digest('hex');
    expect(anonymousVisitorFingerprint({ ...visitor, now: T0 })).not.toBe(naive);
  });

  it('est stable dans la période : un même visiteur se dédoublonne', () => {
    expect(anonymousVisitorFingerprint({ ...visitor, now: T0 })).toBe(anonymousVisitorFingerprint({ ...visitor, now: T0 + 1000 }));
  });

  it('tourne à la période suivante : deux visites d’une semaine à l’autre ne se relient plus', () => {
    const first = anonymousVisitorFingerprint({ ...visitor, now: T0 });
    const later = anonymousVisitorFingerprint({ ...visitor, now: (visitorKeyPeriod(T0) + 1) * WEEK + 1 });
    expect(later).not.toBe(first);
  });

  it('distingue deux visiteurs, et ne contient ni adresse ni agent', () => {
    const a = anonymousVisitorFingerprint({ ...visitor, now: T0 });
    const b = anonymousVisitorFingerprint({ ip: '203.0.113.8', userAgent: visitor.userAgent, now: T0 });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('linkVisitorFromRequest', () => {
  it('un compte connecté se compte sous son identifiant, un anonyme sous son empreinte HMAC', () => {
    const user = linkVisitorFromRequest({ ip: '1.1.1.1', headers: {}, authContext: { type: 'user', isAnonymous: false, userId: '68a000000000000000000001' } as never });
    expect(user).toEqual({ key: 'user:68a000000000000000000001', userId: '68a000000000000000000001' });
    const anon = linkVisitorFromRequest({ ip: '1.1.1.1', headers: { 'user-agent': 'UA' } });
    expect(anon.userId).toBeNull();
    expect(anon.key).toMatch(/^anon:[0-9a-f]{64}$/);
    expect(anon.key).not.toContain('1.1.1.1');
  });
});
