import { describe, expect, it } from 'vitest';
import casesFile from '../fixtures/relation-access-cases.json';
import { effectiveRelationLevel, relationAccessReads, resolveRelationAccess, type RelationAccessInput, type RelationAgeClass } from '../utils/relation-access';
import {
  RELATION_FEATURES,
  RELATION_FEATURE_MIN_LEVEL,
  RELATION_LEVEL_LABELS,
  RELATION_LEVEL_PRESENTATION,
  RELATION_PRESENCE_FEATURES,
  RELATION_TEAM_CLOSED_FEATURES,
  RELATION_THRESHOLDS,
  relationThresholdsFor,
  type RelationFeature,
} from '../utils/relation-levels';
import { RELATION_LEVELS, type RelationLevel } from '../types/relation';
import { declaredAgeClass } from '../utils/age';

const USER_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const USER_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const access = (over: Partial<RelationAccessInput> = {}) =>
  resolveRelationAccess({
    viewerId: USER_A,
    targetId: USER_B,
    grantedByViewer: 'PUBLIC',
    grantedByTarget: 'PUBLIC',
    sharesCommunity: false,
    blockedEitherWay: false,
    viewerMinor: 'adult',
    targetMinor: 'adult',
    viewerRole: 'USER',
    feature: 'presence.online',
    ...over,
  });

const both = (level: RelationLevel) => ({ grantedByViewer: level, grantedByTarget: level });

type CaseFile = {
  readonly cases: ReadonlyArray<{
    readonly id: string;
    readonly input: Record<string, unknown>;
    readonly expected: unknown;
  }>;
};

describe('fixtures partagées — l\'oracle écrit à la main est rejoué contre la loi TS', () => {
  const file = casesFile as unknown as CaseFile;

  it('porte assez de cas pour que les miroirs aient de quoi se mesurer', () => {
    expect(file.cases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(file.cases.map((c) => c.id)).size).toBe(file.cases.length);
  });

  it('nomme CHAQUE feature de la matrice, autorisée à son seuil et refusée un cran dessous : un miroir ne peut diverger sur aucune', () => {
    const verdictsByFeature = file.cases.reduce(
      (byFeature, c) => byFeature.set(String(c.input.feature), [...(byFeature.get(String(c.input.feature)) ?? []), c]),
      new Map<string, Array<(typeof file.cases)[number]>>(),
    );
    const uncovered = RELATION_FEATURES.filter((feature) => {
      if (feature === 'acquaintance.auto') return !verdictsByFeature.has(feature);
      const verdicts = (verdictsByFeature.get(feature) ?? []).map((c) => (c.expected as { allowed: boolean }).allowed);
      return !(verdicts.includes(true) && verdicts.includes(false));
    });
    expect(uncovered).toEqual([]);
  });

  it.each(file.cases.map((c) => [c.id, c] as const))('cas %s', (_id, c) => {
    expect(resolveRelationAccess(c.input as unknown as RelationAccessInput)).toEqual(c.expected);
  });
});

describe('resolveRelationAccess — le niveau effectif', () => {
  it('est le MINIMUM des niveaux accordés par chacun (aucun accès à sens unique)', () => {
    expect(access({ grantedByViewer: 'BLOOD', grantedByTarget: 'FRIEND' }).effectiveLevel).toBe('FRIEND');
    expect(access({ grantedByViewer: 'FRIEND', grantedByTarget: 'BLOOD' }).effectiveLevel).toBe('FRIEND');
    expect(access({ grantedByViewer: 'BLOOD', grantedByTarget: 'PUBLIC' }).allowed).toBe(false);
  });

  it('relève PUBLIC à COMMUNITY quand une communauté est partagée, jamais au-delà', () => {
    expect(access({ sharesCommunity: true }).effectiveLevel).toBe('COMMUNITY');
    expect(access({ sharesCommunity: true, ...both('FRIEND') }).effectiveLevel).toBe('FRIEND');
  });

  it('lit un niveau illisible comme PUBLIC (fail-closed), jamais plus haut', () => {
    const unreadable = access({ grantedByViewer: 'GALAXY' as RelationLevel, grantedByTarget: 'BLOOD' });
    expect(unreadable.effectiveLevel).toBe('PUBLIC');
    expect(unreadable.allowed).toBe(false);
  });

  it('un blocage dans un sens ou dans l\'autre ne laisse RIEN, même au sommet de l\'échelle', () => {
    const result = access({ ...both('BLOOD'), blockedEitherWay: true, feature: 'audience.blood' });
    expect(result).toEqual({ allowed: false, effectiveLevel: 'PUBLIC', reason: 'blocked', requiresConsent: false });
  });
});

describe('resolveRelationAccess — la matrice niveau -> feature', () => {
  // Oracle écrit à la main, INDÉPENDANT de la config : si la config bouge sans que
  // la décision ne bouge, ce tableau rougit.
  const EXPECTED_MINIMUM: ReadonlyArray<readonly [RelationFeature, RelationLevel]> = [
    ['presence.online', 'FRIEND'],
    ['presence.detailed', 'CLOSE'],
    ['game.basic', 'FRIEND'],
    ['game.sparksGlory', 'CLOSE'],
    ['notify.newContent', 'CLOSE'],
    ['relay.commentersOnMyPosts', 'CLOSE'],
    ['relay.myCommentsElsewhere', 'BLOOD'],
    ['dm.direct', 'ACQUAINTANCE'],
    ['dm.request', 'PUBLIC'],
    ['dm.readReceipts', 'ACQUAINTANCE'],
    ['dm.typing', 'ACQUAINTANCE'],
    ['presence.dnd', 'ACQUAINTANCE'],
    ['call.ring', 'PUBLIC'],
    ['views.identity', 'COMMUNITY'],
    ['audience.acquaintances', 'ACQUAINTANCE'],
    ['audience.close', 'CLOSE'],
    ['audience.blood', 'BLOOD'],
    ['listening.category', 'CLOSE'],
    ['listening.title', 'BLOOD'],
    ['talkie', 'CLOSE'],
    ['bring', 'FRIEND'],
    ['location.live', 'BLOOD'],
    ['location.history', 'BLOOD'],
    ['location.proximity', 'BLOOD'],
  ];

  it.each(EXPECTED_MINIMUM)('%s s\'ouvre exactement à partir de %s (consentement donné)', (feature, minimum) => {
    RELATION_LEVELS.forEach((level) => {
      const reached = RELATION_LEVELS.indexOf(level) >= RELATION_LEVELS.indexOf(minimum);
      expect(access({ ...both(level), feature, consent: 'granted' }).allowed).toBe(reached);
    });
  });

  it('lit la matrice dans la CONFIG : aucune feature sans niveau minimal', () => {
    expect(Object.keys(RELATION_FEATURE_MIN_LEVEL).sort()).toEqual(
      [...EXPECTED_MINIMUM.map(([feature]) => feature), 'acquaintance.auto'].sort(),
    );
  });
});

describe('resolveRelationAccess — soi et rôle', () => {
  it('laisse voir sa propre présence à soi-même, sans lien', () => {
    expect(access({ targetId: USER_A, feature: 'presence.detailed' })).toEqual({
      allowed: true,
      effectiveLevel: 'BLOOD',
      reason: 'self',
      requiresConsent: false,
    });
  });

  it('refuse à soi-même une action dirigée vers un autre (bring, talkie)', () => {
    expect(access({ targetId: USER_A, feature: 'bring' })).toMatchObject({ allowed: false, reason: 'self' });
    expect(access({ targetId: USER_A, feature: 'talkie' })).toMatchObject({ allowed: false, reason: 'self' });
  });

  it.each(['ADMIN', 'BIGBOSS'] as const)('%s lit la présence, et seulement la présence', (viewerRole) => {
    expect(access({ viewerRole, feature: 'presence.detailed' })).toMatchObject({ allowed: true, reason: 'role' });
    expect(access({ viewerRole, feature: 'location.live' }).allowed).toBe(false);
    expect(access({ viewerRole, feature: 'audience.blood' }).allowed).toBe(false);
  });

  it.each(['MODERATOR', 'AUDIT', 'ANALYST', 'USER'] as const)('%s est un viewer ordinaire', (viewerRole) => {
    expect(access({ viewerRole, feature: 'presence.online' }).allowed).toBe(false);
  });

  it.each(['MODERATOR', 'ADMIN', 'BIGBOSS'] as const)('%s face à un utilisateur ordinaire : aucun verdict ne change', (viewerRole) => {
    const opened = RELATION_FEATURES.filter((feature) => !RELATION_PRESENCE_FEATURES.has(feature)).filter(
      (feature) =>
        access({ viewerRole, targetRole: 'USER', feature, consent: 'granted' }).allowed !==
        access({ viewerRole: 'USER', targetRole: 'USER', feature, consent: 'granted' }).allowed,
    );
    expect(opened).toEqual([]);
  });

  it('le blocage l\'emporte sur le privilège administrateur', () => {
    expect(access({ viewerRole: 'ADMIN', blockedEitherWay: true })).toMatchObject({ allowed: false, reason: 'blocked' });
  });

  it.each([
    ['vides', '', ''],
    ['absentes', undefined, undefined],
  ])('deux identités %s ne valent jamais « soi » : rien ne s\'ouvre, pas même au rang Sang', (_label, viewerId, targetId) => {
    const missing = { viewerId, targetId } as unknown as Pick<RelationAccessInput, 'viewerId' | 'targetId'>;
    expect(access({ ...missing, feature: 'location.history' })).toEqual({
      allowed: false,
      effectiveLevel: 'PUBLIC',
      reason: 'level',
      requiresConsent: false,
    });
    expect(access({ ...missing, ...both('BLOOD'), feature: 'audience.blood' }).allowed).toBe(false);
  });
});

describe('resolveRelationAccess — l\'équipe (#16623)', () => {
  const team = { viewerRole: 'MODERATOR', targetRole: 'ADMIN', consent: 'granted' } as const;

  it('ouvre à deux comptes de l\'équipe chaque outil de cercle, au niveau Sang, sans lien', () => {
    const tools = RELATION_FEATURES.filter((feature) => !RELATION_TEAM_CLOSED_FEATURES.has(feature));
    expect(tools.filter((feature) => !access({ ...team, feature }).allowed)).toEqual([]);
    expect(new Set(tools.map((feature) => access({ ...team, feature }).effectiveLevel))).toEqual(new Set(['BLOOD']));
  });

  it('ne dit jamais `role` pour un outil ouvert par l\'équipe : un modérateur reste sous les préférences de la cible', () => {
    expect(access({ ...team, feature: 'presence.online' }).reason).toBe('level');
  });

  it('n\'ouvre aucune audience de contenu : ni publication, ni notification, ni relais', () => {
    const closed = [...RELATION_TEAM_CLOSED_FEATURES].filter((feature) => feature !== 'acquaintance.auto');
    expect(closed.filter((feature) => access({ ...team, feature }).allowed)).toEqual([]);
    expect(new Set(closed.map((feature) => access({ ...team, ...both('FRIEND'), feature }).effectiveLevel))).toEqual(new Set(['FRIEND']));
  });

  it('`NOBODY` ferme, même au rang Sang réel d\'une paire de l\'équipe', () => {
    expect(access({ ...team, ...both('BLOOD'), feature: 'notify.newContent', ownerAudience: 'NOBODY' }).allowed).toBe(false);
  });

  it('un rôle de cible absent, nul ou inconnu n\'ouvre rien', () => {
    const roles = [undefined, null, '', 'SUPERADMIN', 'MODO'] as const;
    expect(roles.filter((targetRole) => access({ ...team, targetRole, feature: 'bring' }).allowed)).toEqual([]);
  });

  it('un rôle de viewer absent n\'ouvre rien non plus', () => {
    expect(access({ ...team, viewerRole: undefined, feature: 'bring' }).allowed).toBe(false);
  });

  it('`effectiveRelationLevel` ne connaît pas les rôles : il dit le lien réel', () => {
    expect(effectiveRelationLevel({ ...both('PUBLIC'), sharesCommunity: false })).toBe('PUBLIC');
  });
});

describe('resolveRelationAccess — les mineurs (décision porteur 2026-10-31)', () => {
  const AGES: readonly RelationAgeClass[] = ['minor', 'adult', 'unknown'];
  const pairs = AGES.flatMap((viewerMinor) => AGES.map((targetMinor) => ({ viewerMinor, targetMinor })));

  const CONSENT_FEATURES = ['bring', 'talkie', 'listening.category', 'listening.title', 'location.live', 'location.history', 'location.proximity'] as const;

  it.each(CONSENT_FEATURES)('%s s\'ouvre à tout âge une fois le consentement DONNÉ, jamais derrière un refus d\'âge', (feature) => {
    pairs.forEach((ages) => {
      const result = access({ ...both('BLOOD'), feature, ...ages, consent: 'granted' });
      expect(result).toEqual({ allowed: true, effectiveLevel: 'BLOOD', reason: 'level', requiresConsent: true });
    });
  });

  it.each(CONSENT_FEATURES)('%s reste FERMÉE à tout âge tant que le consentement n\'est pas donné : le plafond atteint n\'ouvre rien', (feature) => {
    pairs.forEach((ages) => {
      [{ consent: 'refused' as const }, { consent: 'unknown' as const }, {}].forEach((consent) => {
        const result = access({ ...both('BLOOD'), feature, ...ages, ...consent });
        expect(result).toEqual({ allowed: false, effectiveLevel: 'BLOOD', reason: 'consent', requiresConsent: true });
      });
    });
  });

  it('un consentement illisible vaut un consentement absent (fail-closed)', () => {
    const unreadable = { consent: 'yes' } as unknown as Pick<RelationAccessInput, 'consent'>;
    expect(access({ ...both('BLOOD'), feature: 'location.live', ...unreadable }).allowed).toBe(false);
  });

  it('le consentement ne hausse pas le plafond : sous le niveau, la feature reste refusée pour le niveau', () => {
    expect(access({ ...both('CLOSE'), feature: 'location.live', consent: 'granted' })).toEqual({
      allowed: false,
      effectiveLevel: 'CLOSE',
      reason: 'level',
      requiresConsent: false,
    });
  });

  it('le consentement ne gouverne que les features qui le demandent', () => {
    expect(access({ ...both('BLOOD'), feature: 'audience.blood', consent: 'refused' }).allowed).toBe(true);
    expect(access({ ...both('FRIEND'), feature: 'presence.online' }).allowed).toBe(true);
  });

  it('soi-même lit sa propre position sans se demander son consentement', () => {
    expect(access({ targetId: USER_A, feature: 'location.live' })).toMatchObject({ allowed: true, reason: 'self' });
  });

  it('ne demande pas de consentement à une feature ordinaire', () => {
    expect(access({ ...both('BLOOD'), feature: 'audience.blood', viewerMinor: 'minor' }).requiresConsent).toBe(false);
  });

  it('ne demande rien quand l\'accès est refusé : le consentement ne ressuscite pas un refus', () => {
    expect(access({ ...both('FRIEND'), feature: 'location.live' })).toMatchObject({ allowed: false, requiresConsent: false });
  });

  it('la Connaissance automatique ne naît pas entre un mineur déclaré et un autre qui ne l\'est pas', () => {
    const refused = [
      { viewerMinor: 'minor', targetMinor: 'adult' },
      { viewerMinor: 'adult', targetMinor: 'minor' },
      { viewerMinor: 'minor', targetMinor: 'unknown' },
      { viewerMinor: 'unknown', targetMinor: 'minor' },
    ] as const;
    refused.forEach((ages) => {
      expect(access({ feature: 'acquaintance.auto', ...ages })).toMatchObject({ allowed: false, reason: 'minor' });
    });
  });

  it('la Connaissance automatique reste ouverte entre deux mineurs, deux majeurs, ou sans âge déclaré', () => {
    const allowed = [
      { viewerMinor: 'minor', targetMinor: 'minor' },
      { viewerMinor: 'adult', targetMinor: 'adult' },
      { viewerMinor: 'unknown', targetMinor: 'adult' },
      { viewerMinor: 'unknown', targetMinor: 'unknown' },
    ] as const;
    allowed.forEach((ages) => {
      expect(access({ feature: 'acquaintance.auto', ...ages }).allowed).toBe(true);
    });
  });
});

describe('resolveRelationAccess — le bouclier des mineurs (RG-21)', () => {
  it('un message privé du Public vers un mineur déclaré est refusé, sans dire pourquoi', () => {
    const refused = [
      { viewerMinor: 'adult', targetMinor: 'minor' },
      { viewerMinor: 'unknown', targetMinor: 'minor' },
    ] as const;
    refused.forEach((ages) => {
      expect(access({ feature: 'dm.request', ...ages })).toEqual({
        allowed: false,
        effectiveLevel: 'PUBLIC',
        reason: 'level',
        requiresConsent: false,
      });
    });
  });

  it('une communauté commune ne suffit pas : seule la Connaissance lève le bouclier', () => {
    expect(access({ feature: 'dm.request', viewerMinor: 'adult', targetMinor: 'minor', sharesCommunity: true }).allowed).toBe(false);
    expect(access({ ...both('ACQUAINTANCE'), feature: 'dm.request', viewerMinor: 'adult', targetMinor: 'minor' }).allowed).toBe(true);
  });

  it('le bouclier ne vise ni deux mineurs, ni une cible majeure, ni un âge inconnu', () => {
    const open = [
      { viewerMinor: 'minor', targetMinor: 'minor' },
      { viewerMinor: 'minor', targetMinor: 'adult' },
      { viewerMinor: 'adult', targetMinor: 'unknown' },
      { viewerMinor: 'adult', targetMinor: 'adult' },
    ] as const;
    open.forEach((ages) => {
      expect(access({ feature: 'dm.request', ...ages }).allowed).toBe(true);
    });
  });

  it('un majeur qui n\'est pas Ami ne fait pas sonner un mineur ; un Ami, si', () => {
    expect(access({ ...both('CLOSE'), feature: 'call.ring', targetMinor: 'minor' }).allowed).toBe(true);
    expect(access({ ...both('FRIEND'), feature: 'call.ring', targetMinor: 'minor' }).allowed).toBe(true);
    expect(access({ ...both('ACQUAINTANCE'), feature: 'call.ring', targetMinor: 'minor' })).toMatchObject({ allowed: false, reason: 'level' });
    expect(access({ feature: 'call.ring', viewerMinor: 'minor', targetMinor: 'minor' }).allowed).toBe(true);
    expect(access({ feature: 'call.ring' }).allowed).toBe(true);
  });

  it('le bouclier ne relève que les features qu\'il nomme', () => {
    expect(access({ ...both('ACQUAINTANCE'), feature: 'dm.typing', viewerMinor: 'adult', targetMinor: 'minor' }).allowed).toBe(true);
  });

  it('une demande de message à soi-même n\'a pas de sens', () => {
    expect(access({ targetId: USER_A, feature: 'dm.request' })).toMatchObject({ allowed: false, reason: 'self' });
  });
});

describe('declaredAgeClass — le tri-état de l\'âge déclaré', () => {
  const now = new Date('2026-10-31T12:00:00.000Z');

  it('distingue mineur, majeur et inconnu', () => {
    expect(declaredAgeClass(new Date('2012-01-01T00:00:00.000Z'), now)).toBe('minor');
    expect(declaredAgeClass(new Date('1990-05-05T00:00:00.000Z'), now)).toBe('adult');
    expect(declaredAgeClass(null, now)).toBe('unknown');
    expect(declaredAgeClass(undefined, now)).toBe('unknown');
    expect(declaredAgeClass(new Date('not-a-date'), now)).toBe('unknown');
  });

  it('compte la majorité le jour même des 18 ans (calendrier UTC)', () => {
    expect(declaredAgeClass(new Date('2008-10-31T00:00:00.000Z'), now)).toBe('adult');
    expect(declaredAgeClass(new Date('2008-11-01T00:00:00.000Z'), now)).toBe('minor');
  });
});

describe('relation-levels — la config', () => {
  it('porte pour chaque niveau une clé i18n, une icône, et un libellé dans les SEPT langues du catalogue', () => {
    const languages = ['ar', 'de', 'en', 'es', 'fr', 'it', 'pt-BR'];
    expect(Object.keys(RELATION_LEVEL_LABELS).sort()).toEqual(languages);
    RELATION_LEVELS.forEach((level) => {
      expect(RELATION_LEVEL_PRESENTATION[level].labelKey).toBe(`relation.level.${level}`);
      expect(RELATION_LEVEL_PRESENTATION[level].icon.length).toBeGreaterThan(0);
      languages.forEach((language) => {
        expect(RELATION_LEVEL_LABELS[language][level].trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('grave les icônes de la décision porteur', () => {
    expect(RELATION_LEVELS.map((level) => RELATION_LEVEL_PRESENTATION[level].icon)).toEqual([
      '🌐', '👥', '👋', '🤝', '🔥', '🩸',
    ]);
  });

  it('grave les seuils de la production', () => {
    expect(RELATION_THRESHOLDS).toEqual({
      acquaintance: { minInteractions: 10 },
      close: { activeWeeks: 4 },
      blood: { activeWeeks: 12 },
      bring: { perDay: { FRIEND: 1, CLOSE: 3, BLOOD: 30, ATOM: null } },
      cooldownDays: 30,
      proximity: { cooldownHours: 2 },
    });
  });

  it('abaisse les seuils sur staging, et seulement eux', () => {
    const staging = relationThresholdsFor('staging');
    expect(staging.acquaintance.minInteractions).toBeLessThan(RELATION_THRESHOLDS.acquaintance.minInteractions);
    expect(staging.close.activeWeeks).toBeLessThan(RELATION_THRESHOLDS.close.activeWeeks);
    expect(staging.blood.activeWeeks).toBeLessThan(RELATION_THRESHOLDS.blood.activeWeeks);
    expect(staging.bring).toEqual(RELATION_THRESHOLDS.bring);
    expect(staging.cooldownDays).toBe(RELATION_THRESHOLDS.cooldownDays);
    expect(relationThresholdsFor('production')).toEqual(RELATION_THRESHOLDS);
    expect(relationThresholdsFor(undefined)).toEqual(RELATION_THRESHOLDS);
  });
});

describe('relationAccessReads — le rôle (#16623)', () => {
  it('fait lire le rôle des deux côtés pour un outil, jamais pour une audience de contenu', () => {
    expect(relationAccessReads('bring').role).toBe(true);
    expect(relationAccessReads('dm.typing').role).toBe(true);
    expect(relationAccessReads('audience.close').role).toBe(false);
    expect(relationAccessReads('acquaintance.auto').role).toBe(false);
  });
});

describe('relationAccessReads — ce que l\'orchestrateur doit lire pour juger une feature', () => {
  it('lit l\'âge pour la Connaissance automatique et pour toute feature du bouclier', () => {
    expect(relationAccessReads('acquaintance.auto').age).toBe(true);
    expect(relationAccessReads('dm.request').age).toBe(true);
    expect(relationAccessReads('dm.typing').age).toBe(false);
  });

  it('lit la communauté seulement quand un plancher de la feature peut s\'atteindre par elle', () => {
    expect(relationAccessReads('dm.request').community).toBe(true);
    expect(relationAccessReads('notify.newContent').community).toBe(true);
    expect(relationAccessReads('dm.typing').community).toBe(false);
    expect(relationAccessReads('presence.dnd').community).toBe(false);
  });
});
