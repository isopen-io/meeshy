import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **Sous le texte d'une publication ouverte** : la marque de traduction du kit (K51, planche `Autre-Publications`)
/// — « Traduit de l'italien · Voir l'original », et retour —, puis la traduction secondaire choisie par un drapeau.
/// La marque bascule la seule langue forcée du détail ; le Prisme reprend la main quand le lecteur revient à la
/// traduction. Sans traduction servie, elle n'est pas montée.
struct PostDetailTranslationLines: View {
    let post: FeedPost
    let tint: Color
    @Binding var override: String?
    @Binding var secondaryCode: String?
    let secondaryContent: String?

    private var plan: PostTranslationMarkPlan? {
        PostTranslationMarkPlan.resolve(
            originalLanguage: post.originalLanguage,
            prismLanguage: PostDisplayLanguage.code(originalLanguage: post.originalLanguage,
                                                    translations: post.translations,
                                                    prism: ReaderPrism.resolve(for: AuthManager.shared.currentUser)),
            override: override,
            translatedLanguages: Set((post.translations ?? [:]).keys.map { $0.lowercased() })
        )
    }

    var body: some View {
        if let plan {
            MeeshyTranslationMark(
                sourceLanguageName: TranslationLanguagePhrase.phrase(code: plan.originalLanguage, role: .source),
                originalLanguageName: TranslationLanguagePhrase.phrase(code: plan.originalLanguage, role: .original),
                isShowingOriginal: plan.isShowingOriginal,
                onToggle: { toggle(plan) },
                tint: tint
            )
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.xs)
            .accessibilityIdentifier("post.detail.translationMark")
        }
        if let content = secondaryContent, let code = secondaryCode {
            PostDetailSecondaryTranslationPanel(content: content, code: code)
        }
    }

    private func toggle(_ plan: PostTranslationMarkPlan) {
        meeshyWithAnimation(MeeshyAnimation.springFast, reduced: MeeshyMotion.reducedFade,
                            reduceMotion: UIAccessibility.isReduceMotionEnabled) {
            override = plan.toggledOverride
            secondaryCode = nil
        }
    }
}
