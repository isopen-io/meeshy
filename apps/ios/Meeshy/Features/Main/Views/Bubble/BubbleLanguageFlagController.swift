import Foundation

/// Logique pure de gestion du tap sur un drapeau de langue.
/// Was: ThemedMessageBubble.handleFlagTap(_:) (ex line 806-827).
///
/// Le controleur ne touche pas au state @State du bubble; il calcule
/// uniquement la transition (Outcome) que la vue doit appliquer
/// avec son propre `withAnimation`.
enum BubbleLanguageFlagController {
    struct Context {
        var activeDisplayLangCode: String?
        var secondaryLangCode: String?
    }

    enum Action: Equatable {
        case switchPrimary
        case openSecondary
        case closeSecondary
        case requestTranslation(targetLang: String)
    }

    struct Outcome {
        var activeDisplayLangCode: String?
        var secondaryLangCode: String?
        var action: Action
    }

    /// Calcule la prochaine `Outcome` selon le code tape et le contexte courant.
    ///
    /// - Parameters:
    ///   - code: Le code de la langue tapee (drapeau).
    ///   - current: Le contexte d'affichage courant (langues active + secondaire).
    ///   - messageOriginalLang: La langue originale du message.
    ///   - translations: Les traductions textuelles disponibles pour ce message.
    /// - Returns: L'`Outcome` decrivant le nouvel etat et l'action a executer.
    static func handleTap(
        code: String,
        current: Context,
        messageOriginalLang: String,
        translations: [MessageTranslation]
    ) -> Outcome {
        let lower = code.lowercased()
        let isOriginal = lower == messageOriginalLang.lowercased()
        let hasContent = isOriginal
            || translations.contains(where: { $0.targetLanguage.lowercased() == lower })

        if !hasContent {
            return Outcome(
                activeDisplayLangCode: current.activeDisplayLangCode,
                secondaryLangCode: current.secondaryLangCode,
                action: .requestTranslation(targetLang: code)
            )
        }

        if isOriginal {
            return Outcome(
                activeDisplayLangCode: code,
                secondaryLangCode: nil,
                action: .switchPrimary
            )
        }

        let isShowing = current.secondaryLangCode?.lowercased() == lower
        return Outcome(
            activeDisplayLangCode: current.activeDisplayLangCode,
            secondaryLangCode: isShowing ? nil : code,
            action: isShowing ? .closeSecondary : .openSecondary
        )
    }
}
