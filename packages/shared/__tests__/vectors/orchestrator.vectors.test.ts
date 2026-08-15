/**
 * Vecteurs inter-plateformes pour `resolveOrchestratorDecision`
 * (`packages/shared/utils/reading-modes.ts`, C-011).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/orchestrator.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — C-023,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Sémantique de l'adaptateur (à reproduire à l'identique côté Swift/Kotlin) ──
 * `input.capabilities` est un objet `ReadingModeCapabilities` factice constant
 * dans les fixtures : la loi ne lit JAMAIS ce champ aujourd'hui (réservé, voir
 * le commentaire de `OrchestratorDecisionInput.capabilities` dans la loi) —
 * sa valeur exacte est donc sans effet sur `expected`, elle n'existe que pour
 * satisfaire la signature du type. `now` / `lastOpenedAt` sont des epoch ms
 * (nombre) ou `null` — jamais de chaîne ISO ici, contrairement aux vecteurs
 * `sections`.
 *
 * Couverture de branche (5 raisons possibles, toutes exercées) :
 *   - `flag-disabled` (drapeau OFF, prioritaire sur tout le reste)
 *   - `sticky` (les 4 valeurs de préférence non-`auto`, dont un cas où le
 *     choix collant l'emporte MÊME avec `unreadCount > 25` ET absence)
 *   - `unread-over-cap` (> 25, plus la borne exacte 25 qui NE déclenche pas)
 *   - `stale-absence` (absence > 24h ET `unreadCount >= 10`, plus les bornes
 *     exactes : 24h pile ne déclenche pas, 9 non-lus ne déclenche pas,
 *     `lastOpenedAt: null` déclenche l'absence au même titre qu'une date lointaine)
 *   - `default` (aucune des branches ci-dessus)
 */
import { resolveOrchestratorDecision, type OrchestratorDecisionInput, type OrchestratorDecision } from '../../utils/reading-modes.js';
import { runVectors } from './harness.js';

runVectors<OrchestratorDecisionInput, OrchestratorDecision>('orchestrator', resolveOrchestratorDecision);
