import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les couloirs du plateau se lisent sur la forme du lot, calculée une fois**
/// (#11163).
///
/// Journal de l'iPhone du porteur (2026-10-20 19:30, 0x8BADF00D) : le fil
/// principal était pris dans `MediaGalleryStage.carriesDuration`, appelé par
/// `stageCorridors`, appelé par `stage(for:)`, appelé pour CHAQUE page que le
/// pager construit. Chaque page reparcourait tout le lot : N pages × N pièces à
/// chaque mise en page d'une galerie de conversation, dont le catalogue tient
/// tous les médias.
@MainActor
final class GalleryLotShapeTests: XCTestCase {

    private func image(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "image/jpeg", fileUrl: "https://cdn.meeshy.me/\(id).jpg",
                          width: 1_080, height: 1_920, uploadedBy: "u-1")
    }

    private func video(_ id: String, durationMs: Int) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "video/mp4", fileUrl: "https://cdn.meeshy.me/\(id).mp4",
                          width: 1_080, height: 1_920, duration: durationMs, uploadedBy: "u-1")
    }

    func test_shape_givesTheSameCorridorsAsTheLotItDescribes() {
        let lots: [[MessageAttachment]] = [
            [image("a")],
            [image("a"), image("b")],
            [video("v", durationMs: 12_000)],
            [image("a"), video("v", durationMs: 12_000)],
            [image("a"), video("v", durationMs: 0)],
        ]
        for lot in lots {
            XCTAssertEqual(
                MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, lot: GalleryLotShape(lot)),
                MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, attachments: lot),
                lot.map(\.id).joined(separator: ",")
            )
        }
    }

    func test_shape_ofASeriesWithADuration() {
        let shape = GalleryLotShape([image("a"), video("v", durationMs: 12_000)])

        XCTAssertTrue(shape.isSeries)
        XCTAssertTrue(shape.carriesDuration)
    }

    func test_shape_ofASingleImage() {
        let shape = GalleryLotShape([image("a")])

        XCTAssertFalse(shape.isSeries)
        XCTAssertFalse(shape.carriesDuration)
    }

    /// Le getter que chaque page appelle ne parcourt plus la source : il lit la
    /// forme posée à l'`init` de la galerie.
    func test_stageCorridors_readsTheShapeAndNeverWalksTheLot() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
        )
        let start = try XCTUnwrap(code.range(of: "var stageCorridors"))
        let getter = String(code[start.lowerBound...].prefix(400))
        let compact = getter.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(compact.contains("lot:lotShape"), getter)
        XCTAssertFalse(compact.contains("attachments:allAttachments"), getter)
    }
}

/// **Une pièce, une page** (#11162) — le pager suit ses pages par identifiant,
/// et la distance d'une page à la page ouverte se lit sur deux index qui
/// doivent nommer la même pièce.
@MainActor
final class GalleryDistinctPagesTests: XCTestCase {

    private func piece(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "image/jpeg", fileUrl: "https://cdn.meeshy.me/\(id).jpg",
                          uploadedBy: "u-1")
    }

    func test_distinct_keepsTheFirstOccurrenceInOrder() {
        let pages = GalleryPagePinning.distinct([piece("a"), piece("b"), piece("a"), piece("c"), piece("b")])

        XCTAssertEqual(pages.map(\.id), ["a", "b", "c"])
    }

    func test_gallery_pagesAPieceOnce_soItsPositionIsThePagersPosition() {
        let gallery = ConversationMediaGalleryView(
            allAttachments: [piece("a"), piece("a"), piece("b"), piece("c")],
            startAttachmentId: "c",
            accentColor: "6366F1"
        )

        XCTAssertEqual(gallery.allAttachments.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(gallery.indexByID["c"], 2)
    }

    /// Le pager par sélection appelle le constructeur de chaque pièce à chaque
    /// mise à jour : au-delà de la fenêtre et de sa marge, rien ne se construit.
    func test_renderWindow_buildsOnlyTheWindowAndItsMargin() {
        XCTAssertTrue(GalleryRenderWindow.buildsPage(distance: 0))
        XCTAssertTrue(GalleryRenderWindow.buildsPage(distance: GalleryRenderWindow.radius + 1))
        XCTAssertFalse(GalleryRenderWindow.buildsPage(distance: GalleryRenderWindow.radius + 2))
        XCTAssertFalse(GalleryRenderWindow.buildsPage(distance: 900))
    }
}
