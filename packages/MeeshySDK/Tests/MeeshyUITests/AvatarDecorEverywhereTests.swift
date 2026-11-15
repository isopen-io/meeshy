import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'avatar d'une personne porte son contour équipé et sa présence servie, partout** (#10946, #10955/#10956).
/// `MeeshyAvatar` est le SEUL composant qui prend la référence de contour (`ring:`) et la résout par le
/// catalogue ; aucun contexte ne retire plus la présence servie (`AvatarContext.showsOnlineDot` a disparu).
@MainActor
final class AvatarDecorEverywhereTests: XCTestCase {

    private func ring(_ item: String) -> ServedProfileDecorItem {
        ServedProfileDecorItem(pack: "contours-essentiels", item: item, origin: .builtin)
    }

    private static let formerlyDotless: [AvatarContext] = [
        .storyViewer, .postComment, .postReaction, .typingIndicator, .profileEdit, .notification,
    ]

    // MARK: Contour

    func test_ring_aServedReferenceResolvesToItsDesign() {
        let avatar = MeeshyAvatar(name: "Ana", context: .postAuthor, ring: ring("aurore"))
        XCTAssertEqual(avatar.ringDesign?.stroke.style, .gradient)
    }

    func test_ring_withoutReference_orUnknown_orForAnEntity_paintsNothing() {
        XCTAssertNil(MeeshyAvatar(name: "Ana", context: .postAuthor).ringDesign)
        XCTAssertNil(MeeshyAvatar(name: "Ana", context: .postAuthor, ring: ring("inconnu")).ringDesign)
        XCTAssertNil(MeeshyAvatar(name: "Groupe", context: .conversationList, kind: .entity, ring: ring("aurore")).ringDesign)
    }

    func test_ring_isPaintedInEveryContext_listsComprised() {
        for context in Self.formerlyDotless + [.conversationList, .userListItem, .messageBubble, .storyTray] {
            XCTAssertNotNil(MeeshyAvatar(name: "Ana", context: context, ring: ring("aurore")).ringDesign, "\(context.size)")
        }
    }

    // MARK: Présence (#10955 : oui, partout)

    func test_presence_isPaintedInTheContextsThatUsedToHideIt() {
        for context in Self.formerlyDotless {
            let avatar = MeeshyAvatar(name: "Ana", context: context, presenceState: .online)
            XCTAssertEqual(avatar.shownPresence, .presence(.online), "contexte de \(context.size) pt")
        }
    }

    func test_presence_absentOrOffline_paintsNothing_andAnEntityNever() {
        XCTAssertNil(MeeshyAvatar(name: "Ana", context: .postComment).shownPresence)
        XCTAssertNil(MeeshyAvatar(name: "Ana", context: .notification, presenceState: .offline).shownPresence)
        XCTAssertNil(MeeshyAvatar(name: "G", context: .conversationList, kind: .entity, presenceState: .online).shownPresence)
    }

    // MARK: Taille du point : ratio 0,26, plancher 6 pt

    func test_dotDiameter_keepsTheRatio_withASixPointFloor() {
        XCTAssertEqual(AvatarPresenceDot.presence(.online).diameter(avatarSize: 44), 44 * 0.26, accuracy: 0.001)
        XCTAssertEqual(AvatarPresenceDot.presence(.online).diameter(avatarSize: 20), 6)
        XCTAssertEqual(AvatarPresenceDot.presence(.away).diameter(avatarSize: 24), 6.24, accuracy: 0.001)
        XCTAssertEqual(AvatarPresenceDot.here.diameter(avatarSize: 16), 6)
        XCTAssertEqual(AvatarPresenceDot.minimumDiameter, 6)
    }
}
