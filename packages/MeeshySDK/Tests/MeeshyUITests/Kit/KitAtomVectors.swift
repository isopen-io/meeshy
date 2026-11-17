import Foundation
import Testing

/// Les vecteurs de parité des atomes du kit (`docs/product/kit/K<nn>-<Nom>.vectors.json`),
/// lus par les trois plateformes : une seule source de valeurs.
enum KitAtomVectors {

    static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    static func load(_ file: String) throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/\(file).vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    static func rows(_ file: String, _ key: String) throws -> [[String: Any]] {
        try #require(try load(file)[key] as? [[String: Any]])
    }

    /// Le code d'un fichier du kit, commentaires de ligne retirés : les gardes de
    /// source lisent ce que le composant FAIT, pas ce que sa doc dit.
    static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// La table d'une langue du catalogue du SDK.
    static func lproj(_ code: String, bundle: Bundle) throws -> Bundle {
        let language = Locale(identifier: code).language.languageCode?.identifier ?? code
        let path = try #require(bundle.path(forResource: language, ofType: "lproj"), "\(language).lproj absent")
        return try #require(Bundle(path: path))
    }
}
