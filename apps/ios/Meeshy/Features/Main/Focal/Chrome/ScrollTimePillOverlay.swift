import SwiftUI
import MeeshyUI

/// Pilule flottante « jour · heure » du fil — contrat
/// `focal-implementation-contract.md` §WS-2. Vue PURE : reçoit
/// `ScrollTimePillState` déjà piloté par l'hôte, ne lit ni `UIScrollView`
/// ni `Timer` (garde source `ScrollTimePillSourceGuardTests`). Coexiste
/// avec `MessageDayStickyOverlay` (sticker de date, sticky, permanent) sans
/// le modifier — deux composants distincts (contrat §WS-2, spec vol. 4 §3).
///
/// **Cote manquante, signalée plutôt qu'écrite en dur** (F-081, RE-PREUVE) :
/// le contrat Lentille §4.3 (colonne Fil) fixe `pill.fadeDurationMs = 280`
/// et `pill.top = 72` (`packages/shared/design/lentille-tokens.json` →
/// `thread.pill`). Son miroir Swift attendu, `FocalMetrics`
/// (`Focal/Core/FocalMetrics.swift`, propriété WS-0), N'EXISTE PAS dans le
/// Core gelé — seul `LentilleMetrics.Pill` existe, et il mirrorise
/// EXPLICITEMENT la colonne Liste (`top: 64, fadeDurationMs: 250`), pas Fil.
/// Cette vue n'écrit donc PAS `280`/`72` en dur (garde R15/§4.3 du mandat de
/// cette tâche) : le fondu utilise `.easeInOut` SANS durée explicite
/// (valeur système), et l'ancrage `top 72` reste la responsabilité de
/// l'hôte de défilement (WS-6/F-085, qui positionne l'overlay — cette vue
/// ne s'auto-positionne pas). À corriger dès que `FocalMetrics.Pill`
/// atterrit : remplacer `.easeInOut` par
/// `.easeInOut(duration: FocalMetrics.Pill.fadeDuration)`.
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
        .animation(.easeInOut, value: state.isVisible)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func pill(label: String) -> some View {
        // Padding sur les tokens d'espacement génériques (`MeeshySpacing`) —
        // pas une cote §4.3 dédiée : la colonne Fil du contrat ne fixe pas
        // de padding pour `thread.pill` (seuls `top`/`fadeDurationMs`
        // existent dans `lentille-tokens.json`, et sans miroir `FocalMetrics`
        // — cf. commentaire de tête). Réutiliser les tokens plutôt qu'un
        // littéral reste la lecture la plus honnête de la garde R15 en
        // l'absence de cote dédiée.
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
