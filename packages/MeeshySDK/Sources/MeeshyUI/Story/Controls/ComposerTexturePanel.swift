import SwiftUI
import MeeshySDK

struct ComposerTexturePanel: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let mutedText: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.md) {
                    ForEach(StoryBackgroundPalette.colors, id: \.self) { hex in
                        let isSelected = viewModel.backgroundColor == "#\(hex)"
                        Button {
                            viewModel.backgroundColor = "#\(hex)"
                            viewModel.hasBackgroundImage = false
                            HapticFeedback.light()
                        } label: {
                            Circle().fill(Color(hex: hex))
                                .frame(width: 44, height: 44)
                                .overlay(
                                    Circle().stroke(Color.white, lineWidth: isSelected ? 3 : 0)
                                        .padding(MeeshySpacing.xxs)
                                )
                                .shadow(color: Color(hex: hex).opacity(isSelected ? 0.5 : 0), radius: 6)
                        }
                        .accessibilityLabel(String(localized: "story.background.swatch", defaultValue: "Couleur de fond", bundle: .module))
                        .accessibilityValue("#\(hex)")
                        .accessibilityHint(String(localized: "story.background.swatch.hint", defaultValue: "Touchez pour appliquer ce fond.", bundle: .module))
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                    }
                    // C11 — la palette de dégradés (définie depuis l'origine
                    // mais jamais offerte) rejoint la rangée : même format de
                    // pastille, valeur sérialisée « gradient:HEX1:HEX2 »
                    // (StoryBackgroundValue, rendue par les 3 renderers).
                    ForEach(Array(StoryBackgroundPalette.gradients.enumerated()), id: \.offset) { _, pair in
                        let serialized = StoryBackgroundValue.gradient(pair.0, pair.1).serialized
                        let isSelected = viewModel.backgroundColor == serialized
                        Button {
                            viewModel.backgroundColor = serialized
                            viewModel.hasBackgroundImage = false
                            HapticFeedback.light()
                        } label: {
                            Circle()
                                .fill(LinearGradient(
                                    colors: [Color(hex: pair.0), Color(hex: pair.1)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                                .frame(width: 44, height: 44)
                                .overlay(
                                    Circle().stroke(Color.white, lineWidth: isSelected ? 3 : 0)
                                        .padding(MeeshySpacing.xxs)
                                )
                                .shadow(color: Color(hex: pair.0).opacity(isSelected ? 0.5 : 0), radius: 6)
                        }
                        .accessibilityLabel(String(localized: "story.background.gradient",
                                                   defaultValue: "Fond dégradé", bundle: .module))
                        .accessibilityValue("\(pair.0) → \(pair.1)")
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                    }
                }
                .padding(.horizontal, MeeshySpacing.xxs)
                .padding(.vertical, MeeshySpacing.mdPlus)
            }

            // C1 — l'animation d'ouverture du slide devient accessible par
            // GESTE (FAB Fond → band → chips ; swipe-down pour fermer), plus
            // seulement via le menu ⋯ → sheet Transitions. Même source de
            // vérité (viewModel.openingEffect) et même persistance
            // (granularCanvasSync) que la sheet — cf. OpeningEffectChips.
            Text(String(
                localized: "story.composer.openingTitle",
                defaultValue: "Ouverture du slide",
                bundle: .module
            ))
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(mutedText)
            .padding(.horizontal, MeeshySpacing.xxs)
            .padding(.bottom, MeeshySpacing.sm)

            OpeningEffectChips(selection: viewModel.openingEffect) { effect in
                viewModel.openingEffect = effect
            }
        }
    }
}
