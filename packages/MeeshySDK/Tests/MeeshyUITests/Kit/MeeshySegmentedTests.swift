import Testing
import SwiftUI
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

    @Test("le glyphe de tête : plein pour le courant, contour au repos ; sans glyphe, le texte seul")
    func glyph_filledForTheCurrentOnly() {
        let faces = MeeshySegmentedOption(id: 1, title: "Vitrine", systemImage: "person.crop.square",
                                          currentSystemImage: "person.crop.square.fill")
        #expect(faces.glyph(isCurrent: true) == "person.crop.square.fill")
        #expect(faces.glyph(isCurrent: false) == "person.crop.square")
        let outlineOnly = MeeshySegmentedOption(id: 2, title: "Liens", systemImage: "link")
        #expect(outlineOnly.glyph(isCurrent: true) == "link")
        let textOnly = MeeshySegmentedOption(id: 3, title: "Actions")
        #expect(textOnly.glyph(isCurrent: true) == nil)
        #expect(textOnly.glyph(isCurrent: false) == nil)
    }

    @Test("le contenu suit l'ordre des faces : vers une face plus loin il avance, vers une plus proche il recule")
    func travel_vectors() throws {
        for vector in try Self.vectors("travel") {
            let raw = try #require(vector["expected"] as? String)
            let expected = try #require(MeeshySegmentedTravel(rawValue: raw), "sens inconnu \(raw)")
            let from = vector["from"] as? Int
            let to = vector["to"] as? Int
            #expect(MeeshySegmentedLaw.travel(from: from, to: to) == expected, "\(String(describing: from)) → \(String(describing: to))")
        }
    }

    @Test("en avançant le contenu entre par le bord de fin et sort par celui de début ; en reculant, l'inverse")
    func travel_edgesFollowTheGesture() {
        #expect(MeeshySegmentedTravel.forward.insertionEdge == .trailing)
        #expect(MeeshySegmentedTravel.forward.removalEdge == .leading)
        #expect(MeeshySegmentedTravel.backward.insertionEdge == .leading)
        #expect(MeeshySegmentedTravel.backward.removalEdge == .trailing)
        #expect(MeeshySegmentedTravel.none.insertionEdge == nil)
        #expect(MeeshySegmentedTravel.none.removalEdge == nil)
    }

    @Test("au relâcher, la face choisie est celle sous le doigt, ou la plus proche hors de la piste")
    func dragTarget_vectors() throws {
        for vector in try Self.vectors("dragTarget") {
            let x = try #require(vector["x"] as? Double)
            let raw = try #require(vector["spans"] as? [[Double]])
            let spans = raw.map { MeeshySegmentedSpan(minX: $0[0], maxX: $0[1]) }
            let expected = vector["expected"] as? Int
            #expect(MeeshySegmentedLaw.dragTarget(x: x, spans: spans) == expected, "x=\(x)")
        }
    }

    @Test("le glissé ne vise une face que si la piste tient sur une seule rangée")
    func isSingleRow_onlyForOneRow() {
        #expect(MeeshySegmentedLaw.isSingleRow(tops: [0, 0, 0]))
        #expect(MeeshySegmentedLaw.isSingleRow(tops: [4, 4.2]))
        #expect(!MeeshySegmentedLaw.isSingleRow(tops: [0, 0, 44]))
        #expect(!MeeshySegmentedLaw.isSingleRow(tops: []))
    }

    @Test("la goutte : le bord avant part en tête, l'arrière suit, puis elle se rétracte sur la face choisie")
    func drop_vectors() throws {
        for vector in try Self.vectors("drop") {
            let from = try #require(vector["from"] as? [Double])
            let to = try #require(vector["to"] as? [Double])
            let progress = try #require(vector["progress"] as? Double)
            let expected = try #require(vector["expected"] as? [Double])
            let span = MeeshySegmentedLaw.dropSpan(
                from: MeeshySegmentedSpan(minX: from[0], maxX: from[1]),
                to: MeeshySegmentedSpan(minX: to[0], maxX: to[1]),
                progress: progress
            )
            let rounded = [span.minX, span.maxX].map { ($0 * 100).rounded() / 100 }
            #expect(rounded == expected, "\(from) → \(to) à \(progress)")
        }
    }

    @Test("à mi-course la goutte est plus large que les deux faces qu'elle relie")
    func drop_stretchesBetweenFaces() {
        let span = MeeshySegmentedLaw.dropSpan(
            from: MeeshySegmentedSpan(minX: 0, maxX: 80),
            to: MeeshySegmentedSpan(minX: 200, maxX: 300),
            progress: 0.5
        )
        #expect(span.width > 100)
    }

    @Test("chaque changement part de la face montrée ; sous mouvement réduit la goutte ne voyage pas")
    func dropState_advances() {
        let resting = MeeshySegmentedDropState.resting(at: 0)
        #expect(MeeshySegmentedLaw.dropProgress(phase: 0, generation: resting.generation) == 1)
        let moved = resting.advanced(to: 2, reduce: false)
        #expect(moved == MeeshySegmentedDropState(from: 0, to: 2, generation: 1))
        #expect(MeeshySegmentedLaw.dropProgress(phase: 0, generation: moved.generation) == 0)
        #expect(MeeshySegmentedLaw.dropProgress(phase: 1, generation: moved.generation) == 1)
        let reduced = moved.advanced(to: 1, reduce: true)
        #expect(reduced == MeeshySegmentedDropState(from: 1, to: 1, generation: 2))
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
