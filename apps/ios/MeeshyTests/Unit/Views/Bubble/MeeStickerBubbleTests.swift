import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Un sticker Mee ou Meo reçu dans une conversation** (#9053).
///
/// Le message porte `templateId: "mee.<id>"`, son emoji de repli et le PNG que
/// l'expéditeur a joint — le contrat du web. La bulle doit jouer le FILM que
/// ce binaire embarque ; un Mee publié par un web plus récent, que le binaire
/// ne connaît pas, retombe sur le PNG comme tout gabarit inconnu.
@MainActor
final class MeeStickerBubbleTests: XCTestCase {

    private var known: MeeSticker {
        get throws { try XCTUnwrap(MeeStickerCatalog.all.first) }
    }

    private func makePicture() -> BubbleContent.Sticker.Picture {
        BubbleContent.Sticker.Picture(
            attachmentId: "a1", fileUrl: "https://cdn.example/mee.png",
            thumbnailUrl: nil, thumbHash: nil, thumbnailColor: "4ECDC4"
        )
    }

    private func makeSticker(templateId: String, emoji: String = "👋") -> BubbleContent.Sticker {
        BubbleContent.Sticker(templateId: templateId, slots: [:], animation: nil,
                              emoji: emoji, picture: makePicture())
    }

    func test_renderSource_knownMee_playsTheFilm() throws {
        let mee = try known
        let source = BubbleSticker.RenderSource.resolve(sticker: makeSticker(templateId: mee.templateId)) { _ in false }
        XCTAssertEqual(source, .mee(id: mee.id))
    }

    func test_renderSource_meeFromANewerWeb_fallsBackToThePicture() {
        let source = BubbleSticker.RenderSource.resolve(sticker: makeSticker(templateId: "mee.pas-encore-filme")) { _ in false }
        XCTAssertEqual(source, .picture(makePicture()))
    }

    func test_accessibilityLabel_saysTheStickerTitle() throws {
        let mee = try known
        XCTAssertEqual(BubbleSticker.accessibilityLabel(for: makeSticker(templateId: mee.templateId)), mee.title)
    }

    func test_altText_isTheStickerTitle() throws {
        let mee = try known
        XCTAssertEqual(StickerAltText.describe(mee.messageSticker), mee.title)
    }

    /// Loi 4 : la feuille ne sait pas encore relire un Mee depuis les favoris —
    /// l'épingler l'y ferait disparaître sans rien dire. L'entrée de menu est
    /// donc ABSENTE, jamais inerte.
    func test_favoriteEntry_isAbsentForAMee() throws {
        XCTAssertNil(MessageStickerFavorite.entry(for: try known.messageSticker))
    }
}
