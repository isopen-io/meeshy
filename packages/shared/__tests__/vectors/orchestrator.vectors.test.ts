/**
 * Vecteurs inter-plateformes pour `resolveOrchestratorDecision`
 * (`packages/shared/utils/reading-modes.ts`, C-011).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/orchestrator.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — C-023,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Sémantique de l'adaptateur (à reproduire à l'identique côté Swift/Kotlin) ──
 * `input.capabilities` est un `ReadingModeCapabilities` complet, et il est
 * LU par la loi depuis REV-1 (blocage 3) : le catalogue borne la décision.
 * Les cas `*-invite-*` portent donc un catalogue amputé (`focal` + `script`)
 * et les cas Rivière un catalogue étendu — leur valeur n'est plus décorative.
 * `now` / `lastOpenedAt` sont des epoch ms (nombre) ou `null` — jamais de
 * chaîne ISO ici, contrairement aux vecteurs `sections`.
 *
 * Couverture de branche (6 raisons possibles, toutes exercées) :
 *   - `flag-disabled` (drapeau OFF, prioritaire sur tout le reste, JAMAIS clampé)
 *   - `sticky` (les 4 valeurs de préférence non-`auto`, dont un cas où le
 *     choix collant l'emporte MÊME avec `unreadCount > 25` ET absence)
 *   - `unread-over-cap` (> 25, plus la borne exacte 25 qui NE déclenche pas)
 *   - `stale-absence` (absence > 24h ET `unreadCount >= 10`, plus les bornes
 *     exactes : 24h pile ne déclenche pas, 9 non-lus ne déclenche pas,
 *     `lastOpenedAt: null` déclenche l'absence au même titre qu'une date lointaine)
 *   - `clamped-unavailable` (mode naturel hors catalogue : invité à 26 non-lus,
 *     choix collant `riviere` sans Rivière au catalogue)
 *   - `default` (aucune des branches ci-dessus)
 *
 * ── Second champ attendu : `expectedBridgeSuggestedMode` ──
 * Chaque cas porte, à côté de `expected`, l'image de la décision par
 * `toBridgeSuggestedMode` (REV-1, blocage 2). Il vit hors de `expected`
 * plutôt que dedans parce que `expected` EST la valeur de retour de la loi,
 * comparée telle quelle par le harnais : y glisser un champ de plus ferait
 * échouer la comparaison profonde clé à clé de `closeEnough`.
 */
import {
  resolveOrchestratorDecision,
  toBridgeSuggestedMode,
  type OrchestratorDecisionInput,
  type OrchestratorDecision,
} from '../../utils/reading-modes.js';
import { describe, it, expect } from 'vitest';
import { loadVectors, runVectors } from './harness.js';

runVectors<OrchestratorDecisionInput, OrchestratorDecision>('orchestrator', resolveOrchestratorDecision);

type BridgeProjectionVector = {
  readonly input: OrchestratorDecisionInput;
  readonly expected: OrchestratorDecision;
  readonly expectedBridgeSuggestedMode?: 'focal' | 'resume';
};

const projectionVectors = loadVectors<
  OrchestratorDecisionInput,
  OrchestratorDecision
>('orchestrator') as ReadonlyArray<BridgeProjectionVector>;

describe('vectors: orchestrator → toBridgeSuggestedMode', () => {
  projectionVectors.forEach((vector, index) => {
    it(`case ${index}`, () => {
      expect(vector.expectedBridgeSuggestedMode).toBeDefined();
      expect(toBridgeSuggestedMode(resolveOrchestratorDecision(vector.input))).toBe(
        vector.expectedBridgeSuggestedMode,
      );
    });
  });
});
