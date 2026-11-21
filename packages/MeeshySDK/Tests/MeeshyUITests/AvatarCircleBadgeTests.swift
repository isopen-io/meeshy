import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// La pastille de cercle (#20178) : en bas à gauche de l'avatar d'une personne de mes cercles, la présence restant en
/// bas à droite. Rien hors cercle, rien sans donnée servie, un seul site de rendu.
@MainActor
final class AvatarCircleBadgeTests: XCTestCase {

    func test_shownLevel_outsideAnyCircle_isNil() {
        XCTAssertNil(AvatarCircleBadge.shownLevel(nil))
        XCTAssertNil(AvatarCircleBadge.shownLevel(.public))
    }

    func test_shownLevel_forEveryCircle_isThatCircle() {
        for level in [RelationLevel.community, .acquaintance, .friend, .close, .blood] {
            XCTAssertEqual(AvatarCircleBadge.shownLevel(level), level)
        }
    }

    func test_glyph_isTheAudienceGlyphOfTheSameCircle() {
        XCTAssertEqual(AvatarCircleBadge.glyph(.community), PostVisibility.community.icon)
        XCTAssertEqual(AvatarCircleBadge.glyph(.acquaintance), PostVisibility.acquaintances.icon)
        XCTAssertEqual(AvatarCircleBadge.glyph(.friend), PostVisibility.friends.icon)
        XCTAssertEqual(AvatarCircleBadge.glyph(.close), PostVisibility.close.icon)
        XCTAssertEqual(AvatarCircleBadge.glyph(.blood), PostVisibility.blood.icon)
    }

    func test_offset_mirrorsThePresenceDot_onTheLeadingSide() {
        let presence = AvatarPresenceDot.centerOffset(avatarSize: 52, frameSize: 52, dotDiameter: 14)
        let circle = AvatarCircleBadge.centerOffset(avatarSize: 52, frameSize: 52, diameter: 14)
        XCTAssertEqual(circle.width, -presence.width, accuracy: 0.001)
        XCTAssertEqual(circle.height, presence.height, accuracy: 0.001)
    }

    func test_isDrawn_onlyOnAnAvatarLargeEnoughToReadTheGlyph() {
        XCTAssertFalse(AvatarCircleBadge.isDrawn(avatarSize: AvatarCircleBadge.minimumAvatarSize - 1))
        XCTAssertTrue(AvatarCircleBadge.isDrawn(avatarSize: AvatarCircleBadge.minimumAvatarSize))
    }

    func test_diameter_staysAPastille_fromTheRowToTheProfileHero() {
        XCTAssertEqual(AvatarCircleBadge.diameter(avatarSize: 28), AvatarCircleBadge.minimumDiameter)
        XCTAssertEqual(AvatarCircleBadge.diameter(avatarSize: 52), 52 * AvatarCircleBadge.ratio, accuracy: 0.001)
        XCTAssertEqual(AvatarCircleBadge.diameter(avatarSize: 160), AvatarCircleBadge.maximumDiameter)
    }

    func test_levels_resolveOnlyTheServedPeople() {
        let levels = AvatarCircleLevels(["u1": .friend, "u2": .public])
        XCTAssertEqual(levels.level(for: "u1"), .friend)
        XCTAssertNil(levels.level(for: "u2"))
        XCTAssertNil(levels.level(for: "u3"))
        XCTAssertNil(levels.level(for: nil))
        XCTAssertNil(levels.level(for: ""))
        XCTAssertNil(AvatarCircleLevels.none.level(for: "u1"))
    }

    func test_spokenName_carriesTheCircle() {
        let spoken = MeeshyAvatar.spokenName(name: "Nour", moodEmoji: nil, isHere: false, circle: .close)
        XCTAssertTrue(spoken.hasPrefix("Nour, "))
        XCTAssertTrue(spoken.contains(AvatarCircleBadge.spoken(.close)))
    }

    func test_spokenName_withoutCircle_isUnchanged() {
        XCTAssertEqual(MeeshyAvatar.spokenName(name: "Nour", moodEmoji: nil, isHere: false, circle: nil), "Nour")
    }

    /// Un seul site de rendu : la pastille se peint dans `MeeshyAvatar`, et aucune autre vue du SDK ne la redessine.
    func test_theBadge_isDrawnByTheAvatarOnly() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI")
        let enumerator = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)
        var drawers: [String] = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let source = try String(contentsOf: url, encoding: .utf8)
            if source.contains("AvatarCircleBadgeView(") { drawers.append(url.lastPathComponent) }
        }
        XCTAssertEqual(drawers.sorted(), ["AvatarCircleBadge.swift", "MeeshyAvatar.swift"])
    }
}
