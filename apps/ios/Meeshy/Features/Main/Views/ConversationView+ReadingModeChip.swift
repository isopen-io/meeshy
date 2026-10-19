import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'affordance du mode de lecture dans l'en-tête
//
// Extraite de `ConversationView.swift` (cohésion). Le chip porte le mode courant
// (tap = CYCLE des modes disponibles, loi pure `ReadingModeCycle` ; appui long =
// menu natif listant tous les modes) et n'écrit que par le contrôleur GELÉ
// (F-080) : préférence collante, jamais un état local dupliqué.

/// Chip de mode (§WS-7 travaux 3-4, arbitrage F-086bis) — insérée APRÈS le
/// bouton de recherche, JAMAIS avant `headerCallButtons.layoutPriority(1)`
/// (interdiction absolue du contrat). Sous drapeau uniquement :
/// `ReadingModeController` résout TOUJOURS `.bubbles` drapeau OFF (§WS-1), donc
/// ce bloc disparaît intégralement — bit-à-bit identique à avant ce lot.
///
/// P2 (spec Magnificence 17/08) : UN SEUL chip. Le bouton Aa a disparu avec sa
/// bascule de densité : le cycle parcourt TOUS les modes ouverts par les
/// capacités, et le menu remplace la feuille Lentille.
struct ConversationReadingModeAffordance: View {
    @ObservedObject var controller: ReadingModeController
    let capabilities: ReadingModeOrchestrator.ReadingModeCapabilities
    let accentColor: String

    var body: some View {
        // Drapeau OFF ⇒ la loi ne rend que `.bubbles` : pas de chip. Drapeau
        // ON ⇒ chip TOUJOURS, y compris en Bulles (c'est depuis lui qu'on en
        // sort — 2026-08-21, Bulles est l'un des trois rendus du fil).
        if capabilities.availableModes.contains(where: { $0 != .bubbles }) {
            ReadingModeChip(
                model: chipModel,
                menuRows: ReadingModeLensCatalog.rows(
                    capabilities: capabilities,
                    currentMode: controller.mode
                ),
                onCycle: {
                    HapticFeedback.light()
                    guard let next = ReadingModeCycle.next(
                        after: controller.mode,
                        availableInOrder: ReadingModeLensCatalog.cycleOrder.filter {
                            $0 == .bubbles || capabilities.availableModes.contains($0)
                        }
                    ) else { return }
                    controller.select(next)
                },
                onSelect: { controller.select($0) },
                onAuto: { controller.resetToAuto() }
            )
        }
    }

    /// Modèle pur du chip — `isAuto` distingue une décision de
    /// l'orchestrateur (§WS-1 `OrchestratorDecisionReason` ∉ {`.sticky`,
    /// `.flagDisabled`}) d'un choix manuel figé (préférence collante).
    private var chipModel: ReadingModeChipModel {
        ReadingModeChipModel(
            label: ReadingModeLensCatalog.title(for: controller.mode),
            accentHex: accentColor,
            isAuto: controller.decision.reason != .sticky
                && controller.decision.reason != .flagDisabled
        )
    }
}
