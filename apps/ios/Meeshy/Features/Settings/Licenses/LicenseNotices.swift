import Foundation

/// Un avis de licence affichable : un titre (les composants qu'il couvre) et le
/// texte intégral de leur licence.
nonisolated struct LicenseNotice: Identifiable, Equatable, Sendable {
    let title: String
    let license: String?
    let text: String

    var id: String { title }
}

/// Les textes de licence que l'app EMBARQUE — jamais téléchargés : un écran de
/// licences doit s'afficher hors ligne, et l'AGPL-3.0 exige que le texte
/// accompagne le binaire.
///
/// - `AGPL-3.0.txt` est `LICENSES/AGPL-3.0.txt`, copié dans le bundle par
///   `project.yml` (phase Ressources), texte officiel de la FSF.
/// - `acknowledgments-ios.plist` est celui de `packages/LibSignalClient`, publié
///   par Signal pour le tag épinglé : libsignal et chacune de ses dépendances.
nonisolated enum LicenseNotices {
    static let agplResource = ("AGPL-3.0", "txt")
    static let libsignalResource = ("acknowledgments-ios", "plist")

    static func agplText(in bundle: Bundle = .main) -> String? {
        guard let url = bundle.url(forResource: agplResource.0, withExtension: agplResource.1) else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    static func libsignal(in bundle: Bundle = .main) -> [LicenseNotice] {
        guard let url = bundle.url(forResource: libsignalResource.0, withExtension: libsignalResource.1),
              let data = try? Data(contentsOf: url) else { return [] }
        return parseAcknowledgments(data)
    }

    /// Lit le format « Settings bundle » que Signal publie : chaque
    /// `PSGroupSpecifier` porte un titre et, en pied, le texte de sa licence.
    /// L'entrée d'en-tête (sans clé `License`) n'est pas un avis.
    static func parseAcknowledgments(_ data: Data) -> [LicenseNotice] {
        guard let root = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let specifiers = root["PreferenceSpecifiers"] as? [[String: Any]] else { return [] }
        return specifiers.compactMap { specifier in
            guard let title = specifier["Title"] as? String,
                  let license = specifier["License"] as? String,
                  let text = specifier["FooterText"] as? String,
                  !text.isEmpty else { return nil }
            return LicenseNotice(title: title, license: license, text: text)
        }
    }
}
