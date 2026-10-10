/**
 * La mission en duo hebdomadaire (#9385) : un objectif commun, la part de
 * chacun, une récompense doublée si les deux finissent leur part.
 */

import { describe, it, expect } from 'vitest';
import {
  DUO_BASE_POINTS,
  DUO_MIN_LEVEL,
  DUO_TEMPLATES,
  canInviteToDuo,
  drawDuoMission,
  duoProgress,
  duoReward,
  duoTransition,
} from '../../utils/game/duo.js';
import { missionReward } from '../../utils/game/missions.js';

const draw = (over: Partial<Parameters<typeof drawDuoMission>[0]> = {}) =>
  drawDuoMission({ userA: 'alice', userB: 'bob', weekKey: '2026-10-05', levelA: 30, levelB: 30, unavailableSignals: [], ...over });

describe('le tirage de la mission en duo', () => {
  it('est le même pour les deux, quel que soit celui qui regarde', () => {
    expect(draw()).toEqual(draw({ userA: 'bob', userB: 'alice' }));
  });

  it('change d\'une semaine à l\'autre et d\'un duo à l\'autre', () => {
    const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'];
    expect(new Set(weeks.map((weekKey) => draw({ weekKey })?.templateKey)).size).toBeGreaterThan(1);
  });

  it('prend la part de chacun sur le niveau le plus bas des deux', () => {
    const low = draw({ levelA: 10, levelB: 90 });
    const sameLow = draw({ levelA: 10, levelB: 10 });
    expect(low?.partTarget).toBe(sameLow?.partTarget);
    expect(draw({ levelA: 90, levelB: 90 })?.partTarget).toBeGreaterThan(sameLow?.partTarget ?? 0);
  });

  it('porte un objectif commun égal aux deux parts', () => {
    const mission = draw();
    expect(mission?.commonTarget).toBe((mission?.partTarget ?? 0) * 2);
  });

  it('ne tire jamais un signal impossible pour l\'un des deux', () => {
    const all = DUO_TEMPLATES.map((t) => t.signal);
    const blocked = all.filter((s, i) => all.indexOf(s) === i && s !== 'axis:content.text_message');
    expect(draw({ unavailableSignals: blocked })?.signal).toBe('axis:content.text_message');
  });

  it('ne rend rien quand aucun gabarit ne convient', () => {
    expect(draw({ unavailableSignals: DUO_TEMPLATES.map((t) => t.signal) })).toBeNull();
  });
});

describe('la progression', () => {
  it('plafonne la part de chacun, et dit qui a fini', () => {
    expect(duoProgress({ partTarget: 20, mine: 25, partner: 8 })).toEqual({
      mine: 20,
      partner: 8,
      common: 28,
      commonTarget: 40,
      mineDone: true,
      partnerDone: false,
      bothDone: false,
    });
  });

  it('s\'achève quand les deux ont fini', () => {
    expect(duoProgress({ partTarget: 5, mine: 5, partner: 6 }).bothDone).toBe(true);
  });

  it('ne laisse pas l\'excédent de l\'un finir la part de l\'autre', () => {
    expect(duoProgress({ partTarget: 10, mine: 100, partner: 0 }).common).toBe(10);
  });
});

describe('la récompense', () => {
  const base = missionReward({ basePoints: DUO_BASE_POINTS, level: 30, flameDays: 10 });

  it('est nulle tant que ma part n\'est pas faite', () => {
    expect(duoReward({ level: 30, flameDays: 10, mineDone: false, partnerDone: true })).toEqual({ points: 0, doubled: false });
  });

  it('vaut une mission seule quand l\'autre n\'a pas fini', () => {
    expect(duoReward({ level: 30, flameDays: 10, mineDone: true, partnerDone: false })).toEqual({ points: base, doubled: false });
  });

  it('DOUBLE quand les deux finissent', () => {
    expect(duoReward({ level: 30, flameDays: 10, mineDone: true, partnerDone: true })).toEqual({ points: base * 2, doubled: true });
  });

  it('suit le niveau et la Flamme de chacun', () => {
    expect(duoReward({ level: 30, flameDays: 0, mineDone: true, partnerDone: false }).points).toBeLessThan(base);
  });
});

describe('l\'invitation', () => {
  const ok = { inviterLevelRecord: 25, inviteeLevelRecord: 20, areFriends: true, inviterHasDuo: false, inviteeHasDuo: false, self: false };

  it('s\'ouvre au niveau 20, pour les deux', () => {
    expect(DUO_MIN_LEVEL).toBe(20);
    expect(canInviteToDuo(ok)).toEqual({ allowed: true });
    expect(canInviteToDuo({ ...ok, inviterLevelRecord: 19 })).toEqual({ allowed: false, reason: 'locked' });
    expect(canInviteToDuo({ ...ok, inviteeLevelRecord: 19 })).toEqual({ allowed: false, reason: 'invitee-locked' });
  });

  it('ne s\'adresse qu\'à un ami accepté, jamais à soi', () => {
    expect(canInviteToDuo({ ...ok, areFriends: false })).toEqual({ allowed: false, reason: 'not-friends' });
    expect(canInviteToDuo({ ...ok, self: true })).toEqual({ allowed: false, reason: 'self' });
  });

  it('n\'admet qu\'un duo à la fois par personne', () => {
    expect(canInviteToDuo({ ...ok, inviterHasDuo: true })).toEqual({ allowed: false, reason: 'already-in-duo' });
    expect(canInviteToDuo({ ...ok, inviteeHasDuo: true })).toEqual({ allowed: false, reason: 'invitee-in-duo' });
  });
});

describe('le cycle d\'un duo', () => {
  it('s\'accepte par l\'invité seul', () => {
    expect(duoTransition({ status: 'invited', action: 'accept', actor: 'invitee' })).toBe('active');
    expect(duoTransition({ status: 'invited', action: 'accept', actor: 'inviter' })).toBeNull();
  });

  it('s\'abandonne — décliner une invitation, annuler la sienne, quitter un duo en cours', () => {
    expect(duoTransition({ status: 'invited', action: 'abandon', actor: 'invitee' })).toBe('abandoned');
    expect(duoTransition({ status: 'invited', action: 'abandon', actor: 'inviter' })).toBe('abandoned');
    expect(duoTransition({ status: 'active', action: 'abandon', actor: 'invitee' })).toBe('abandoned');
  });

  it('expire à la fermeture de la semaine, et s\'achève quand les deux ont fini', () => {
    expect(duoTransition({ status: 'invited', action: 'expire', actor: 'inviter' })).toBe('expired');
    expect(duoTransition({ status: 'active', action: 'expire', actor: 'inviter' })).toBe('expired');
    expect(duoTransition({ status: 'active', action: 'complete', actor: 'inviter' })).toBe('completed');
  });

  it('ne rouvre jamais un duo terminé', () => {
    for (const status of ['abandoned', 'expired', 'completed'] as const) {
      for (const action of ['accept', 'abandon', 'expire', 'complete'] as const) {
        expect(duoTransition({ status, action, actor: 'invitee' })).toBeNull();
      }
    }
  });
});
