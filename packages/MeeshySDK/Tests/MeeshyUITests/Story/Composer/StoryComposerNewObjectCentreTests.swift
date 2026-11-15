import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **Un objet neuf se pose au CENTRE de la scène, qu'elle soit vide ou non**
/// (décision porteur du 2026-11-15, #18719).
///
/// La cascade de #4939 décalait le second objet vers le bas à droite : il
/// atterrissait près de la colonne d'outils et se lisait comme mal placé.
/// Le témoin porte donc sur le SECOND objet — le premier est au centre avec
/// comme sans la règle.
@MainActor
final class StoryComposerNewObjectCentreTests: XCTestCase {

    private let centre = CGPoint(x: 0.5, y: 0.5)

    func test_addText_onASceneWhoseCentreIsTaken_posesTheSecondTextAtTheCentre() throws {
        let sut = StoryComposerViewModel()
        _ = sut.addText()

        let second = try XCTUnwrap(sut.addText())

        XCTAssertEqual(CGPoint(x: second.x, y: second.y), centre)
    }

    func test_addMediaObject_inForeground_besideATextAtTheCentre_posesTheMediaAtTheCentre() throws {
        let sut = StoryComposerViewModel()
        _ = sut.addMediaObject(kind: .image, id: "fond")
        _ = sut.addText()

        let media = try XCTUnwrap(sut.addMediaObject(kind: .image, id: "premier-plan"))

        XCTAssertFalse(media.isBackground)
        XCTAssertEqual(CGPoint(x: media.x, y: media.y), centre)
    }

    func test_addSticker_besideATextAtTheCentre_posesTheStickerAtTheCentre() throws {
        let sut = StoryComposerViewModel()
        _ = sut.addText()

        let sticker = try XCTUnwrap(sut.addSticker(emoji: "🌸"))

        XCTAssertEqual(CGPoint(x: sticker.x, y: sticker.y), centre)
    }
}
