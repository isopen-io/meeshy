/**
 * Le barème réglable et l'état « N (M) 🔥 » d'une conversation (#8906).
 */
import { describe, it, expect } from 'vitest';
import { ENGAGEMENT_AXES, ENGAGEMENT_AXIS_WEIGHTS } from '../types/engagement.js';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  conversationEngagementForDay,
  elanUnderScale,
  factorCapForLevel,
  formatConversationPoints,
  isConversationEngagementSnapshot,
  levelOfScore,
  parseEngagementScale,
  pointsForOperation,
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
  it('créditent exactement les poids d’axe du code, multipliés', () => {
    for (const axisKey of ENGAGEMENT_AXES) {
      expect(DEFAULT_ENGAGEMENT_SCALE.operations[axisKey].points).toBe(ENGAGEMENT_AXIS_WEIGHTS[axisKey]);
      expect(DEFAULT_ENGAGEMENT_SCALE.operations[axisKey].multiplied).toBe(true);
    }
  });

  it('plafonnent les réactions et les pièces jointes par conversation et par jour', () => {
    expect(DEFAULT_ENGAGEMENT_SCALE.operations['tool.reaction'].dailyCapPerConversation).toBeGreaterThan(0);
    expect(DEFAULT_ENGAGEMENT_SCALE.operations['tool.attachment'].dailyCapPerConversation).toBeGreaterThan(0);
    expect(DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].dailyCapPerConversation).toBeNull();
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
      parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, operations: { ...ops, 'tool.sticker': { points: -1, multiplied: true, dailyCapPerConversation: null } } }),
    ).toBeNull();
    expect(
      parseEngagementScale({ ...DEFAULT_ENGAGEMENT_SCALE, operations: { ...ops, 'tool.sticker': { points: 1_000_000, multiplied: true, dailyCapPerConversation: null } } }),
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
        'tool.reaction': { points: 2, multiplied: false, dailyCapPerConversation: 10 },
      },
    };
    expect(pointsForOperation(scale, 'content.text_message', 3)).toBe(27);
    expect(pointsForOperation(scale, 'tool.reaction', 3)).toBe(2);
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
