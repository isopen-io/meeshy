import XCTest
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'intro d'une story exportée porte la présence SERVIE de l'auteur et le logo de son
/// cercle** (#13997, demande porteur 2026-10-31). La présence est une projection : absente,
/// rien n'est peint. Le logo n'existe qu'à partir de Proche ; en dessous, la ligne du nom
/// reste exactement celle d'avant.
@MainActor
final class StoryExportIntroBadgesTests: XCTestCase {

    private let size = CGSize(width: 270, height: 480)

    /// Le point sur le bord bas-droit de l'avatar de la carte d'identité (270×480) :
    /// disque de côté 0,28 × 270 centré en (135, 209,76), point à 45°.
    private let dotCentre = (x: 161, y: 236)

    private func content(displayName: String = "J. Charles N. M.",
                         presence: StoryExportPresence? = nil,
                         relationLogo: String? = nil) -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: displayName, username: "jcnm",
                                accentColorHex: "6366F1",
                                presence: presence, relationLogo: relationLogo)
    }

    private func render(_ content: StoryExportIntroContent) throws -> CGImage {
        try XCTUnwrap(StoryExportIntro.render(content, size: size))
    }

    // MARK: - Présence

    func test_render_withoutPresence_paintsNoDotOnTheAvatar() throws {
        let p = try XCTUnwrap(pixel(of: try render(content()), x: dotCentre.x, y: dotCentre.y))

        XCTAssertGreaterThan(p.blue, p.green + 40,
                             "sans présence servie, le bord de l'avatar reste celui de la teinte d'accent")
    }

    func test_render_withoutPresence_isIdenticalToTheHistoricalRender() throws {
        let historical = StoryExportIntroContent(displayName: "J. Charles N. M.", username: "jcnm",
                                                 accentColorHex: "6366F1")

        XCTAssertEqual(try bytes(of: render(content())), try bytes(of: render(historical)),
                       "API rétrocompatible : l'init sans présence ni logo peint comme avant")
    }

    func test_render_online_paintsAGreenDotOnTheAvatarRim() throws {
        let p = try XCTUnwrap(pixel(of: try render(content(presence: .online)), x: dotCentre.x, y: dotCentre.y))

        XCTAssertEqual(p.red, 0x34, accuracy: 14)
        XCTAssertEqual(p.green, 0xD3, accuracy: 14)
        XCTAssertEqual(p.blue, 0x99, accuracy: 14)
    }

    func test_render_away_paintsAnOrangeDot() throws {
        let p = try XCTUnwrap(pixel(of: try render(content(presence: .away)), x: dotCentre.x, y: dotCentre.y))

        XCTAssertEqual(p.red, 0xFB, accuracy: 14)
        XCTAssertEqual(p.green, 0xBF, accuracy: 14)
        XCTAssertEqual(p.blue, 0x24, accuracy: 14)
    }

    func test_render_idle_paintsAGreyDot() throws {
        let p = try XCTUnwrap(pixel(of: try render(content(presence: .idle)), x: dotCentre.x, y: dotCentre.y))

        XCTAssertEqual(p.red, 0x9C, accuracy: 14)
        XCTAssertEqual(p.green, 0xA3, accuracy: 14)
        XCTAssertEqual(p.blue, 0xAF, accuracy: 14)
    }

    func test_presenceDot_isAQuarterOfTheAvatarOrSoAndSitsOnItsBottomRightEdge() {
        let avatar = CGRect(x: 97.2, y: 171.96, width: 75.6, height: 75.6)

        let dot = StoryExportIdentityBadges.presenceDotRect(avatarBox: avatar)

        XCTAssertEqual(dot.width / avatar.width, 0.22, accuracy: 0.001)
        XCTAssertEqual(dot.midX, 161.73, accuracy: 0.05)
        XCTAssertEqual(dot.midY, 236.49, accuracy: 0.05)
    }

    func test_presenceDot_wearsADarkRimAroundItsColour() throws {
        let image = try render(content(presence: .online))
        let dot = StoryExportIdentityBadges.presenceDotRect(
            avatarBox: CGRect(x: 97.2, y: 171.96, width: 75.6, height: 75.6))
        // Juste à l'intérieur du bord gauche du disque coloré : dans le liseré, encore sur l'avatar.
        let rimX = Int(dot.minX) - 1
        let p = try XCTUnwrap(pixel(of: image, x: rimX, y: Int(dot.midY)))

        XCTAssertLessThan(p.green, 80, "le liseré sombre sépare le point de l'avatar (teinte d'accent : vert 102)")
    }

    func test_presence_offlineProjectsToNothing() {
        XCTAssertNil(StoryExportPresence(.offline))
        XCTAssertEqual(StoryExportPresence(.online), .online)
        XCTAssertEqual(StoryExportPresence(.away), .away)
        XCTAssertEqual(StoryExportPresence(.idle), .idle)
    }

    // MARK: - Logo du cercle

    func test_nameLine_withoutLogo_isTheDisplayNameAlone() {
        XCTAssertEqual(StoryExportIdentityBadges.nameLine(displayName: "Grace", logo: nil), "Grace")
        XCTAssertEqual(StoryExportIdentityBadges.nameLine(displayName: "Grace", logo: ""), "Grace")
    }

    func test_nameLine_withLogo_putsTheEmojiToTheRightOfTheName() {
        XCTAssertEqual(StoryExportIdentityBadges.nameLine(displayName: "Grace", logo: "🔥"), "Grace 🔥")
    }

    func test_render_withLogo_widensTheNameLineToTheRight() throws {
        let baseline = try render(content(displayName: ""))
        let plain = try inkExtent(of: render(content()), against: baseline)
        let withLogo = try inkExtent(of: render(content(relationLogo: "🔥")), against: baseline)

        XCTAssertGreaterThan(withLogo.maxX, plain.maxX, "l'emoji est à droite du nom")
        XCTAssertGreaterThan(withLogo.width, plain.width + 10, "la ligne du nom s'allonge d'un emoji et d'une espace")
    }

    func test_render_withoutLogo_keepsTheNameLineAsBefore() throws {
        let historical = StoryExportIntroContent(displayName: "J. Charles N. M.", username: "jcnm",
                                                 accentColorHex: "6366F1")

        XCTAssertEqual(try bytes(of: render(content(relationLogo: nil))), try bytes(of: render(historical)))
    }

    // MARK: - Projection de la fabrique

    func test_content_projectsTheServedPresenceAndTheLogoOfTheServedLevel() async {
        let source = StoryExportIntroSource(userId: nil, displayName: "Grace", username: "grace",
                                            presence: .away, servedRelationLevel: "CLOSE")

        let projected = await StoryExportIntroFactory.content(for: source)

        XCTAssertEqual(projected.presence, .away)
        XCTAssertEqual(projected.relationLogo, "🔥")
    }

    func test_content_atFriendLevelAndBelow_paintsNoLogo() async {
        for level in ["FRIEND", "ACQUAINTANCE", "COMMUNITY", "PUBLIC", "", "inconnu"] {
            let source = StoryExportIntroSource(userId: nil, displayName: "Grace", username: "grace",
                                                servedRelationLevel: level)
            let projected = await StoryExportIntroFactory.content(for: source)
            XCTAssertNil(projected.relationLogo, "niveau \(level)")
        }
    }

    func test_content_withoutServedPresence_projectsNoPresence() async {
        let source = StoryExportIntroSource(userId: nil, displayName: "Grace", username: "grace")

        let projected = await StoryExportIntroFactory.content(for: source)

        XCTAssertNil(projected.presence)
        XCTAssertNil(projected.relationLogo)
    }

    func test_unresolvedContent_keepsPresenceAndLogo_noWaitingIsNeededForThem() {
        let source = StoryExportIntroSource(userId: nil, displayName: "Grace", username: "grace",
                                            presence: .idle, servedRelationLevel: "BLOOD")

        let sober = StoryExportIntroFactory.unresolvedContent(for: source)

        XCTAssertEqual(sober.presence, .idle)
        XCTAssertEqual(sober.relationLogo, "🩸")
    }

    /// Sa PROPRE story : soi est toujours visible, donc en ligne ; jamais de logo sur soi.
    func test_signedInUserSource_isOnline_andNeverWearsACircleLogo() {
        let me = MeeshyUser(id: "u-me", username: "moi", displayName: "Moi")

        let source = StoryExportIntroFactory.source(forSignedInUser: me)

        XCTAssertEqual(source.presence, .online)
        XCTAssertNil(source.servedRelationLevel)
        XCTAssertEqual(source.userId, "u-me")
        XCTAssertEqual(source.username, "moi")
    }

    // MARK: - Helpers

    private struct Pixel { let red: Int; let green: Int; let blue: Int }

    private func pixel(of image: CGImage, x: Int, y: Int) -> Pixel? {
        var data = [UInt8](repeating: 0, count: 4)
        guard let context = CGContext(data: &data, width: 1, height: 1,
                                      bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        context.draw(image, in: CGRect(x: -x, y: -(image.height - 1 - y),
                                       width: image.width, height: image.height))
        return Pixel(red: Int(data[0]), green: Int(data[1]), blue: Int(data[2]))
    }

    private func bytes(of image: CGImage) throws -> [UInt8] {
        let width = image.width, height = image.height
        var data = [UInt8](repeating: 0, count: width * height * 4)
        let context = try XCTUnwrap(CGContext(data: &data, width: width, height: height,
                                              bitsPerComponent: 8, bytesPerRow: width * 4,
                                              space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return data
    }

    /// Étendue horizontale de ce que `image` peint dans la ligne du nom et que `baseline`
    /// (même rendu, nom vide) ne peint pas : le fond s'annule exactement.
    private func inkExtent(of image: CGImage, against baseline: CGImage) throws -> (minX: Int, maxX: Int, width: Int) {
        let ink = try bytes(of: image), base = try bytes(of: baseline)
        let band = 258..<280
        let columns = (0..<image.width).filter { x in
            band.contains { y in
                let i = (y * image.width + x) * 4
                return (0..<3).contains { abs(Int(ink[i + $0]) - Int(base[i + $0])) > 30 }
            }
        }
        let minX = try XCTUnwrap(columns.min()), maxX = try XCTUnwrap(columns.max())
        return (minX, maxX, maxX - minX)
    }
}
