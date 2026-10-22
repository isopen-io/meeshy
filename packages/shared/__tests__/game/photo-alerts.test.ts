/**
 * LES ALERTES D'IMMORTALISATION (#10173, § 5.16.1) — une loi décide quelle étape annoncer, une seule à la fois.
 */

import { describe, it, expect } from 'vitest';
import {
  PHOTO_ALERT_POLICY,
  isBigPhotoMoment,
  photoAlertDigest,
  photoAlertFor,
  photoAlertPacing,
  type PhotoAlertPacing,
  type PhotoAlertPolicy,
} from '../../utils/game/photo-alerts.js';
import { photoCatchUp, photoStepsReached, type PhotoCatchUpStanding } from '../../utils/game/photo-catch-up.js';
import { photoAchievementKeyOfMomentId, photoAchievementMomentId, photoDayMomentId } from '../../utils/game/photo-moments.js';

const standing = (over: Partial<PhotoCatchUpStanding> = {}): PhotoCatchUpStanding => ({
  rank: 'murmure',
  division: 5,
  levelRecord: 1,
  prestige: 0,
  minted: 0,
  treasuryTier: null,
  flameRecord: 0,
  ...over,
});

const policy = (over: Partial<PhotoAlertPolicy> = {}): PhotoAlertPolicy => ({ ...PHOTO_ALERT_POLICY, ...over });

const NEW_ACCOUNT = standing();

describe('ce qui s’annonce', () => {
  it('ligne de base : la première évaluation n’alerte pas', () => {
    expect(photoAlertFor({ reached: ['rank:murmure:4'], standing: standing({ division: 4 }), kept: [], presented: [], baseline: null })).toBeNull();
  });

  it('une seule étape par transition : la plus marquante, et toutes sont rendues pour l’accusé', () => {
    const alert = photoAlertFor({
      reached: ['meesh:10', 'tier:lueur', 'rank:murmure:4'],
      standing: standing({ division: 4, levelRecord: 10, minted: 10 }),
      kept: ['start', 'meesh:1'],
      presented: [],
      baseline: NEW_ACCOUNT,
    });
    expect(alert).toEqual({ announce: 'rank:murmure:4', propose: 'rank:murmure:4', reached: ['meesh:10', 'tier:lueur', 'rank:murmure:4'] });
  });

  it('l’étape ouverte remplace celle qui saute', () => {
    const alert = photoAlertFor({
      reached: ['meesh:50'],
      standing: standing({ minted: 50 }),
      kept: ['start', 'meesh:1', 'meesh:10', 'meesh:20', 'meesh:30'],
      presented: [],
      baseline: standing({ minted: 49 }),
    });
    expect(alert).toEqual({ announce: 'meesh:50', propose: 'meesh:40', reached: ['meesh:50'] });
  });

  it('Légende II atteinte, aucune photo de rang : on annonce Légende II et on propose Murmure IV', () => {
    const alert = photoAlertFor({
      reached: ['rank:legende:2'],
      standing: standing({ rank: 'legende', division: 2 }),
      kept: ['start'],
      presented: [],
      baseline: standing({ rank: 'legende', division: 3 }),
    });
    expect(alert).toEqual({ announce: 'rank:legende:2', propose: 'rank:murmure:4', reached: ['rank:legende:2'] });
  });

  it('D20 (b) : l’arriéré d’avant la ligne de base ne verrouille plus l’étape nouvelle', () => {
    const alert = photoAlertFor({
      reached: ['rank:legende:2'],
      standing: standing({ rank: 'legende', division: 2 }),
      kept: ['start'],
      presented: [],
      baseline: standing({ rank: 'legende', division: 3 }),
      policy: policy({ backlog: 'apart' }),
    });
    expect(alert).toEqual({ announce: 'rank:legende:2', propose: 'rank:legende:2', reached: ['rank:legende:2'] });
  });

  it('une étape déjà franchie à la ligne de base ne s’annonce pas', () => {
    expect(
      photoAlertFor({ reached: ['rank:voix:4'], standing: standing({ rank: 'voix', division: 4 }), kept: [], presented: [], baseline: standing({ rank: 'voix', division: 4 }) }),
    ).toBeNull();
  });

  it('une étape présentée ou notifiée n’est jamais reproposée', () => {
    expect(
      photoAlertFor({ reached: ['rank:voix:4'], standing: standing({ rank: 'voix', division: 4 }), kept: [], presented: ['rank:voix:4'], baseline: NEW_ACCOUNT }),
    ).toBeNull();
  });

  it('une étape déjà photographiée ne s’annonce pas', () => {
    expect(photoAlertFor({ reached: ['meesh:1'], standing: standing({ minted: 1 }), kept: ['meesh:1'], presented: [], baseline: NEW_ACCOUNT })).toBeNull();
  });

  it('le départ ne s’annonce jamais', () => {
    expect(photoAlertFor({ reached: ['start'], standing: NEW_ACCOUNT, kept: [], presented: [], baseline: NEW_ACCOUNT })).toBeNull();
  });
});

describe('la politique', () => {
  const rankPassage = policy({ photographs: 'rank-passage' });

  it('« rang seul » : Oracle III n’est ni photographiable, ni annoncée, ni bloquante', () => {
    const oracle3 = standing({ rank: 'oracle', division: 3 });
    expect(photoStepsReached(oracle3, rankPassage).map((s) => s.id)).not.toContain('rank:oracle:3');
    expect(photoAlertFor({ reached: ['rank:oracle:3'], standing: oracle3, kept: [], presented: [], baseline: NEW_ACCOUNT, policy: rankPassage })).toBeNull();
    const voix = standing({ rank: 'voix', division: 5 });
    expect(photoCatchUp(voix, ['start', 'rank:echo:5'], rankPassage).map((e) => e.id)).toEqual(['rank:voix:5']);
    expect(photoAlertFor({ reached: ['rank:voix:5'], standing: voix, kept: ['start'], presented: [], baseline: NEW_ACCOUNT, policy: rankPassage })).toEqual({
      announce: 'rank:voix:5',
      propose: 'rank:echo:5',
      reached: ['rank:voix:5'],
    });
  });

  it('par défaut, le carnet garde toutes les étapes de la loi actuelle', () => {
    const s = standing({ rank: 'voix', division: 4, minted: 12, flameRecord: 31, treasuryTier: 'escarcelle', levelRecord: 34 });
    expect(photoStepsReached(s, PHOTO_ALERT_POLICY)).toEqual(photoStepsReached(s));
  });

  it('réglage « grands moments » : une division ne s’annonce pas, un passage de rang oui', () => {
    const big = policy({ invitations: 'big-moments' });
    expect(photoAlertFor({ reached: ['rank:voix:4'], standing: standing({ rank: 'voix', division: 4 }), kept: [], presented: [], baseline: NEW_ACCOUNT, policy: big })).toBeNull();
    expect(
      photoAlertFor({ reached: ['rank:voix:5'], standing: standing({ rank: 'voix', division: 5 }), kept: [], presented: [], baseline: NEW_ACCOUNT, policy: big })?.announce,
    ).toBe('rank:voix:5');
  });

  it('réglage « jamais » : rien ne s’annonce, le carnet garde tout', () => {
    expect(
      photoAlertFor({ reached: ['rank:voix:5'], standing: standing({ rank: 'voix', division: 5 }), kept: [], presented: [], baseline: NEW_ACCOUNT, policy: policy({ invitations: 'never' }) }),
    ).toBeNull();
  });

  it('les grands moments : passage de rang, Mythe, niveau 100, Prestige, Meesh d’or ou prisme, Flamme 100 et 365', () => {
    const big = ['rank:echo:5', 'rank:mythe:0', 'level-100:0', 'prestige:2', 'meesh:100', 'meesh:1000', 'flame:100', 'flame:365'];
    const small = ['rank:echo:4', 'tier:lueur', 'meesh:10', 'meesh:1', 'flame:30', 'treasury:bourse', 'start', 'day:2026-10-11'];
    expect(big.filter(isBigPhotoMoment)).toEqual(big);
    expect(small.filter(isBigPhotoMoment)).toEqual([]);
  });
});

describe('le trésor', () => {
  it('se lit au plus haut palier atteint quand il est servi', () => {
    const alert = photoAlertFor({
      reached: ['treasury:coffret'],
      standing: standing({ treasuryTier: 'bourse' }),
      treasuryPeak: 'coffret',
      kept: ['treasury:bourse', 'treasury:escarcelle'],
      presented: [],
      baseline: NEW_ACCOUNT,
    });
    expect(alert).toEqual({ announce: 'treasury:coffret', propose: 'treasury:coffret', reached: ['treasury:coffret'] });
  });

  it('sans plus haut palier servi, le palier courant', () => {
    expect(
      photoAlertFor({ reached: ['treasury:coffret'], standing: standing({ treasuryTier: 'bourse' }), kept: [], presented: [], baseline: NEW_ACCOUNT }),
    ).toBeNull();
  });
});

describe('la réalisation du jour', () => {
  it('son identité est day:<AAAA-MM-JJ>', () => {
    expect(photoDayMomentId('2026-10-11')).toBe('day:2026-10-11');
    expect(photoDayMomentId('11/10/2026')).toBeNull();
  });

  it('s’annonce une fois : présentée, elle ne revient pas le même jour', () => {
    const day = 'day:2026-10-11';
    expect(photoAlertFor({ reached: [day], standing: NEW_ACCOUNT, kept: [], presented: [], baseline: NEW_ACCOUNT })).toEqual({ announce: day, propose: day, reached: [day] });
    expect(photoAlertFor({ reached: [day], standing: NEW_ACCOUNT, kept: [], presented: [day], baseline: NEW_ACCOUNT })).toBeNull();
  });

  it('au plus une par jour en attente : seule la plus récente reste', () => {
    expect(photoAlertFor({ reached: ['day:2026-10-10', 'day:2026-10-11'], standing: NEW_ACCOUNT, kept: [], presented: [], baseline: NEW_ACCOUNT })?.reached).toEqual([
      'day:2026-10-11',
    ]);
  });

  it('passe après une étape de piste', () => {
    expect(photoAlertFor({ reached: ['day:2026-10-11', 'meesh:1'], standing: standing({ minted: 1 }), kept: [], presented: [], baseline: NEW_ACCOUNT })?.announce).toBe('meesh:1');
  });
});

describe('le haut fait (LS, #10168)', () => {
  it('son identité est achievement:<clé du catalogue>, simple ou composé, la même que le web et iOS gravent — sans la rareté', () => {
    expect(photoAchievementMomentId('messages.3')).toBe('achievement:messages.3');
    expect(photoAchievementMomentId('defi.streak-3')).toBe('achievement:defi.streak-3');
    expect(photoAchievementMomentId('')).toBeNull();
    expect(photoAchievementMomentId('Messages:3')).toBeNull();
  });

  it('la clé se relit depuis l’identité, et seulement depuis une identité de haut fait', () => {
    expect(photoAchievementKeyOfMomentId('achievement:defi.streak-3')).toBe('defi.streak-3');
    expect(photoAchievementKeyOfMomentId('day:2026-10-11')).toBeNull();
    expect(photoAchievementKeyOfMomentId('achievement:')).toBeNull();
  });
});

describe('le rythme dans l’app', () => {
  const MIN = 60_000;
  const at = (minutes: number): number => Date.UTC(2026, 9, 11, 8, 0) + minutes * MIN;
  const pacing = (over: Partial<PhotoAlertPacing> = {}): PhotoAlertPacing => ({
    now: at(600),
    dayKey: '2026-10-11',
    sessionStartedAt: at(0),
    surface: 'passive',
    shown: [],
    ...over,
  });

  it('plafond : une invitation par jour, gestes compris', () => {
    expect(photoAlertPacing(pacing({ shown: [{ at: at(0), dayKey: '2026-10-11' }] }))).toBe('silent');
    expect(photoAlertPacing(pacing({ shown: [{ at: at(-1440), dayKey: '2026-10-10' }] }))).toBe('allowed');
  });

  it('écart : quatre heures depuis la dernière invitation, même la veille', () => {
    const policyTwo = policy({ inApp: { ...PHOTO_ALERT_POLICY.inApp, perDay: 2 } });
    expect(photoAlertPacing(pacing({ shown: [{ at: at(600 - 239), dayKey: '2026-10-11' }] }), policyTwo)).toBe('silent');
    expect(photoAlertPacing(pacing({ shown: [{ at: at(600 - 240), dayKey: '2026-10-11' }] }), policyTwo)).toBe('allowed');
  });

  it('délai de grâce : aucune invitation passive dans les dix premières minutes d’une session ; un geste n’attend pas', () => {
    expect(photoAlertPacing(pacing({ now: at(9), sessionStartedAt: at(0) }))).toBe('wait');
    expect(photoAlertPacing(pacing({ now: at(10), sessionStartedAt: at(0) }))).toBe('allowed');
    expect(photoAlertPacing(pacing({ now: at(1), sessionStartedAt: at(0), surface: 'gesture' }))).toBe('allowed');
  });

  it('une alerte hors rythme n’est pas rendue', () => {
    expect(
      photoAlertFor({
        reached: ['meesh:1'],
        standing: standing({ minted: 1 }),
        kept: [],
        presented: [],
        baseline: NEW_ACCOUNT,
        pacing: pacing({ shown: [{ at: at(0), dayKey: '2026-10-11' }] }),
      }),
    ).toBeNull();
  });
});

describe('le résumé du push', () => {
  it('ne compte que les étapes ni présentées ni notifiées, jamais le départ ni la réalisation du jour', () => {
    expect(
      photoAlertDigest([
        { stepId: 'rank:voix:5', presentedAt: null, notifiedAt: null },
        { stepId: 'meesh:10', presentedAt: '2026-10-11T08:00:00.000Z', notifiedAt: null },
        { stepId: 'tier:lueur', presentedAt: null, notifiedAt: '2026-10-11T08:00:00.000Z' },
        { stepId: 'flame:7', presentedAt: null, notifiedAt: null },
        { stepId: 'start', presentedAt: null, notifiedAt: null },
        { stepId: 'day:2026-10-11', presentedAt: null, notifiedAt: null },
        { stepId: 'flame:7', presentedAt: null, notifiedAt: null },
      ]),
    ).toEqual({ stepIds: ['rank:voix:5', 'flame:7'], count: 2 });
  });

  it('rien à notifier : aucun résumé', () => {
    expect(photoAlertDigest([{ stepId: 'meesh:10', presentedAt: '2026-10-11T08:00:00.000Z', notifiedAt: null }])).toBeNull();
  });
});
