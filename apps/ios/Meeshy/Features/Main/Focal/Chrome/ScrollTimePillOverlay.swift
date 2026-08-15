import SwiftUI
import MeeshyUI

/// Pilule flottante « jour · heure » du fil — contrat
/// `focal-implementation-contract.md` §WS-2. Vue PURE : reçoit
/// `ScrollTimePillState` déjà piloté par l'hôte, ne lit ni `UIScrollView`
/// ni `Timer` (garde source `ScrollTimePillSourceGuardTests`). Coexiste
/// avec `MessageDayStickyOverlay` (sticker de date, sticky, permanent) sans
/// le modifier — deux composants distincts (contrat §WS-2, spec vol. 4 §3).
///
/// **Cote réparée** (tâche 0, WS-0/F-082-pre — suite à F-081) : le contrat
/// Lentille §4.3 (colonne Fil) fixe `pill.fadeDurationMs = 280` et
/// `pill.top = 72` (`packages/shared/design/lentille-tokens.json` →
/// `thread.pill`). F-081 avait signalé l'absence de miroir Swift
/// (`Focal/Core/FocalMetrics.swift` n'existait pas) et utilisait un fondu
/// système par défaut faute de cette cote. `FocalMetrics.Pill.fadeDuration`
/// existe désormais (miroir `thread.pill.fadeDurationMs`, tâche 0) : le
/// fondu utilise sa durée explicite. L'ancrage `top 72` reste la
/// responsabilité de l'hôte de défilement (WS-6/F-085, qui positionne
/// l'overlay — cette vue ne s'auto-positionne pas), donc `FocalMetrics.Pill.top`
/// n'est pas consommé ici.
struct ScrollTimePillOverlay: View {
    @ObservedObject var state: ScrollTimePillState

    var body: some View {
        Group {
            if state.isVisible, let label = state.label {
                pill(label: label)
                    .transition(.opacity)
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .animation(.easeInOut(duration: FocalMetrics.Pill.fadeDuration), value: state.isVisible)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func pill(label: String) -> some View {
        // Padding sur les tokens d'espacement génériques (`MeeshySpacing`) —
        // pas une cote §4.3 dédiée : `thread.pill` ne fixe que `top`/
        // `fadeDurationMs`/`dismissAfterMs`, aucun padding de capsule
        // (`FocalMetrics.Pill.gap`, tâche 0, comble un gap DIFFÉRENT —
        // absence d'espacement documentée, pas ce padding-ci). Réutiliser
        // les tokens génériques plutôt qu'un littéral reste la lecture la
        // plus honnête de la garde R15 en l'absence de cote dédiée.
        Text(label)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            .foregroundColor(textColor)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Capsule()
                            .strokeBorder(borderColor, lineWidth: 0.5)
                    )
            )
    }

    private var textColor: Color {
        state.isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700
    }

    private var borderColor: Color {
        state.isDark ? MeeshyColors.indigo900 : MeeshyColors.indigo200
    }
}
