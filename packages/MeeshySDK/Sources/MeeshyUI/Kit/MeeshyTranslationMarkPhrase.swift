import Foundation

/// **Le nom d'une langue, accordé pour la marque de traduction** : « de l'italien » / « en italien », « from Italian »
/// / « in Italian ». La marque du kit reçoit ce nom déjà accordé et ne le recompose jamais (K51). C'est de la
/// grammaire, pas du texte de produit : le nom vient du système (`Locale.localizedString(forLanguageCode:)`). Vit dans le kit,
/// à côté de la marque, pour que l'app et le SDK (le mot d'une demande reçue, #19460) l'accordent par UNE source.
public nonisolated enum TranslationLanguagePhrase {

    public nonisolated enum Role: Sendable {
        /// « Traduit de l'italien ».
        case source
        /// « Original en italien ».
        case original
    }

    public static func phrase(code: String, role: Role, locale: Locale = .current) -> String? {
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
