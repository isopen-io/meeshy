import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Les signes posés à côté du grand avatar d'une fiche (#20178) : la batterie et l'écoute, en ICÔNES — comme la
/// présence —, seulement quand l'app les sert, et jamais sur ma propre fiche.
@MainActor
final class ProfileHeroSignalsTests: XCTestCase {

    func test_signals_needAnotherPersonAndALargeAvatar() {
        XCTAssertFalse(ProfileHeroSignals.isShown(userId: nil, avatarSize: 120))
        XCTAssertFalse(ProfileHeroSignals.isShown(userId: "", avatarSize: 120))
        XCTAssertFalse(ProfileHeroSignals.isShown(userId: "u1", avatarSize: ProfileHeroSignals.minimumAvatarSize - 1))
        XCTAssertTrue(ProfileHeroSignals.isShown(userId: "u1", avatarSize: 120))
    }

    func test_theHero_drawsTheCircleOfThePerson_andTheSignalsBesideIt() throws {
        let header = try source("Profile/UserProfileSheet+Header.swift")
        XCTAssertTrue(header.contains("circleUserId: isIdentityMuted || isCurrentUser ? nil : resolvedUserId"))
        XCTAssertTrue(header.contains("ProfileHeroSignals("))
        XCTAssertFalse(header.contains("ProfileAvatarListening("), "l'écoute passe par les signes, un seul site")
    }

    /// Repliée, l'écoute est une icône : la note et l'égaliseur, sans texte ; le toucher la déplie sur ce qui est
    /// écouté.
    func test_listening_isAnIconUntilExpanded() throws {
        let listening = try source("Profile/AvatarListeningSource.swift")
        XCTAssertFalse(listening.contains("ProfileListeningCopy.now)"))
        XCTAssertTrue(listening.contains("if isExpanded"))
    }

    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent("Sources/MeeshyUI/\(path)"), encoding: .utf8)
    }
}
