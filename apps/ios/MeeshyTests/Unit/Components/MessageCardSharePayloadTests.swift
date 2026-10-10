import XCTest
import UIKit
@testable import Meeshy

/// **Ce qu'on image se partage en IMAGE** (#9038) : la feuille de partage
/// reçoit l'image elle-même — Messages, WhatsApp et Photos la reçoivent comme
/// une photo —, jamais une chaîne ni une URL de chemin vers un fichier.
@MainActor
final class MessageCardSharePayloadTests: XCTestCase {

    private func makePNG() -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).pngData { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }

    func test_activityItems_forAnImageCard_isTheImageItself() throws {
        let payload = try XCTUnwrap(MessageCardSharePayload.image(png: makePNG()))

        let items = payload.activityItems

        XCTAssertEqual(items.count, 1)
        XCTAssertTrue(items.first is UIImage, "l'élément partagé est une UIImage")
        XCTAssertFalse(items.contains { $0 is String || $0 is URL || $0 is NSURL }, "jamais le chemin du fichier")
    }

    func test_image_fromUndecodableBytes_isNil() {
        XCTAssertNil(MessageCardSharePayload.image(png: Data("pas une image".utf8)))
    }

    func test_activityItems_forAnAnimation_isTheMovieFile() {
        let url = URL(fileURLWithPath: "/tmp/meeshy-20260101-000000.mp4")

        let items = MessageCardSharePayload.file(url).activityItems

        XCTAssertEqual(items.first as? URL, url, "une vidéo part comme fichier : c'est ainsi qu'elle reste une vidéo")
    }

    func test_id_differsBetweenTwoImages() throws {
        let first = try XCTUnwrap(MessageCardSharePayload.image(png: makePNG()))
        let second = try XCTUnwrap(MessageCardSharePayload.image(png: makePNG()))
        XCTAssertNotEqual(first.id, second.id, "deux partages successifs rouvrent la feuille")
    }
}
