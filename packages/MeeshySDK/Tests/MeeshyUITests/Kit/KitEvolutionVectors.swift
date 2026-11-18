import Foundation
import Testing

/// Les vecteurs de parité du kit (`docs/product/kit/K<nn>-*.vectors.json`) et le code
/// source des composants, lus par les témoins des évolutions que demande le profil.
enum KitEvolutionVectors {

    static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    static func json(_ file: String) throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/\(file)")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    static func rows(_ file: String, _ key: String) throws -> [[String: Any]] {
        try #require(try json(file)[key] as? [[String: Any]])
    }

    static func object(_ file: String, _ key: String) throws -> [String: Any] {
        try #require(try json(file)[key] as? [String: Any])
    }

    /// Le code d'un fichier du kit, commentaires de ligne retirés.
    static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
