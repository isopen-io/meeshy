import XCTest
import UIKit
@testable import Meeshy

final class NowPlayingArtworkTests: XCTestCase {

    // MARK: - Résolution de l'URL d'avatar

    func test_preferredAvatarURL_senderWinsOverConversation() {
        let url = NowPlayingArtwork.preferredAvatarURL(
            senderAvatarURL: "/uploads/sender.jpg",
            conversationArtworkURL: "/uploads/group.jpg"
        )
        XCTAssertEqual(url, "/uploads/sender.jpg")
    }

    func test_preferredAvatarURL_emptySenderFallsBackToConversation() {
        let url = NowPlayingArtwork.preferredAvatarURL(
            senderAvatarURL: "",
            conversationArtworkURL: "/uploads/group.jpg"
        )
        XCTAssertEqual(url, "/uploads/group.jpg")
    }

    func test_preferredAvatarURL_nilSenderFallsBackToConversation() {
        let url = NowPlayingArtwork.preferredAvatarURL(
            senderAvatarURL: nil,
            conversationArtworkURL: "/uploads/group.jpg"
        )
        XCTAssertEqual(url, "/uploads/group.jpg")
    }

    func test_preferredAvatarURL_bothMissing_returnsNil() {
        XCTAssertNil(NowPlayingArtwork.preferredAvatarURL(
            senderAvatarURL: nil, conversationArtworkURL: nil))
        XCTAssertNil(NowPlayingArtwork.preferredAvatarURL(
            senderAvatarURL: "", conversationArtworkURL: ""))
    }

    // MARK: - Composition

    func test_compose_avatarWithAppIcon_stampsBadgeBottomLeft() throws {
        let avatar = Self.solidImage(color: .red)
        let icon = Self.solidImage(color: .blue)

        let composed = try XCTUnwrap(NowPlayingArtwork.compose(avatar: avatar, appIcon: icon))

        XCTAssertEqual(composed.size.width, NowPlayingArtwork.canvasSide)
        XCTAssertEqual(composed.size.height, NowPlayingArtwork.canvasSide)

        let side = NowPlayingArtwork.canvasSide
        let badgeSide = side * NowPlayingArtwork.badgeFraction
        let padding = side * NowPlayingArtwork.badgePaddingFraction
        let badgeCenter = CGPoint(x: padding + badgeSide / 2,
                                  y: side - padding - badgeSide / 2)
        let topRight = CGPoint(x: side - 10, y: 10)

        XCTAssertEqual(try Self.dominantChannel(of: composed, at: badgeCenter), .blue,
                       "Le badge icône app doit occuper le coin bas-gauche")
        XCTAssertEqual(try Self.dominantChannel(of: composed, at: topRight), .red,
                       "L'avatar doit remplir le reste du canvas")
    }

    func test_compose_withoutAvatar_rendersAppIconFullCanvas() throws {
        let icon = Self.solidImage(color: .blue)

        let composed = try XCTUnwrap(NowPlayingArtwork.compose(avatar: nil, appIcon: icon))

        let center = CGPoint(x: NowPlayingArtwork.canvasSide / 2,
                             y: NowPlayingArtwork.canvasSide / 2)
        XCTAssertEqual(try Self.dominantChannel(of: composed, at: center), .blue)
    }

    func test_compose_avatarWithoutAppIcon_rendersAvatarAlone() throws {
        let avatar = Self.solidImage(color: .red)

        let composed = try XCTUnwrap(NowPlayingArtwork.compose(avatar: avatar, appIcon: nil))

        let bottomLeft = CGPoint(x: 40, y: NowPlayingArtwork.canvasSide - 40)
        XCTAssertEqual(try Self.dominantChannel(of: composed, at: bottomLeft), .red)
    }

    func test_compose_bothNil_returnsNil() {
        XCTAssertNil(NowPlayingArtwork.compose(avatar: nil, appIcon: nil))
    }

    // MARK: - Artwork handler isolation (regression: build 1746 crash)
    //
    // MediaPlayer.framework invokes an `MPMediaItemArtwork`'s `requestHandler`
    // lazily, asynchronously, from ITS OWN private serial queue (observed in
    // 14/14 crash logs as thread `*/accessQueue`) — never from the main
    // thread, and never through Swift Concurrency. A closure literal written
    // directly inside a `@MainActor` context (this app target compiles under
    // `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`) infers `@MainActor`
    // isolation by default; when MediaPlayer then invokes it off-main, the
    // Swift runtime's executor check (`swift_task_isCurrentExecutorImpl`)
    // fails and traps via `dispatch_assert_queue` (EXC_BREAKPOINT/SIGTRAP).
    // `NowPlayingArtwork.makeArtwork` must build the handler from this
    // `nonisolated enum` so it carries NO actor isolation — safely callable
    // from any thread, exactly as MediaPlayer requires.
    func test_makeArtwork_requestHandler_invokedFromBackgroundThread_doesNotRequireMainActor() {
        let image = Self.solidImage(color: .red)
        let artwork = NowPlayingArtwork.makeArtwork(image: image)

        let expectation = expectation(description: "requestHandler invoked off-main")
        var resolvedSize: CGSize?
        DispatchQueue.global(qos: .utility).async {
            resolvedSize = artwork.image(at: CGSize(width: 40, height: 40))?.size
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 2.0)

        XCTAssertEqual(resolvedSize, image.size)
    }

    // MARK: - Helpers

    private enum Channel { case red, green, blue }

    private static func solidImage(color: UIColor, side: CGFloat = 10) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
            .image { ctx in
                color.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
            }
    }

    private static func dominantChannel(of image: UIImage, at point: CGPoint) throws -> Channel {
        let cgImage = try XCTUnwrap(image.cgImage)
        let scaleX = CGFloat(cgImage.width) / image.size.width
        let scaleY = CGFloat(cgImage.height) / image.size.height
        let x = Int(point.x * scaleX)
        let y = Int(point.y * scaleY)

        var pixel = [UInt8](repeating: 0, count: 4)
        let context = try XCTUnwrap(CGContext(
            data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.draw(cgImage, in: CGRect(x: -CGFloat(x), y: CGFloat(y) - CGFloat(cgImage.height) + 1,
                                         width: CGFloat(cgImage.width), height: CGFloat(cgImage.height)))
        let (r, g, b) = (pixel[0], pixel[1], pixel[2])
        if r >= g && r >= b { return .red }
        if g >= r && g >= b { return .green }
        return .blue
    }
}
