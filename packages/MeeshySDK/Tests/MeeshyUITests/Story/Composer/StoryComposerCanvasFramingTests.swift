import XCTest
@testable import MeeshyUI

/// Pendant l'édition d'un texte, le canvas reste PLEIN ÉCRAN : les bulles et
/// « Terminé » flottent par-dessus, et le clavier recouvre le bas — c'est
/// assumé, l'attention est sur le texte.
///
/// Le piège : retirer `textActive` de la disjonction ne suffit pas. Quand
/// l'éditeur s'ouvre depuis la tuile Texte, `StoryComposerView+Canvas` appelle
/// `bandStateMachine.tapFAB` puis `tapTile` juste après `enterTextEditingMode`.
/// La band n'est donc pas `.hidden`, et `bandPresent` maintiendrait le carding
/// à lui seul — alors même que la band est masquée et non-interactive.
final class StoryComposerCanvasFramingTests: XCTestCase {

    func test_textEditingKeepsTheCanvasFullScreen_evenWhenTheBandIsPresent() {
        XCTAssertFalse(
            StoryCanvasFraming.isCarded(bandPresent: true,
                                        drawingActive: false,
                                        textActive: true,
                                        timelineActive: false))
    }

    func test_textEditingWinsOverEveryOtherReason() {
        XCTAssertFalse(
            StoryCanvasFraming.isCarded(bandPresent: true,
                                        drawingActive: true,
                                        textActive: true,
                                        timelineActive: true))
    }

    func test_withoutTextEditing_theBandStillCardsTheCanvas() {
        XCTAssertTrue(
            StoryCanvasFraming.isCarded(bandPresent: true,
                                        drawingActive: false,
                                        textActive: false,
                                        timelineActive: false))
    }

    func test_withoutTextEditing_theTimelineStillCardsTheCanvas() {
        XCTAssertTrue(
            StoryCanvasFraming.isCarded(bandPresent: false,
                                        drawingActive: false,
                                        textActive: false,
                                        timelineActive: true))
    }

    func test_atRest_theCanvasIsFullScreen() {
        XCTAssertFalse(
            StoryCanvasFraming.isCarded(bandPresent: false,
                                        drawingActive: false,
                                        textActive: false,
                                        timelineActive: false))
    }
}
