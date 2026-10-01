/**
 * Le barème réglable et l'état « N (M) 🔥 » d'une conversation (#8906).
 */
import { describe, it, expect } from 'vitest';
import { ENGAGEMENT_OPERATIONS, ENGAGEMENT_OPERATION_CATALOG } from '../types/engagement-operations.js';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  conversationEngagementForDay,
  elanUnderScale,
  elanUnderScaleFromRows,
  factorCapForLevel,
  formatConversationPoints,
  isConversationEngagementSnapshot,
  levelOfScore,
  linkVisitPoints,
  parseEngagementScale,
  pointsForOperation,
  streakBonusPoints,
  type ConversationEngagementSnapshot,
  type EngagementScale,
} from '../types/engagement-scale.js';
import { computeEngagementElan } from '../utils/engagement-elan.js';

const withRules = (patch: Partial<EngagementScale['multiplier']>): EngagementScale => ({
  ...DEFAULT_ENGAGEMENT_SCALE,
  multiplier: { ...DEFAULT_ENGAGEMENT_SCALE.multiplier, ...patch },
});

const snapshot = (patch: Partial<ConversationEngagementSnapshot> = {}): ConversationEngagementSnapshot => ({
  conversationId: 'c1',
  totalPoints: 120,
  todayPoints: 12,
  streakDays: 4,
  day: '2026-09-30',
  ...patch,
});

describe('les défauts du barème', () => {
  it('reprennent le défaut que le catalogue déclare pour chaque opération', () => {
    for (const key of ENGAGEMENT_OPERATIONS) {
      const { defaults } = ENGAGEMENT_OPERATION_CATALOG[key];
      expect(DEFAULT_ENGAGEMENT_SCALE.operations[key].points).toBe(defaults.points);
      expect(DEFAULT_ENGAGEMENT_SCALE.operations[key].multiplied).toBe(defaults.multiplied);
      expect(DEFAULT_ENGAGEMENT_SCALE.operations[key].cap).toBe(defaults.cap);
    }
  });

  it('suivent la liste remplie par le porteur', () => {
    const ops = DEFAULT_ENGAGEMENT_SCALE.operations;
    expect(ops['content.text_message']).toMatchObject({ points: 3, cap: 300 });
    expect(ops['content.audio_message']).toMatchObject({ points: 5, cap: 500 });
    expect(ops['tool.reaction']).toMatchObject({ points: 2, cap: 30 });
    expect(ops['content.reel']).toMatchObject({ points: 199, cap: 10 });
    expect(ops['content.post'].variantPoints).toEqual({ public: 99, community: 69, friends: 49, other: 0 });
    expect(ops['content.story'].variantPoints).toEqual({ public: 79, community: 39, friends: 19, other: 0 });
    expect(ops['tool.location'].variantPoints).toEqual({ live: 2, static: 1 });
    expect(ops['profile.two_factor']).toMatchObject({ points: 15, multiplied: false });
  });

  it('ne multiplient jamais une opération unique par compte', () => {
    for (const key of ENGAGEMENT_OPERATIONS) {
      if (ENGAGEMENT_OPERATION_CATALOG[key].frequency === 'per-account') {
        expect(DEFAULT_ENGAGEMENT_SCALE.operations[key].multiplied).toBe(false);
      }
    }
  });

  it('rendent le même multiplicateur que l’élan historique', () => {
    const cases = [
      { families: ['content'] as const, achievements: 0, highBadges: 0 },
      { families: ['content', 'comment', 'tool'] as const, achievements: 0, highBadges: 0 },
      { families: ['content', 'comment', 'tool', 'social', 'conversation'] as const, achievements: 12, highBadges: 0 },
    ];
    for (const c of cases) {
      const legacy = computeEngagementElan({
        activeFamilies: c.families,
        achievementCount: c.achievements,
        highBadgeCount: c.highBadges,
      });
      const scaled = elanUnderScale(DEFAULT_ENGAGEMENT_SCALE.multiplier, {
        activeFamilyCount: c.families.length,
        achievementCount: c.achievements,
        highBadgeCount: c.highBadges,
        engagementScore: 0,
      });
      expect(scaled.factor).toBe(legacy.factor);
    }
  });
});

describe('parseEngagementScale', () => {
  it('relit les défauts à l’identique', () => {
    expect(parseEngagementScale(JSON.parse(JSON.stringify(DEFAULT_ENGAGEMENT_SCALE)))).toEqual(DEFAULT_ENGAGEMENT_SCALE);
  });

  it('complète un axe absent par sa règle par défaut', () => {
    const { ['tool.reaction']: _omis, ...rest } = DEFAULT_ENGAGEMENT_SCALE.operations;
    const parsed = parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, operations: rest });
    expect(parsed?.operations['tool.reaction']).toEqual(DEFAULT_ENGAGEMENT_SCALE.operations['tool.reaction']);
  });

  it('refuse un axe inconnu, des points négatifs ou au-delà du plafond dur', () => {
    const ops = DEFAULT_ENGAGEMENT_SCALE.operations;
    expect(parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, operations: { ...ops, 'content.nope': ops['tool.sticker'] } })).toBeNull();
    expect(
      parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, operations: { ...ops, 'tool.sticker': { points: -1, multiplied: true, cap: null } } }),
    ).toBeNull();
    expect(
      parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, operations: { ...ops, 'tool.sticker': { points: 1_000_000, multiplied: true, cap: null } } }),
    ).toBeNull();
  });

  it('refuse un plafond de niveau au-dessus du plafond global, ou deux fois le même niveau', () => {
    expect(parseEngagementScale(withRules({ maxFactor: 3, levelCaps: [{ minLevel: 2, maxFactor: 4 }] }))).toBeNull();
    expect(
      parseEngagementScale(withRules({ levelCaps: [{ minLevel: 1, maxFactor: 2 }, { minLevel: 1, maxFactor: 3 }] })),
    ).toBeNull();
  });

  it('trie les plafonds par niveau', () => {
    const parsed = parseEngagementScale(
      withRules({ levelCaps: [{ minLevel: 3, maxFactor: 4 }, { minLevel: 0, maxFactor: 2 }] }),
    );
    expect(parsed?.multiplier.levelCaps.map((cap) => cap.minLevel)).toEqual([0, 3]);
  });

  it('relit un barème réglé sous l’ancien contrat, dont le plafond s’appelait dailyCapPerConversation', () => {
    const parsed = parseEngagementScale({
      operations: { 'tool.reaction': { points: 4, multiplied: true, dailyCapPerConversation: 12 } },
      multiplier: DEFAULT_ENGAGEMENT_SCALE.multiplier,
    });
    expect(parsed?.operations['tool.reaction']).toEqual({ points: 4, multiplied: true, cap: 12, variantPoints: {} });
    expect(parsed?.linkVisits).toEqual(DEFAULT_ENGAGEMENT_SCALE.linkVisits);
    expect(parsed?.abuse).toEqual(DEFAULT_ENGAGEMENT_SCALE.abuse);
  });

  it('refuse une variante que le catalogue ne déclare pas', () => {
    const ops = DEFAULT_ENGAGEMENT_SCALE.operations;
    const post = { ...ops['content.post'], variantPoints: { secret: 5 } };
    expect(parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, operations: { ...ops, 'content.post': post } })).toBeNull();
  });

  it('refuse une règle de lien dont la valeur maximale est sous la valeur de départ', () => {
    expect(
      parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, linkVisits: { ...DEFAULT_ENGAGEMENT_SCALE.linkVisits, maxPoints: 1 } }),
    ).toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(parseEngagementScale(null)).toBeNull();
    expect(parseEngagementScale('barème')).toBeNull();
  });
});

describe('le plafond par niveau', () => {
  const rules = withRules({ levelCaps: [{ minLevel: 0, maxFactor: 2 }, { minLevel: 3, maxFactor: 4 }] }).multiplier;

  it('prend la dernière entrée dont le niveau est atteint', () => {
    expect(factorCapForLevel(rules, 0)).toBe(2);
    expect(factorCapForLevel(rules, 2)).toBe(2);
    expect(factorCapForLevel(rules, 3)).toBe(4);
    expect(factorCapForLevel(rules, 6)).toBe(4);
  });

  it('borne le multiplicateur d’un compte de bas niveau', () => {
    const elan = elanUnderScale(rules, {
      activeFamilyCount: 5,
      achievementCount: 20,
      highBadgeCount: 0,
      engagementScore: 0,
    });
    expect(elan).toMatchObject({ factor: 2, level: 0, cap: 2, hasStanding: true });
  });

  it('dérive le niveau des paliers de score', () => {
    expect(levelOfScore(0)).toBe(0);
    expect(levelOfScore(10)).toBe(1);
    expect(levelOfScore(149)).toBe(2);
    expect(levelOfScore(2500)).toBe(6);
  });
});

describe('pointsForOperation', () => {
  it('multiplie une opération soumise au multiplicateur, pas les autres', () => {
    const scale: EngagementScale = {
      ...DEFAULT_ENGAGEMENT_SCALE,
      operations: {
        ...DEFAULT_ENGAGEMENT_SCALE.operations,
        'tool.reaction': { points: 2, multiplied: false, cap: 10, variantPoints: {} },
      },
    };
    expect(pointsForOperation(scale, 'content.text_message', 3)).toBe(9);
    expect(pointsForOperation(scale, 'tool.reaction', 3)).toBe(2);
  });

  it('crédite les points de la variante', () => {
    expect(pointsForOperation(DEFAULT_ENGAGEMENT_SCALE, 'content.post', 1, 'public')).toBe(99);
    expect(pointsForOperation(DEFAULT_ENGAGEMENT_SCALE, 'content.post', 2, 'friends')).toBe(98);
    expect(pointsForOperation(DEFAULT_ENGAGEMENT_SCALE, 'content.post', 5, 'other')).toBe(0);
    expect(pointsForOperation(DEFAULT_ENGAGEMENT_SCALE, 'tool.location', 1, 'live')).toBe(2);
  });
});

describe('la règle progressive des visites de lien', () => {
  const rules = DEFAULT_ENGAGEMENT_SCALE.linkVisits;

  it('vaut 2 jusqu’au premier palier, puis +2 à chaque doublement, jamais plus de 20', () => {
    expect([1, 10, 11, 20, 21, 40, 41, 80, 81, 160].map((n) => linkVisitPoints(rules, n))).toEqual([
      2, 2, 4, 4, 6, 6, 8, 8, 10, 10,
    ]);
    expect(linkVisitPoints(rules, 1_000_000)).toBe(20);
  });
});

describe('les bonus de constance', () => {
  it('paient chaque palier franchi, une fois', () => {
    const bonuses = DEFAULT_ENGAGEMENT_SCALE.streakBonuses;
    expect(streakBonusPoints(bonuses, 6, 7)).toBe(10);
    expect(streakBonusPoints(bonuses, 7, 8)).toBe(0);
    expect(streakBonusPoints(bonuses, 29, 30)).toBe(30);
    expect(streakBonusPoints(bonuses, 99, 100)).toBe(100);
  });
});

describe('l’état d’une conversation', () => {
  it('garde la frontière', () => {
    expect(isConversationEngagementSnapshot(snapshot())).toBe(true);
    expect(isConversationEngagementSnapshot(snapshot({ day: null }))).toBe(true);
    expect(isConversationEngagementSnapshot(snapshot({ totalPoints: -1 }))).toBe(false);
    expect(isConversationEngagementSnapshot({ ...snapshot(), day: '30/09/2026' })).toBe(false);
  });

  it('remet les points du jour à zéro passé minuit, garde la série jusqu’au lendemain', () => {
    expect(conversationEngagementForDay(snapshot(), '2026-09-30')).toEqual(snapshot());
    expect(conversationEngagementForDay(snapshot(), '2026-10-01')).toMatchObject({ todayPoints: 0, streakDays: 4, totalPoints: 120 });
    expect(conversationEngagementForDay(snapshot(), '2026-10-02')).toMatchObject({ todayPoints: 0, streakDays: 0, totalPoints: 120 });
  });

  it('s’affiche « N (M) »', () => {
    expect(formatConversationPoints(snapshot())).toBe('120 (12)');
  });
});

describe('elanUnderScaleFromRows', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const familyOf = (axisKey: string) => (axisKey.startsWith('content.') ? 'content' : axisKey.startsWith('comment.') ? 'comment' : null);
  const counters = [
    { axisKey: 'content.text_message', updatedAt: new Date('2026-09-29T12:00:00Z') },
    { axisKey: 'comment.text', updatedAt: new Date('2026-09-20T12:00:00Z') },
  ];

  it('suit la fenêtre du barème, pas la constante', () => {
    const week = elanUnderScaleFromRows({ rules: DEFAULT_ENGAGEMENT_SCALE.multiplier, counters, milestones: [], familyOf, engagementScore: 0, now });
    const month = elanUnderScaleFromRows({ rules: withRules({ windowDays: 30 }).multiplier, counters, milestones: [], familyOf, engagementScore: 0, now });
    expect(week).toMatchObject({ factor: 1, activeFamilyCount: 1 });
    expect(month).toMatchObject({ factor: 2, activeFamilyCount: 2 });
  });

  it('suit le seuil de haut badge du barème et compte la famille du geste à venir', () => {
    const milestones = Array.from({ length: 5 }, (_, i) => ({ milestoneType: 'badge', milestoneKey: `content.post:${50 + i}` }));
    const elan = elanUnderScaleFromRows({
      rules: withRules({ highBadgeThreshold: 50 }).multiplier,
      counters,
      milestones,
      familyOf,
      engagementScore: 0,
      extraFamily: 'tool',
      now,
    });
    expect(elan).toMatchObject({ hasStanding: true, activeFamilyCount: 2, factor: 3 });
  });
});
