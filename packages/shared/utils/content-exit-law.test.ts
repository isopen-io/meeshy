import { describe, expect, it } from 'vitest';
import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';
import { contentExitLaw, forwardedCopyProtection, type ContentExitSubject } from './content-exit-law.js';

const { EPHEMERAL, BLURRED, VIEW_ONCE, EPHEMERAL_AFTER_READ, SHAKE, GLOW } = MESSAGE_EFFECT_FLAGS;

const ORDINARY = { nature: 'ordinary', forward: { allowed: true, maxDurationSeconds: null }, exportable: true, capture: 'free' };
const timed = (seconds: number) => ({
  nature: 'timed-flame',
  forward: { allowed: true, maxDurationSeconds: seconds },
  exportable: false,
  capture: 'blocked',
});
const AFTER_READ = {
  nature: 'after-read-flame',
  forward: { allowed: false, reason: 'after-read' },
  exportable: false,
  capture: 'blocked',
};
const ONCE = { nature: 'view-once', forward: { allowed: false, reason: 'view-once' }, exportable: false, capture: 'blocked' };

describe('contentExitLaw — la table de la spec, ligne par ligne', () => {
  const table: ReadonlyArray<readonly [string, ContentExitSubject | null | undefined, unknown]> = [
    ['aucun sujet', null, ORDINARY],
    ['sujet indéfini', undefined, ORDINARY],
    ['aucun drapeau', {}, ORDINARY],
    ['des effets décoratifs seuls', { effectFlags: SHAKE | GLOW }, ORDINARY],
    ['le flou seul, que la loi ne remplace pas', { isBlurred: true, effectFlags: BLURRED }, ORDINARY],
    ['une durée nulle, qui n’est pas une durée', { ephemeralDuration: 0 }, ORDINARY],
    ['des pièces ordinaires', { attachments: [{}, { effectFlags: 0, isViewOnce: false }] }, ORDINARY],

    ['EPHEMERAL avec sa durée', { effectFlags: EPHEMERAL, ephemeralDuration: 30 }, timed(30)],
    ['la durée seule, sans le bit', { ephemeralDuration: 3600 }, timed(3600)],
    ['une durée fractionnaire, arrondie vers le bas', { ephemeralDuration: 30.9 }, timed(30)],
    ['une flamme à durée floutée', { effectFlags: EPHEMERAL | BLURRED, isBlurred: true, ephemeralDuration: 60 }, timed(60)],
    [
      'une ligne d’avant la colonne — la distance entre création et échéance',
      { effectFlags: EPHEMERAL, expiresAt: new Date('2026-10-07T10:05:00Z'), createdAt: '2026-10-07T10:00:00Z' },
      timed(300),
    ],
    [
      'la colonne prime sur la distance',
      { ephemeralDuration: 30, expiresAt: new Date('2026-10-14T10:00:00Z'), createdAt: new Date('2026-10-07T10:00:00Z') },
      timed(30),
    ],

    ['le bit après lecture', { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ }, AFTER_READ],
    ['le bit après lecture voyageant seul', { effectFlags: EPHEMERAL_AFTER_READ }, AFTER_READ],
    [
      'durée ET après lecture — la copie transférée',
      { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, ephemeralDuration: 30 },
      AFTER_READ,
    ],
    ['EPHEMERAL sans durée connue — fermé', { effectFlags: EPHEMERAL }, AFTER_READ],
    ['une échéance sans date de création — fermé', { expiresAt: '2026-10-07T10:05:00Z' }, AFTER_READ],
    [
      'une échéance antérieure à la création — fermé',
      { expiresAt: '2026-10-07T09:00:00Z', createdAt: '2026-10-07T10:00:00Z' },
      AFTER_READ,
    ],
    ['une pièce qui porte le bit après lecture', { attachments: [{ effectFlags: EPHEMERAL_AFTER_READ }] }, AFTER_READ],
    [
      'une pièce après lecture sous une flamme à durée — la plus restrictive',
      { effectFlags: EPHEMERAL, ephemeralDuration: 30, attachments: [{}, { effectFlags: EPHEMERAL_AFTER_READ }] },
      AFTER_READ,
    ],

    ['la colonne vue unique', { isViewOnce: true }, ONCE],
    ['le bit VIEW_ONCE seul', { effectFlags: VIEW_ONCE }, ONCE],
    ['une pièce en vue unique sous un message ordinaire', { attachments: [{}, { isViewOnce: true }] }, ONCE],
    ['le bit VIEW_ONCE d’une pièce', { attachments: [{ effectFlags: VIEW_ONCE }] }, ONCE],
    ['vue unique ET flamme à durée', { isViewOnce: true, effectFlags: EPHEMERAL, ephemeralDuration: 30 }, ONCE],
    ['vue unique ET après lecture', { effectFlags: VIEW_ONCE | EPHEMERAL | EPHEMERAL_AFTER_READ }, ONCE],
    [
      'une pièce en vue unique sous une flamme après lecture',
      { effectFlags: EPHEMERAL_AFTER_READ, attachments: [{ isViewOnce: true }] },
      ONCE,
    ],
    [
      'la grâce d’une vue unique consommée n’en fait pas une flamme',
      { isViewOnce: true, expiresAt: '2026-10-07T10:05:00Z', createdAt: '2026-10-07T10:00:00Z' },
      ONCE,
    ],
  ];

  it.each(table)('%s', (_label, subject, expected) => {
    expect(contentExitLaw(subject)).toEqual(expected);
  });

  it('ne lit pas le flou d’une pièce comme une nature de disparition', () => {
    expect(contentExitLaw({ attachments: [{ isBlurred: true, effectFlags: BLURRED }] })).toEqual(ORDINARY);
  });
});

describe('forwardedCopyProtection — ce que la copie transférée porte, quoi que dise la requête', () => {
  const flame = { effectFlags: EPHEMERAL, ephemeralDuration: 300 } as const;

  it('rend null quand la source ne se transfère pas', () => {
    expect(forwardedCopyProtection({ source: { isViewOnce: true }, requested: {} })).toBeNull();
    expect(forwardedCopyProtection({ source: { effectFlags: EPHEMERAL_AFTER_READ }, requested: {} })).toBeNull();
    expect(forwardedCopyProtection({ source: { attachments: [{ isViewOnce: true }] }, requested: {} })).toBeNull();
  });

  it('laisse la requête entière sur une source ordinaire', () => {
    expect(
      forwardedCopyProtection({
        source: {},
        requested: { effectFlags: SHAKE | EPHEMERAL, ephemeralDuration: 60, isBlurred: false },
      }),
    ).toEqual({ effectFlags: SHAKE | EPHEMERAL, isBlurred: false, ephemeralDuration: 60 });
  });

  it('rend des colonnes neutres quand ni la source ni la requête ne déclarent rien', () => {
    expect(forwardedCopyProtection({ source: {}, requested: null })).toEqual({
      effectFlags: 0,
      isBlurred: false,
      ephemeralDuration: null,
    });
  });

  it('fait hériter la durée de la source à qui n’en demande pas, avec le bit après lecture', () => {
    expect(forwardedCopyProtection({ source: flame, requested: {} })).toEqual({
      effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ,
      isBlurred: false,
      ephemeralDuration: 300,
    });
  });

  it.each([
    ['plus courte : gardée', 30, 30],
    ['égale : gardée', 300, 300],
    ['plus longue : ramenée à la source', 86_400, 300],
    ['nulle : celle de la source', 0, 300],
    ['négative : celle de la source', -5, 300],
    ['non finie : celle de la source', Number.POSITIVE_INFINITY, 300],
    ['fractionnaire : arrondie vers le bas', 30.7, 30],
    ['sous la seconde : celle de la source', 0.4, 300],
  ])('durée demandée %s', (_label, requested, expected) => {
    expect(forwardedCopyProtection({ source: flame, requested: { ephemeralDuration: requested } })?.ephemeralDuration).toBe(
      expected,
    );
  });

  it('retire à la requête tout ce qui desserrerait la flamme, et garde ses effets décoratifs', () => {
    expect(
      forwardedCopyProtection({
        source: flame,
        requested: { effectFlags: SHAKE, isBlurred: false, ephemeralDuration: 86_400 },
      }),
    ).toEqual({ effectFlags: SHAKE | EPHEMERAL | EPHEMERAL_AFTER_READ, isBlurred: false, ephemeralDuration: 300 });
  });

  it('impose le flou de la source, colonne ou bit, sur toute nature', () => {
    expect(forwardedCopyProtection({ source: { isBlurred: true }, requested: { isBlurred: false } })).toEqual({
      effectFlags: BLURRED,
      isBlurred: true,
      ephemeralDuration: null,
    });
    expect(
      forwardedCopyProtection({ source: { ...flame, effectFlags: EPHEMERAL | BLURRED }, requested: {} }),
    ).toEqual({ effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ | BLURRED, isBlurred: true, ephemeralDuration: 300 });
  });

  it('laisse la requête AJOUTER un flou que la source ne portait pas', () => {
    expect(forwardedCopyProtection({ source: flame, requested: { isBlurred: true } })).toEqual({
      effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ | BLURRED,
      isBlurred: true,
      ephemeralDuration: 300,
    });
  });

  it('produit une copie qui ne se retransfère pas', () => {
    const copy = forwardedCopyProtection({ source: flame, requested: {} });
    expect(contentExitLaw(copy)).toEqual(AFTER_READ);
  });
});
