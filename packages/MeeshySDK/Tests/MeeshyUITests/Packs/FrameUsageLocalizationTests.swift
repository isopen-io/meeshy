import Foundation
import Testing
import MeeshySDK

/// Les libellés d'usage des cadres (#10146) sont dans le catalogue MeeshyUI,
/// dans les sept langues de l'interface, l'anglais TRADUIT (jamais le français
/// recopié), et chaque traduction garde les paramètres de la source.
@Suite("Cadres — les libellés d'usage dans les sept langues")
struct FrameUsageLocalizationTests {

    private static let locales = ["fr", "en", "es", "pt-BR", "de", "it", "ar"]

    /// `packages/MeeshySDK/Tests/MeeshyUITests/Packs/…` : **4** composants à retirer (le fichier, puis `Packs`, `MeeshyUITests`, `Tests`) pour atteindre `packages/MeeshySDK/`.
    private static var catalogURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("Sources/MeeshyUI/Resources/Localizable.xcstrings")
    }

    private static func values(for key: String) throws -> [String: String] {
        let root = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: catalogURL)) as? [String: Any])
        let strings = try #require(root["strings"] as? [String: Any])
        let entry = try #require(strings[key] as? [String: Any], "clé absente : \(key)")
        let localizations = try #require(entry["localizations"] as? [String: [String: Any]])
        return localizations.compactMapValues { ($0["stringUnit"] as? [String: Any])?["value"] as? String }
    }

    private static func placeholders(_ value: String) -> Int {
        value.components(separatedBy: "%").count - 1
    }

    @Test("chaque clé d'usage est traduite dans les sept langues", arguments: FrameUsageLaw.LabelKey.all)
    func keyIsTranslated(key: String) throws {
        let values = try Self.values(for: key)
        let french = try #require(values["fr"])
        for locale in Self.locales {
            let value = try #require(values[locale], "\(key) sans \(locale)")
            #expect(!value.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) vide en \(locale)")
            #expect(Self.placeholders(value) == Self.placeholders(french), "\(key) perd un paramètre en \(locale)")
        }
        #expect(values["en"] != french, "\(key) : l'anglais recopie le français")
    }

    /// `describeFrameUsage` rend `avatarOnly` pour un contour d'avatar (#10632) : l'étagère
    /// des cadres l'affiche, donc la clé hors de `all` doit aussi parler les sept langues.
    @Test("le libellé d'un contour d'avatar est traduit dans les sept langues")
    func avatarKeyIsTranslated() throws {
        try keyIsTranslated(key: FrameUsageLaw.LabelKey.avatarOnly)
    }
}
