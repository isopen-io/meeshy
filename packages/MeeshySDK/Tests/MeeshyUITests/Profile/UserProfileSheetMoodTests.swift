import XCTest
import SwiftUI
@testable import MeeshyUI

/// L'humeur sur l'avatar d'une feuille de profil — le grand en-tête ET la
/// barre compacte qui le remplace au défilement (#10529) — et sur l'avatar
/// d'un message en mode bulles, où elle ne s'anime pas.
@MainActor
final class UserProfileSheetMoodTests: XCTestCase {

    func test_shownMood_withAMood_returnsTheEmoji() {
        XCTAssertEqual(UserProfileSheet.shownMood("🎉", isBlockedByTarget: false), "🎉")
    }

    func test_shownMood_whenBlockedByTarget_returnsNil() {
        XCTAssertNil(UserProfileSheet.shownMood("🎉", isBlockedByTarget: true))
    }

    func test_shownMood_withAnEmptyEmoji_returnsNil() {
        XCTAssertNil(UserProfileSheet.shownMood("", isBlockedByTarget: false))
        XCTAssertNil(UserProfileSheet.shownMood(nil, isBlockedByTarget: false))
    }

    func test_header_paintsTheMoodOnTheTravellingAvatar() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Profile
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertEqual(
            code.components(separatedBy: "moodEmoji: shownMoodEmoji,").count - 1, 1,
            "un seul avatar voyage du héros à la barre repliée (K28, #19410) : il porte l'humeur aux deux tailles"
        )
        XCTAssertEqual(
            code.components(separatedBy: "onMoodTap: shownMoodEmoji == nil ? nil : onMoodTap").count - 1, 1,
            "l'avatar ouvre l'humeur au toucher, et jamais sans humeur"
        )
    }

    func test_messageBubbleContext_showsTheMoodWithoutAnimation() {
        let context = AvatarContext.messageBubble
        XCTAssertTrue(context.showsMoodBadge)
        XCTAssertEqual(
            MeeshyMoodBadge.motion(animates: context.animatesMoodBadge, reduceMotion: false, hushed: false),
            .still
        )
    }

    func test_compactBarContext_showsTheMoodWithoutAnimation() {
        let context = AvatarContext.custom(32)
        XCTAssertTrue(context.showsMoodBadge)
        XCTAssertEqual(
            MeeshyMoodBadge.motion(animates: context.animatesMoodBadge, reduceMotion: false, hushed: false),
            .still
        )
    }

    func test_messageBubbleMood_keepsA44PointTarget() {
        let badge = AvatarContext.messageBubble.size * 0.42
        XCTAssertGreaterThanOrEqual(MeeshyMoodBadge.hitDiameter(diameter: badge), 44)
    }
}
