import XCTest
import UIKit
@testable import MeeshyUI

/// **Une image d'identité part à SON format, et annuler ne pose rien** (#17251).
///
/// L'avatar est un rond 1:1, la bannière un bandeau 3:1 : le recadrage final les
/// respecte quel que soit l'éditeur qui a rendu l'image, et une retouche annulée
/// ne remet aucun octet à l'appelant.
final class EntityImageFormatTests: XCTestCase {

    private func makeImage(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    private func pixelSize(_ image: UIImage) -> CGSize {
        CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
    }

    func test_aspect_avatarIsSquareAndRound_bannerIsThreeToOne() {
        XCTAssertEqual(EntityImageFormat.avatar.aspect, 1)
        XCTAssertTrue(EntityImageFormat.avatar.isRound)
        XCTAssertEqual(EntityImageFormat.banner.aspect, 3)
        XCTAssertFalse(EntityImageFormat.banner.isRound)
    }

    func test_centeredCrop_landscapeForAvatar_keepsTheCentralSquare() {
        let rect = EntityImageFormat.avatar.centeredCrop(in: CGSize(width: 400, height: 300))
        XCTAssertEqual(rect, CGRect(x: 50, y: 0, width: 300, height: 300))
    }

    func test_centeredCrop_portraitForBanner_keepsTheCentralBand() {
        let rect = EntityImageFormat.banner.centeredCrop(in: CGSize(width: 300, height: 600))
        XCTAssertEqual(rect, CGRect(x: 0, y: 250, width: 300, height: 100))
    }

    func test_cropped_landscapePhotoForAvatar_comesOutSquare() {
        let out = EntityImageFormat.avatar.cropped(makeImage(width: 400, height: 300))
        XCTAssertEqual(pixelSize(out), CGSize(width: 300, height: 300))
    }

    func test_cropped_squarePhotoForBanner_comesOutThreeToOne() {
        let out = EntityImageFormat.banner.cropped(makeImage(width: 600, height: 600))
        XCTAssertEqual(pixelSize(out), CGSize(width: 600, height: 200))
    }

    func test_cropped_imageAlreadyAtFormat_isReturnedUntouched() {
        let image = makeImage(width: 900, height: 300)
        XCTAssertTrue(EntityImageFormat.banner.cropped(image) === image)
    }

    func test_delivery_cancelled_postsNothing() async {
        let data = await EntityImageDelivery.data(for: .cancelled, format: .avatar, maxSizeKB: 500)
        XCTAssertNil(data)
    }

    func test_delivery_edited_postsBytesAtTheFormat() async throws {
        let data = await EntityImageDelivery.data(for: .edited(makeImage(width: 800, height: 400)),
                                                  format: .avatar, maxSizeKB: 500)
        let decoded = try XCTUnwrap(data.flatMap(UIImage.init(data:)))
        XCTAssertEqual(decoded.size.width, decoded.size.height, accuracy: 1)
    }

    func test_route_withoutAnInjectedEditor_deliversTheCroppedPick() {
        XCTAssertEqual(EntityImageDelivery.route(hasEditor: false), .direct)
        XCTAssertEqual(EntityImageDelivery.route(hasEditor: true), .edit)
    }
}
