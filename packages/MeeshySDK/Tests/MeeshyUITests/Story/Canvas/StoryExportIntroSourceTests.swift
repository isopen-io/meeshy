import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// L'interlude se peint pour QUELQU'UN qu'on lui remet (#10536) — l'auteur
/// d'une story qu'un lecteur emporte, pas seulement l'utilisateur connecté.
@MainActor
final class StoryExportIntroSourceTests: XCTestCase {

    private let grace = StoryExportIntroSource(userId: nil, displayName: "Grace Hopper", username: "grace")

    func test_unresolvedContent_withoutImages_namesTheIdentityOverItsFallbackTint() {
        let content = StoryExportIntroFactory.unresolvedContent(for: grace)

        XCTAssertEqual(content.displayName, "Grace Hopper")
        XCTAssertEqual(content.username, "grace")
        XCTAssertNil(content.avatar)
        XCTAssertNil(content.banner)
        XCTAssertEqual(content.accentColorHex, DynamicColorGenerator.colorForName("grace"))
    }

    func test_content_withoutAnyAddress_stillPaintsTheIdentity_withoutMood() async {
        let content = await StoryExportIntroFactory.content(for: grace)

        XCTAssertEqual(content.displayName, "Grace Hopper")
        XCTAssertEqual(content.username, "grace")
        XCTAssertNil(content.avatar)
        XCTAssertNil(content.banner)
        XCTAssertNil(content.moodEmoji)
    }

    private static let filet = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)

    private var ringedGrace: StoryExportIntroSource {
        StoryExportIntroSource(userId: nil, displayName: "Grace Hopper", username: "grace", avatarRing: Self.filet)
    }

    /// Le contour se lit dans le catalogue EMBARQUÉ : l'interlude sobre, peint
    /// quand les images ne sont pas revenues à temps, le garde.
    func test_unresolvedContent_keepsTheEquippedRing() {
        let content = StoryExportIntroFactory.unresolvedContent(for: ringedGrace)

        XCTAssertNotNil(content.avatarRing)
        XCTAssertEqual(content.avatarRing, AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "filet"))
    }

    func test_content_resolvesTheEquippedRing() async {
        let content = await StoryExportIntroFactory.content(for: ringedGrace)

        XCTAssertEqual(content.avatarRing, AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "filet"))
    }

    func test_content_withoutRing_paintsTheBareAvatar() {
        XCTAssertNil(StoryExportIntroFactory.unresolvedContent(for: grace).avatarRing)
    }

    func test_unresolvedContent_rendersAnInterlude() {
        let image = StoryExportIntro.render(StoryExportIntroFactory.unresolvedContent(for: grace),
                                            size: CGSize(width: 270, height: 480))

        XCTAssertEqual(image?.width, 270)
        XCTAssertEqual(image?.height, 480)
    }
}
