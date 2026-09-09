/**
 * L'ORDRE DES BLOCS DE « PROGRESSION » (#5838).
 *
 * Ce fichier existe parce que deux clients ont composé le même écran chacun de
 * son côté et ont divergé sans que rien ne rougisse : l'iOS natif rendait
 * Meesh → badges → succès → défis, web-v3 rendait élan → Meesh → niveau →
 * défis → badges → succès. `resolveEngagementProgress` décidait déjà du
 * CONTENU ; personne ne décidait de la COMPOSITION.
 *
 * Un témoin par client, listant ses sections, ne pouvait pas attraper ça : les
 * deux étaient verts, chacun sur son ordre. C'est l'ordre PARTAGÉ qui doit être
 * épinglé, une fois, ici.
 */

import { describe, it, expect } from 'vitest';
import { resolveEngagementProgress } from '../utils/engagement-progress.js';
import type { EngagementProgressPayload } from '../types/engagement.js';
import { lastAchievement, progressionLayout } from '../utils/progression-layout.js';

const VIDE: EngagementProgressPayload = {
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
};

const kinds = (payload: EngagementProgressPayload) =>
  progressionLayout(resolveEngagementProgress(payload)).map((b) => b.kind);

describe('la séquence du hub', () => {
  it('ouvre sur le PROCHAIN SUCCÈS, puis le niveau, puis les élans', () => {
    expect(kinds(VIDE).slice(0, 3)).toEqual(['last-achievement', 'level', 'elans']);
  });

  it('range les entrées de section APRÈS les trois heros, jamais entre eux', () => {
    const suite = kinds(VIDE);
    const premierLien = suite.indexOf('section-link');
    expect(premierLien).toBeGreaterThan(suite.lastIndexOf('elans'));
  });

  it('sert les trois sections dans l\'ordre badges, défis, succès', () => {
    const sections = progressionLayout(resolveEngagementProgress(VIDE))
      .flatMap((b) => (b.kind === 'section-link' ? [b.section] : []));
    expect(sections).toEqual(['badges', 'defis', 'succes']);
  });
});

describe('ce que la séquence REFUSE de faire', () => {
  it('ne sert JAMAIS deux fois le même bloc', () => {
    const suite = kinds(VIDE);
    const liens = progressionLayout(resolveEngagementProgress(VIDE))
      .flatMap((b) => (b.kind === 'section-link' ? [b.section] : []));
    expect(new Set(suite.filter((k) => k !== 'section-link')).size)
      .toBe(suite.filter((k) => k !== 'section-link').length);
    expect(new Set(liens).size).toBe(liens.length);
  });

  it('garde les trois heros sur un compte VIDE — un écran neuf explique, il ne se tait pas', () => {
    expect(kinds(VIDE)).toContain('last-achievement');
    expect(kinds(VIDE)).toContain('level');
    expect(kinds(VIDE)).toContain('elans');
  });
});

/**
 * LE DERNIER SUCCÈS DÉCROCHÉ (#5840).
 *
 * Le hero devait d'abord montrer le PROCHAIN. Impossible : dire « prochain »
 * demande une DISTANCE, et cette distance n'existe nulle part — `AchievementEntry`
 * ne porte qu'un booléen, les compteurs servis sont par AXE quand les défis sont
 * par FAMILLE, sans pont. Le porteur a tranché : ce sera le DERNIER, qui se lit
 * dans ce qui est déjà servi.
 */
describe('le dernier succès décroché', () => {
  const avec = (
    named: readonly { key: string; reachedAt: string | null }[],
    generated: readonly { key: string; reachedAt: string | null }[],
  ) =>
    lastAchievement({
      achievements: named.map((n) => ({ ...n, unlocked: true })),
      achievementSections: [
        {
          section: 'parole',
          entries: generated.map((g) => ({ ...g, unlocked: true })),
          unlockedCount: generated.length,
          attainableCount: generated.length,
        },
      ],
    } as never);

  it('élit le plus RÉCENT, quelle que soit sa provenance', () => {
    const vu = avec(
      [{ key: 'achievement.first_voice', reachedAt: '2026-08-01T00:00:00.000Z' }],
      [{ key: 'achievement.parole.message.send.count:10', reachedAt: '2026-09-01T00:00:00.000Z' }],
    );
    expect(vu).toEqual({
      kind: 'generated',
      key: 'achievement.parole.message.send.count:10',
      reachedAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('laisse gagner un succès NOMMÉ quand c\'est lui le plus récent', () => {
    const vu = avec(
      [{ key: 'achievement.editor', reachedAt: '2026-09-05T00:00:00.000Z' }],
      [{ key: 'achievement.parole.message.send.count:10', reachedAt: '2026-09-01T00:00:00.000Z' }],
    );
    expect(vu?.kind).toBe('named');
    expect(vu?.key).toBe('achievement.editor');
  });

  it('rend `null` quand rien n\'a été décroché — le hero dira quoi viser', () => {
    expect(avec([], [])).toBeNull();
  });

  it('ignore un succès marqué acquis SANS date — il ne peut pas être « le dernier »', () => {
    expect(avec([{ key: 'achievement.editor', reachedAt: null }], [])).toBeNull();
  });

  /**
   * Une date illisible perdrait TOUTE comparaison (`NaN > x` est faux), donc
   * elle ne gagnerait jamais — mais elle gagnerait par DÉFAUT si elle était la
   * seule, et le hero afficherait « décroché le Invalid Date ». Elle est
   * écartée AVANT la comparaison, pas pendant.
   */
  it('écarte une date illisible plutôt que de la laisser gagner par défaut', () => {
    expect(avec([{ key: 'achievement.editor', reachedAt: 'pas-une-date' }], [])).toBeNull();
  });
});
