/**
 * Vecteurs inter-plateformes pour `resolveCapabilities`
 * (`packages/shared/utils/reading-modes.ts`, C-012).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/capabilities.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — C-023,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Pourquoi ce fichier n'existait pas avant (RE-PREUVE, REV-3/B3) ──
 * `resolveCapabilities` était la SEULE des lois de `reading-modes.ts` sans
 * fichier de vecteurs : `fixtures/reading-modes/` porte `accent`,
 * `assist-tier`, `bridge`, `focus-curve`, `orchestrator`, `scroll-activity`,
 * `sections`, `sort` — et rien pour les capacités. Le mot `resolveCapabilities`
 * n'apparaissait que dans `utils/reading-modes.ts` et
 * `__tests__/reading-modes.test.ts` (assertions unitaires TS, sans miroir
 * plateforme). `orchestrator.vectors.json` ne porte des capacités que comme
 * ENTRÉE figée de `resolveOrchestratorDecision` — jamais comme sortie de cette
 * loi-ci. L'amendement S1 (raison Rivière trifurquée + compte faillible) devait
 * donc se prouver des DEUX côtés : ce fichier est le domicile qui manquait, et
 * `OrchestratorVectorTests` (iOS) rejoue les mêmes cas depuis le même JSON.
 *
 * ── Couverture de l'amendement S1 (REV-3/B3) ──
 *   - `neverEligible` : conversation `direct`, y compris avec un compte ÉLEVÉ
 *     (99) — le compte ne renverse jamais cette branche — et avec un compte
 *     inconnu.
 *   - `belowThreshold` + `current: null` : compte INCONNU sur un type éligible
 *     — la raison ne porte AUCUN nombre courant (« 0 aujourd'hui » fabriqué
 *     interdit).
 *   - `belowThreshold` + `current: number` : nominal, INCHANGÉ.
 *   - `eligible` : borne exacte (5) et au-delà, invité compris (la Rivière est
 *     accordée aux invités éligibles), drapeau `riviere_mode` ON et OFF.
 */
import {
  resolveCapabilities,
  type ResolveCapabilitiesInput,
  type ReadingModeCapabilities,
} from '../../utils/reading-modes.js';
import { describe, it, expect } from 'vitest';
import { loadVectors, runVectors } from './harness.js';

runVectors<ResolveCapabilitiesInput, ReadingModeCapabilities>('capabilities', resolveCapabilities);

const vectors = loadVectors<ResolveCapabilitiesInput, ReadingModeCapabilities>('capabilities');

/**
 * Le jeu de vecteurs doit EXERCER les trois raisons. Sans ce témoin, un
 * fichier amputé de ses cas `direct` ou de ses cas à compte inconnu passerait
 * au vert en ne prouvant plus rien de l'amendement (leçon 257 : un vert
 * silencieux est un faux vert).
 */
describe('vectors: capabilities — couverture de l’amendement S1', () => {
  it('les trois raisons Rivière sont toutes exercées', () => {
    const reasons = new Set(vectors.map((vector) => vector.expected.riverEligibilityReason.riverReason));
    expect(reasons).toEqual(new Set(['neverEligible', 'belowThreshold', 'eligible']));
  });

  it('au moins un cas porte un compte INCONNU, et sa raison ne porte aucun nombre courant', () => {
    const unknownCount = vectors.filter((vector) => vector.input.activeParticipantCount === null);
    expect(unknownCount.length).toBeGreaterThan(0);
    unknownCount.forEach((vector) => {
      expect(vector.expected.riverEligibilityReason.current).toBeNull();
      expect(vector.expected.riverEligible).toBe(false);
    });
  });

  it("une conversation `direct` est `neverEligible` même avec un compte au-dessus du seuil", () => {
    const directHighCount = vectors.filter(
      (vector) =>
        vector.input.conversationType === 'direct' &&
        typeof vector.input.activeParticipantCount === 'number' &&
        vector.input.activeParticipantCount >= 5,
    );
    expect(directHighCount.length).toBeGreaterThan(0);
    directHighCount.forEach((vector) => {
      expect(vector.expected.riverEligibilityReason.riverReason).toBe('neverEligible');
      expect(vector.expected.riverEligible).toBe(false);
    });
  });
});
