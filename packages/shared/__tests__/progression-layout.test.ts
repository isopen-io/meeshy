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
import { progressionLayout } from '../utils/progression-layout.js';

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
    expect(kinds(VIDE).slice(0, 3)).toEqual(['next-achievement', 'level', 'elans']);
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
    expect(kinds(VIDE)).toContain('next-achievement');
    expect(kinds(VIDE)).toContain('level');
    expect(kinds(VIDE)).toContain('elans');
  });
});
