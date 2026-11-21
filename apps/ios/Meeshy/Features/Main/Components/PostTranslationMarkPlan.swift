import Foundation

/// **Ce que dit la marque de traduction (K51) d'une publication** : sa langue d'origine, et si l'original est servi.
/// `nil` ⇒ l'hôte ne monte pas la marque — l'original est déjà dans la langue du lecteur, ou aucune traduction n'est
/// servie. La bascule passe par la seule langue forcée de l'hôte : l'original, ou rien (le Prisme reprend la main).
nonisolated struct PostTranslationMarkPlan: Equatable, Sendable {
    let originalLanguage: String
    let isShowingOriginal: Bool

    /// - Parameters:
    ///   - prismLanguage: la langue que le Prisme sert sans geste du lecteur.
    ///   - override: la langue forcée par le lecteur (l'original après « Voir l'original »), `nil` sinon.
    ///   - translatedLanguages: les langues dont une traduction est servie.
    static func resolve(originalLanguage: String?, prismLanguage: String?, override: String?,
                        translatedLanguages: Set<String>) -> PostTranslationMarkPlan? {
        guard let original = originalLanguage?.lowercased(), !original.isEmpty,
              let prism = prismLanguage?.lowercased(), prism != original,
              translatedLanguages.contains(where: { $0.lowercased() == prism }) else { return nil }
        let forced = override?.lowercased()
        return PostTranslationMarkPlan(originalLanguage: original, isShowingOriginal: forced == original)
    }

    /// La langue à forcer après la bascule : l'original quand la traduction est servie, rien sinon.
    var toggledOverride: String? {
        isShowingOriginal ? nil : originalLanguage
    }
}
