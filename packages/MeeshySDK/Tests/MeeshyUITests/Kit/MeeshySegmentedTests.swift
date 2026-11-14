import Testing
import Foundation
@testable import MeeshyUI

/// K03 — le choix segmenté, lu comme des VALEURS : la loi pure (rendu, courant,
/// clavier, changement, répartition) est vérifiée contre les vecteurs partagés
/// avec le web et Android, jamais contre un rendu.
@Suite("MeeshySegmented")
struct MeeshySegmentedTests {

    @Test("deux à quatre options sont rendues, une ou cinq ne le sont pas")
    func renderable_onlyTwoToFour() throws {
        for vector in try Self.vectors("renderable") {
            let count = try #require(vector["count"] as? Int)
            let expected = try #require(vector["expected"] as? Bool)
            #expect(MeeshySegmentedLaw.isRenderable(count: count) == expected, "count=\(count)")
        }
    }

    @Test("2, 3 et 4 options sont rendues dans leur ordre ; moins de deux ou plus de quatre : rien")
    func rendered_keepsOrder_orNothing() {
        #expect(MeeshySegmentedLaw.rendered(["a", "b"]) == ["a", "b"])
        #expect(MeeshySegmentedLaw.rendered(["a", "b", "c"]) == ["a", "b", "c"])
        #expect(MeeshySegmentedLaw.rendered(["d", "c", "b", "a"]) == ["d", "c", "b", "a"])
        #expect(MeeshySegmentedLaw.rendered(["a"]).isEmpty)
        #expect(MeeshySegmentedLaw.rendered([String]()).isEmpty)
        #expect(MeeshySegmentedLaw.rendered(["a", "b", "c", "d", "e"]).isEmpty)
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

    @Test("un toucher sur un autre segment sélectionne ; sur le courant ou désactivé : ni rappel ni haptique")
    func tapResult_onlyAnEffectiveChangeSelects() {
        #expect(MeeshySegmentedLaw.tapResult(current: 0, target: 2, isEnabled: true) == 2)
        #expect(MeeshySegmentedLaw.tapResult(current: nil, target: 0, isEnabled: true) == 0)
        #expect(MeeshySegmentedLaw.tapResult(current: 1, target: 1, isEnabled: true) == nil)
        #expect(MeeshySegmentedLaw.tapResult(current: 0, target: 2, isEnabled: false) == nil)
        #expect(MeeshySegmentedLaw.tapResult(current: nil, target: 0, isEnabled: false) == nil)
    }

    @Test("le clavier suit le sens logique, inversé en RTL, en boucle pour les flèches")
    func keyboard_vectors() throws {
        for vector in try Self.vectors("keyboard") {
            let raw = try #require(vector["key"] as? String)
            let key = try #require(MeeshySegmentedLaw.Key(rawValue: raw), "touche inconnue \(raw)")
            let index = try #require(vector["index"] as? Int)
            let count = try #require(vector["count"] as? Int)
            let rtl = try #require(vector["rtl"] as? Bool)
            let expected = vector["expected"] as? Int
            #expect(MeeshySegmentedLaw.keyboardTarget(key: key, index: index, count: count, rtl: rtl) == expected,
                    "\(raw) depuis \(index) sur \(count), rtl=\(rtl)")
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

    @Test("chaque segment se nomme par son étiquette d'accessibilité, sinon par son titre")
    func spokenName_prefersTheAccessibilityLabel() {
        #expect(MeeshySegmentedOption(id: 0, title: "N").spokenName == "N")
        #expect(MeeshySegmentedOption(id: 0, title: "N", accessibilityLabel: "Normal").spokenName == "Normal")
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
