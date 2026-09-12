import XCTest
@testable import Meeshy

/// **La capsule « n / N » a quitté le couloir haut** (#6144, directive porteur
/// « enlever les N/M au centre ! »).
///
/// Le rail du couloir bas dit déjà où l'on est dans la série — et il le dit
/// mieux : il le MONTRE, vignette active bordée de blanc. Une capsule
/// textuelle au centre du couloir haut faisait doublon avec ce que l'œil lit
/// déjà en bas.
///
/// Retirer la capsule ne doit pas faire disparaître l'information de position
/// pour VoiceOver : `galleryPositionAccessibilityLabel` était SON libellé —
/// la garde vérifie donc les DEUX faces du changement, l'absence de la
/// capsule et la présence, sur le rail, du même renseignement de position.
/// Retirer le premier sans garantir le second échangerait un doublon contre
/// un trou.
@MainActor
final class ConversationMediaGalleryPositionTests: XCTestCase {

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"
    private static let filmstrip = "Meeshy/Features/Main/Views/ConversationMediaFilmstrip.swift"

    // MARK: - La capsule a disparu du couloir haut

    func test_topCorridor_noLongerRendersTheCounterCapsule() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))

        XCTAssertFalse(
            code.contains("\\(currentIndex + 1) / \\(allAttachments.count)"),
            "la capsule « n / N » doit quitter le couloir haut — le rail montre déjà la position"
        )
        XCTAssertFalse(
            code.contains("galleryPositionAccessibilityLabel"),
            "le libellé de la capsule disparue ne doit laisser aucun code mort"
        )
    }

    // MARK: - Le rail porte l'information de position pour VoiceOver

    func test_railThumbnail_carriesThePositionForVoiceOver() throws {
        let code = AppSourceGuard.stripComments(try source(Self.filmstrip))

        guard let thumbnailBody = declarationBody(startingAt: "private func thumbnail(", in: code) else {
            XCTFail("`thumbnail(_:at:)` introuvable dans la pellicule")
            return
        }
        XCTAssertTrue(
            thumbnailBody.contains("accessibilityLabel:"),
            "chaque vignette du rail doit porter son propre libellé de position"
        )

        guard let thumbnailStruct = declarationBody(
            startingAt: "private struct FilmstripThumbnail", in: code
        ) else {
            XCTFail("`FilmstripThumbnail` introuvable")
            return
        }
        XCTAssertTrue(
            thumbnailStruct.contains(".accessibilityLabel(accessibilityLabel)"),
            "la vignette doit rendre effectivement le libellé de position reçu — "
                + "un champ qui ne s'applique pas n'informe personne"
        )
    }

    // MARK: - Helpers (portés depuis ConversationMediaGalleryScrollTests)

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func declarationBody(startingAt marker: String, in code: String) -> String? {
        guard let markerRange = code.range(of: marker) else { return nil }
        guard let braceRange = code.range(of: "{", range: markerRange.upperBound..<code.endIndex) else {
            return nil
        }
        var depth = 0
        var insideString = false
        var escaped = false
        var index = braceRange.lowerBound
        let start = braceRange
        while index < code.endIndex {
            let character = code[index]
            if insideString {
                if escaped { escaped = false }
                else if character == "\\" { escaped = true }
                else if character == "\"" { insideString = false }
            } else if character == "\"" {
                insideString = true
            } else if character == "{" {
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0 { return String(code[start.lowerBound...index]) }
            }
            index = code.index(after: index)
        }
        return nil
    }
}
