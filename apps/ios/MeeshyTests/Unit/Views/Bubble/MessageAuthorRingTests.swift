import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #10713 — le contour d'avatar équipé de l'auteur se dessine sur son avatar dans le fil :
/// en bulles (pied de la bulle), en Focal et en Script (en-tête d'identité), dans
/// l'empreinte de l'avatar — rien ne grandit, et sa couche animée y joue (#10815, sous le
/// plafond des films vivants de `LottieLiveBudget`).
@MainActor
final class MessageAuthorRingTests: XCTestCase {

    private static let filet = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)

    func test_resolve_builtinRingOfTheAuthor_isDrawable() throws {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "p1", content: "Salut", senderRing: Self.filet)
        let design = try XCTUnwrap(ProfileDecorResolver.ring(message.senderRing))
        XCTAssertEqual(design, AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "filet"))
    }

    func test_resolve_noRing_drawsTheAvatarAsBefore() {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "p1", content: "Salut")
        XCTAssertNil(ProfileDecorResolver.ring(message.senderRing))
    }

    func test_senderIdentity_ringChangesTheFooterModel() throws {
        let design = try XCTUnwrap(ProfileDecorResolver.ring(Self.filet))
        let bare = SenderIdentity(name: "Ama", username: nil, role: nil, avatarURL: nil, accentColor: "6366F1",
                                  moodEmoji: nil, presence: nil, storyRing: .none)
        var ringed = bare
        ringed.ring = design
        XCTAssertNotEqual(bare, ringed, "un contour qui arrive doit repeindre le pied de la bulle")
    }

    // MARK: - Gardes de montage

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func source(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.appRoot.appendingPathComponent(path), encoding: .utf8))
    }

    func test_guard_bubbleFooterDrawsTheRingWithinTheAvatarFootprint() throws {
        let footer = try source("Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift")
        XCTAssertTrue(footer.contains(".avatarRingWithin(sender.ring, footprint: AvatarContext.messageBubble.size"))
        let layout = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Footer.swift")
        XCTAssertTrue(layout.contains("ring: ProfileDecorResolver.ring(message.senderRing)"))
    }

    func test_guard_focalAndScriptHeaderDrawTheRingWithinTheAvatarFootprint() throws {
        let header = try source("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertTrue(header.contains(".avatarRingWithin(senderRing, footprint: avatarSize"))
        let row = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertEqual(row.components(separatedBy: "senderRing: input.senderRing").count - 1, 2, "les deux en-têtes de la rangée plate")
        let rows = try source("Meeshy/Features/Main/Views/MessageListViewController+Rows.swift")
        XCTAssertTrue(rows.contains("senderRing: isMine ? nil : ProfileDecorResolver.ring(message.senderRing)"))
    }

    /// Décision porteur 2026-10-16 (#10815) : tout décor animé s'anime partout, listes comprises.
    /// Le plafond des films vivants (`LottieLiveBudget`) borne ce qui joue ; aucune surface ne
    /// fige son décor d'elle-même.
    func test_guard_noDecorSurfaceFreezesItsAnimatedLayer() throws {
        let surfaces = [
            "Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift",
            "Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift",
            "Meeshy/Features/Main/Views/ThemedConversationRow.swift",
            "Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift",
            "Meeshy/Features/Main/Views/ParticipantsView.swift",
            "Meeshy/Features/Main/Components/ConversationInfoSheet.swift",
            "Meeshy/Features/Main/Views/ProfileDecorSheet.swift",
        ]
        for path in surfaces {
            let text = try source(path)
            XCTAssertTrue(text.contains("avatarRing"), "\(path) pose un contour")
            XCTAssertFalse(text.contains("animates: false"), "\(path) ne fige pas son décor (#10815)")
        }
    }

    /// Les vignettes des fonds du sélecteur d'apparence jouent leur couche, comme le fond lui-même.
    func test_guard_appearanceThumbnailsMountTheirAnimatedLayer() throws {
        let sheet = try source("Meeshy/Features/Main/Components/ConversationAppearanceSheet.swift")
        XCTAssertTrue(sheet.contains("PackLottieLayer(ref: lottie, contentMode: .fill)"))
    }
}
