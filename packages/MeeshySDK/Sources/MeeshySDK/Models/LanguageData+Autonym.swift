import Foundation

public extension LanguageData {
    /// Le nom d'une langue ÉCRIT DANS CETTE LANGUE (« 한국어 », « العربية ») —
    /// une liste de langues parlées se lit ainsi pour tout le monde, quelle que
    /// soit la langue de l'interface. Catalogue d'abord, `Locale` ensuite pour
    /// un code que le catalogue ignore, le code en capitales en dernier.
    static func autonym(for code: String) -> String {
        let lowered = code.lowercased()
        if let info = info(for: lowered) { return info.nativeName }
        let base = lowered.split(separator: "-").first.map(String.init) ?? lowered
        if let info = info(for: base) { return info.nativeName }
        let locale = Locale(identifier: base)
        if let name = locale.localizedString(forLanguageCode: base), !name.isEmpty {
            return name.capitalized(with: locale)
        }
        return code.uppercased()
    }

    /// La couleur d'une langue (hex), neutre pour un code inconnu.
    static func colorHex(for code: String) -> String {
        let lowered = code.lowercased()
        let base = lowered.split(separator: "-").first.map(String.init) ?? lowered
        return info(for: lowered)?.colorHex ?? info(for: base)?.colorHex ?? "A3A3C2"
    }
}
