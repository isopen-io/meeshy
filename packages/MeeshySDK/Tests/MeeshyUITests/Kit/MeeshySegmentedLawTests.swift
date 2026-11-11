import Testing
import Foundation
@testable import MeeshyUI

/// K03 — le choix segmenté, lu comme des VALEURS : la loi pure (rendu, courant,
/// clavier, changement, répartition) est vérifiée contre les vecteurs partagés
/// avec le web et Android, jamais contre un rendu.
@Suite("MeeshySegmentedLaw")
struct MeeshySegmentedLawTests {

    @Test("deux à quatre options sont rendues, une ou cinq ne le sont pas")
    func renderable_onlyTwoToFour() throws {
        for vector in try Self.vectors("renderable") {
            let count = try #require(vector["count"] as? Int)
            let expected = try #require(vector["expected"] as? Bool)
            #expect(MeeshySegmentedLaw.isRenderable(count: count) == expected, "count=\(count)")
        }
    }

    @Test("toucher le courant ne change rien, toucher un autre change")
    func changes_vectors() throws {
        for vector in try Self.vectors("changes") {
            let current = vector["current"] as? Int
            let target = try #require(vector["target"] as? Int)
            let expected = try #require(vector["expected"] as? Bool)
            #expect(MeeshySegmentedLaw.changes(from: current, to: target) == expected)
        }
    }

    @Test("le clavier suit le sens logique, inversé en RTL, en boucle pour les flèches")
    func keyboard_vectors() throws {
        for vector in try Self.vectors("keyboard") {
            let key = try #require(vector["key"] as? String)
            let index = try #require(vector["index"] as? Int)
            let count = try #require(vector["count"] as? Int)
            let rtl = try #require(vector["rtl"] as? Bool)
            let expected = vector["expected"] as? Int
            #expect(MeeshySegmentedLaw.keyboardTarget(key: key, index: index, count: count, rtl: rtl) == expected)
        }
    }

    @Test("la répartition suit les vecteurs : parts égales, plancher au texte, repli en rangées")
    func partition_vectors() throws {
        for vector in try Self.vectors("partition") {
            let widths = try #require(vector["widths"] as? [Double])
            let available = try #require(vector["available"] as? Double)
            let expected = try #require(vector["rows"] as? [[Double]])
            let rows = MeeshySegmentedLaw.partition(widths: widths, available: available)
            #expect(rows.map { $0.map { ($0 * 100).rounded() / 100 } } == expected)
        }
    }

    @Test("la sélection absente des options n'a aucun courant")
    func currentIndex_absentSelection_isNil() {
        #expect(MeeshySegmentedLaw.currentIndex(selection: "x", in: ["a", "b"]) == nil)
        #expect(MeeshySegmentedLaw.currentIndex(selection: "b", in: ["a", "b"]) == 1)
    }

    static func vectors(_ key: String) throws -> [[String: Any]] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K03-MeeshySegmented.vectors.json")
        let data = try Data(contentsOf: url)
        let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try #require(root[key] as? [[String: Any]])
    }

    static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }
}
