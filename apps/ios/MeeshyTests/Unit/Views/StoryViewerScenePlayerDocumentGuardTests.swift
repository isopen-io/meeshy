import XCTest
@testable import Meeshy

/// Gardes du DOCUMENT et du PORTEUR servis au `MeeshyScenePlayer` par le viewer
/// story — le swap E4, exécuté au socle du lot C.
///
/// La garde de couture d'E4 (`StoryViewerScenePlayerGuardTests`) tient déjà deux
/// choses : que chaque montage garde les fils du viewer, et que le fichier dérive
/// un document v3 par `storyEffects?.canvasV3 ?? CanvasV3(migrating:`. Elle ne
/// peut rien dire de deux autres, qu'un swap peut trahir en SILENCE :
///
/// 1. **Quel document va à quel montage.** Le canvas SORTANT du cross-fade peint
///    la story qu'on QUITTE ; le courant, celle qu'on rejoint. Servir le document
///    de la story courante aux DEUX satisfait la garde de couture — elle cherche
///    son motif dans le FICHIER, pas dans la fenêtre — et fait pourtant clignoter
///    la story d'arrivée pendant les 350 ms du fondu, au lieu de fondre celle
///    qu'on quitte. Le même piège vaut pour le porteur.
///
/// 2. **Le porteur existe.** Le document dit ce qu'il faut PEINDRE ; il ne dit
///    pas où vivent les pixels. Sans `carrier:`, `MeeshyScenePlayer` enveloppe un
///    `StoryItem` dont `media` vaut `[]`, et `StoryItem.toRenderableSlide` perd
///    son hydratation read-time : `aspectRatio` d'abord — source de dimensionnement
///    PRIMAIRE, puisque le composer stampe toujours la sentinelle `1.0`, donc tout
///    média non carré s'affiche SQUISHÉ —, puis `duration`, l'adresse d'un clip
///    audio et le backdrop legacy ; le résolveur de `makeUIView` perd en plus son
///    repli distant par `postMediaId`. Un montage sans porteur compile, se monte,
///    et rend faux.
///
/// Comme la garde de couture, ces assertions visent la fenêtre ÉQUILIBRÉE de
/// l'appel : ce qui est chaîné après la parenthèse fermante n'en fait pas partie.
final class StoryViewerScenePlayerDocumentGuardTests: XCTestCase {

    private static let canvasFile = "Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.canvasFile)
    }

    /// Fenêtres équilibrées de chaque appel à `MeeshyScenePlayer(`.
    private func playerMounts(in text: String) -> [String] {
        var windows: [String] = []
        var searchStart = text.startIndex

        while let opening = text.range(of: "MeeshyScenePlayer(", range: searchStart..<text.endIndex) {
            var depth = 1
            var insideString = false
            var previous: Character?
            var cursor = opening.upperBound

            while cursor < text.endIndex, depth > 0 {
                let character = text[cursor]
                if character == "\"" && previous != "\\" { insideString.toggle() }
                if !insideString {
                    if character == "(" || character == "[" || character == "{" { depth += 1 }
                    if character == ")" || character == "]" || character == "}" { depth -= 1 }
                }
                previous = character
                cursor = text.index(after: cursor)
            }

            if depth == 0 { windows.append(String(text[opening.lowerBound..<cursor])) }
            searchStart = opening.upperBound
        }
        return windows
    }

    /// La VALEUR passée sous `label` dans une fenêtre de montage : du deux-points
    /// jusqu'à la virgule de même profondeur (un sous-appel `f(a, b)` ne coupe
    /// donc pas l'argument en deux).
    private func argument(_ label: String, in window: String) -> String? {
        guard let start = window.range(of: label) else { return nil }
        var depth = 0
        var cursor = start.upperBound

        while cursor < window.endIndex {
            let character = window[cursor]
            if character == "(" || character == "[" || character == "{" { depth += 1 }
            if character == ")" || character == "]" || character == "}" {
                if depth == 0 { break }
                depth -= 1
            }
            if character == "," && depth == 0 { break }
            cursor = window.index(after: cursor)
        }
        return String(window[start.upperBound..<cursor])
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func mounts() throws -> (current: String, outgoing: String) {
        let windows = playerMounts(in: try source())
        XCTAssertEqual(
            windows.count, 2,
            "Le viewer monte le ScenePlayer EXACTEMENT deux fois : le canvas sortant du " +
            "cross-fade et la story courante. En trouver un autre nombre veut dire que le " +
            "swap E4 a dupliqué ou perdu un montage."
        )
        let outgoing = windows.filter { $0.contains("isOutgoing: true") }
        let current = windows.filter { !$0.contains("isOutgoing: true") }
        guard outgoing.count == 1, current.count == 1,
              let outgoingMount = outgoing.first, let currentMount = current.first else {
            throw XCTSkip("Montages du ScenePlayer non identifiables — voir l'assertion ci-dessus.")
        }
        return (currentMount, outgoingMount)
    }

    // MARK: - Chaque montage sert le document de la story QU'IL peint

    func test_eachMountServesTheDocumentOfTheStoryItPaints() throws {
        let mounts = try mounts()

        let outgoingDocument = try XCTUnwrap(
            argument("document:", in: mounts.outgoing),
            "Le montage sortant doit servir un document au player."
        )
        XCTAssertTrue(
            outgoingDocument.contains("outgoing"),
            "Le canvas SORTANT doit servir le document de la story QU'ON QUITTE — " +
            "reçu « \(outgoingDocument) ». Servi avec celui de la story courante, le fondu " +
            "montre deux fois la story d'arrivée : elle clignote au lieu de se substituer."
        )

        let currentDocument = try XCTUnwrap(
            argument("document:", in: mounts.current),
            "Le montage courant doit servir un document au player."
        )
        XCTAssertFalse(
            currentDocument.contains("outgoing"),
            "Le canvas COURANT doit servir le document de la story qu'on rejoint, jamais " +
            "celui qu'on quitte — reçu « \(currentDocument) »."
        )
        XCTAssertTrue(
            currentDocument.contains("story"),
            "Le document du montage courant se dérive de la story courante — " +
            "reçu « \(currentDocument) »."
        )
    }

    // MARK: - Chaque montage porte la story QU'IL peint

    func test_eachMountCarriesTheStoryItPaints() throws {
        let mounts = try mounts()

        let outgoingCarrier = try XCTUnwrap(
            argument("carrier:", in: mounts.outgoing),
            "Le montage sortant doit donner son PORTEUR : sans lui, `media` vaut [] et le " +
            "canvas du fondu perd l'adresse de ses pixels — il repart du néant le temps de " +
            "la transition, là où il devrait afficher exactement ce qu'on quitte."
        )
        XCTAssertTrue(
            outgoingCarrier.contains("outgoing"),
            "Le porteur du canvas sortant est la story qu'on QUITTE — reçu « \(outgoingCarrier) »."
        )

        let currentCarrier = try XCTUnwrap(
            argument("carrier:", in: mounts.current),
            "Le montage courant doit donner son PORTEUR : sans lui, `toRenderableSlide` perd " +
            "son hydratation read-time (aspectRatio — source de dimensionnement PRIMAIRE, le " +
            "composer stampant toujours la sentinelle 1.0 —, duration, adresse d'un clip audio, " +
            "backdrop legacy) et le résolveur perd son repli distant par postMediaId."
        )
        XCTAssertFalse(
            currentCarrier.contains("outgoing"),
            "Le porteur du canvas courant est la story qu'on rejoint — reçu « \(currentCarrier) »."
        )
        XCTAssertTrue(
            currentCarrier.contains("story"),
            "Le porteur du canvas courant est la story courante — reçu « \(currentCarrier) »."
        )
    }

    // MARK: - Un seul chemin de sortie, pour de bon

    /// « UN SEUL chemin de sortie » ne se prouve pas par la PRÉSENCE du motif :
    /// deux montages qui recopient chacun `canvasV3 ?? migration` la satisfont
    /// aussi, et l'un des deux dérive ensuite en silence. Ce qui la prouve, c'est
    /// l'UNICITÉ de la dérivation dans le fichier.
    func test_theDocumentIsDerivedInExactlyOnePlace() throws {
        let text = try source()
        let derivations = text.components(separatedBy: "storyEffects?.canvasV3").count - 1
        XCTAssertEqual(
            derivations, 1,
            "La dérivation v3 ⇒ document doit être écrite UNE fois et partagée par les deux " +
            "montages — trouvée \(derivations) fois. Recopiée par montage, elle laisse le " +
            "canvas sortant et le canvas courant diverger sans qu'aucune garde ne le voie."
        )
    }
}
