import SwiftUI
import MeeshySDK
import MeeshyUI

/// #13824, #13864 — « Texte du post » tient dans le plafond du serveur
/// (`ComposerPostTextPolicy`) : tronqué pour que l'auteur le VOIE, avec un
/// compteur à l'approche de la limite (dès 4 000, en alerte à 4 500).
struct ComposerPostTextCap: ViewModifier {
    @Binding var text: String

    func body(content: Content) -> some View {
        content
            .adaptiveOnChange(of: text, initial: true) { _, newValue in
                let capped = ComposerPostTextPolicy.truncate(newValue)
                if capped != newValue { text = capped }
            }
            .overlay(alignment: .bottomTrailing) { counter }
    }

    @ViewBuilder
    private var counter: some View {
        let length = ComposerPostTextPolicy.length(of: text)
        if length >= ComposerPostTextPolicy.counterThreshold {
            CharacterCountLabel(
                count: length,
                limit: ComposerPostTextPolicy.contentLimit,
                warningThreshold: ComposerPostTextPolicy.warningThreshold,
                font: MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium),
                mutedColor: MeeshyColors.textSecondary(isDark: true)
            )
            .padding(.trailing, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.xs)
        }
    }
}
