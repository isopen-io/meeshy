import Foundation
import MeeshySDK

/// La loi du Prisme appliquée à UN message, sans l'état du modèle de vue.
enum PrismTranslationLaw {

    /// Règle 3 : la langue d'origine concourt à son RANG. La première langue du lecteur servie
    /// gagne, par une traduction ou parce que le message est déjà écrit dedans (`nil` : l'original).
    /// Aucune traduction servie ⇒ `nil`, jamais `translations.first`.
    static func prismTranslation(
        in translations: [MessageTranslation], originalLanguage: String?, preferredLanguages: [String]
    ) -> MessageTranslation? {
        PrismTranslationResolver.resolveElement(
            originalLanguage: originalLanguage,
            elements: translations,
            languageOf: { $0.targetLanguage },
            isServable: { !$0.translatedContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
            preferredLanguages: preferredLanguages
        )
    }

    /// Langue SOURCE déclarée par les traductions d'un message — repli quand le message n'est
    /// pas dans la fenêtre. « auto » n'est pas une langue.
    static func translatedFromLanguage(of translations: [MessageTranslation]) -> String? {
        translations.lazy
            .map { $0.sourceLanguage.lowercased() }
            .first { !$0.isEmpty && $0 != "auto" }
    }

    /// Les messages présents des deux côtés dont la langue d'origine a changé : leur résolution
    /// mise en cache a été calculée sur une origine périmée (#9191).
    nonisolated static func messageIdsWhoseOriginChanged(from previous: [Message], to current: [Message]) -> [String] {
        let before = Dictionary(
            previous.map { ($0.id, $0.originalLanguage.lowercased()) },
            uniquingKeysWith: { first, _ in first }
        )
        return current.compactMap { message in
            guard let origin = before[message.id], origin != message.originalLanguage.lowercased() else { return nil }
            return message.id
        }
    }

    /// La langue DOMINANTE d'un lot et ses exceptions — la forme qu'attend `mark-read`. À égalité,
    /// le code alphabétiquement premier : deux exécutions sur les mêmes données donnent le même corps.
    static func dominantSplit(_ resolved: [String: String]) -> (language: String?, exceptions: [String: String]) {
        let counts = resolved.values.reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }
        guard let dominant = counts
            .sorted(by: { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key })
            .first?.key
        else { return (nil, [:]) }
        return (dominant, resolved.filter { $0.value != dominant })
    }
}
