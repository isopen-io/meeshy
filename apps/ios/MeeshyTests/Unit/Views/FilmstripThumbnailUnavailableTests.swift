import XCTest
@testable import Meeshy

/// #8141 — une vignette de la PELLICULE dont le fichier est introuvable (404,
/// 410, refus) DIT son absence, comme la page de la visionneuse : un état
/// dessiné, et VoiceOver l'annonce à la suite de la position.
@MainActor
final class FilmstripThumbnailUnavailableTests: XCTestCase {

    private let position = "Média 3 sur 16"

    func test_accessibilityLabel_unavailable_appendsTheAbsenceAfterThePosition() {
        let label = FilmstripThumbnailPresentation.accessibilityLabel(position: position, isUnavailable: true)

        XCTAssertTrue(label.hasPrefix(position), label)
        XCTAssertTrue(label.contains(FilmstripThumbnailPresentation.unavailableText), label)
    }

    func test_accessibilityLabel_available_isThePositionAlone() {
        XCTAssertEqual(
            FilmstripThumbnailPresentation.accessibilityLabel(position: position, isUnavailable: false),
            position
        )
    }

    func test_unavailableText_isTheViewerSentence() {
        XCTAssertEqual(
            FilmstripThumbnailPresentation.unavailableText,
            String(localized: "gallery.media.unavailable", defaultValue: "Ce média n'est plus disponible", bundle: .main),
            "la pellicule et la page de la visionneuse disent la même absence avec les mêmes mots"
        )
    }
}
