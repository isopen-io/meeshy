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

/// **Le nom d'une langue, accordé pour la marque de traduction** : « de l'italien » / « en italien », « from Italian »
/// / « in Italian ». La marque du kit reçoit ce nom déjà accordé et ne le recompose jamais (K51). C'est de la
/// grammaire, pas du texte de produit : le nom vient du système (`Locale.localizedString(forLanguageCode:)`).
nonisolated enum TranslationLanguagePhrase {

    enum Role: Sendable {
        /// « Traduit de l'italien ».
        case source
        /// « Original en italien ».
        case original
    }

    static func phrase(code: String, role: Role, locale: Locale = .current) -> String? {
        guard let raw = locale.localizedString(forLanguageCode: code), !raw.isEmpty else { return nil }
        let interface = locale.language.languageCode?.identifier ?? "en"
        switch interface {
        case "fr": return french(raw.lowercased(), role: role)
        case "it": return italian(raw.lowercased(), role: role)
        case "es": return role == .source ? "del \(raw.lowercased())" : "en \(raw.lowercased())"
        case "pt": return role == .source ? "do \(raw.lowercased())" : "em \(raw.lowercased())"
        case "de": return german(raw, role: role)
        case "ar": return role == .source ? "من \(raw)" : "ب\(raw)"
        default: return role == .source ? "from \(raw)" : "in \(raw)"
        }
    }

    private static func french(_ name: String, role: Role) -> String {
        guard role == .source else { return "en \(name)" }
        return startsWithVowel(name) ? "de l'\(name)" : "du \(name)"
    }

    private static func italian(_ name: String, role: Role) -> String {
        guard role == .source else { return "in \(name)" }
        return startsWithVowel(name) ? "dall'\(name)" : "dal \(name)"
    }

    private static func german(_ name: String, role: Role) -> String {
        guard role == .source else { return "auf \(name)" }
        return "aus dem \(name.hasSuffix("isch") ? name + "en" : name)"
    }

    private static func startsWithVowel(_ name: String) -> Bool {
        guard let first = name.folding(options: .diacriticInsensitive, locale: nil).first else { return false }
        return "aeiou".contains(first)
    }
}
