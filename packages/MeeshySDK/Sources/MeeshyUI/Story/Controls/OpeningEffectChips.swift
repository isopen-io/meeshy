import SwiftUI
import MeeshySDK

/// Rangée de chips de sélection de l'animation d'OUVERTURE du slide courant
/// (`effects.opening`, rendue par `StoryRenderer.applyOpening` au passage
/// edit→play et par l'export AVCompositor).
///
/// Partagée entre la sheet ⋯ Transitions (C7) et le panneau Fond du band
/// (C1 — accès gestuel : FAB Fond → band → chips ; swipe-down pour fermer).
/// Une seule UI, une seule source de vérité : `viewModel.openingEffect` —
/// la persistance passe par la chaîne `granularCanvasSync` (pas de callback
/// de sync à câbler par surface).
struct OpeningEffectChips: View {
    let selection: StoryTransitionEffect?
    let onSelect: (StoryTransitionEffect?) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(nil)
                ForEach(StoryTransitionEffect.allCases, id: \.self) { effect in
                    chip(effect)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func chip(_ effect: StoryTransitionEffect?) -> some View {
        let isSelected = selection == effect
        let title = effect?.label ?? String(
            localized: "story.composer.openingNone",
            defaultValue: "Aucune",
            bundle: .module
        )
        return Button {
            onSelect(effect)
            HapticFeedback.light()
        } label: {
            Text(title)
                .font(.system(size: 13, weight: isSelected ? .bold : .medium))
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    Capsule().fill(
                        isSelected
                        ? MeeshyColors.brandPrimary.opacity(0.85)
                        : Color.white.opacity(0.10)
                    )
                )
                .overlay(
                    Capsule().strokeBorder(
                        Color.white.opacity(isSelected ? 0.35 : 0.12),
                        lineWidth: 1
                    )
                )
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
