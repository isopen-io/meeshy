import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'aperçu d'une conversation tenue longuement se dessine dans son mode de
/// lecture** (#11213, décision #11204).
///
/// Il dessinait toujours des bulles, quel que soit le mode du fil : une
/// conversation lue en Script montrait, sous le doigt, une face que le fil ne
/// montre jamais. La face se lit désormais à une loi pure — rangées plates en
/// Script et en Focal, bulles en Bulles — et les modes qui ne montrent pas le
/// fil (Résumé, Rivière) s'y posent en Script, comme « Aller au message ».
@MainActor
final class ConversationRecentMessagesPreviewTests: XCTestCase {

    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func message(
        _ id: String,
        senderId: String = "u-other",
        isMe: Bool = false,
        isEncrypted: Bool = false,
        content: String = "Bonjour",
        offset: TimeInterval = 0
    ) -> Message {
        var message = Message(
            id: id, conversationId: "c1", senderId: senderId, content: content,
            isEncrypted: isEncrypted, createdAt: start.addingTimeInterval(offset)
        )
        message.isMe = isMe
        return message
    }

    // MARK: - La face suit le mode de lecture

    func test_kind_script_isTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .script), .flatRow)
    }

    func test_kind_focal_isTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .focal), .flatRow)
    }

    func test_kind_bubbles_isTheBubble() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .bubbles), .bubble)
    }

    /// Le Résumé et la Rivière ne montrent pas le fil : l'aperçu, qui montre
    /// des messages, s'y pose comme « Aller au message » — en Script.
    func test_kind_summary_landsOnTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .summary), .flatRow)
    }

    func test_kind_river_landsOnTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .river), .flatRow)
    }

    /// La loi est `landing` puis `usesFlatRow`, cas pour cas — jamais une table
    /// recopiée qui dériverait à l'ajout d'un mode.
    func test_kind_matchesTheLandedThreadRowForEveryMode() {
        for mode in ConversationReadingMode.allCases {
            let landed = ReadingModeController.landing(.init(mode: mode, reason: .default)).mode
            XCTAssertEqual(ConversationPreviewRenderer.kind(mode: mode) == .flatRow, landed.usesFlatRow, "\(mode)")
        }
    }

    /// La densité est celle que la cellule du fil reçoit.
    func test_density_followsTheThreadCell() {
        XCTAssertEqual(ConversationPreviewRenderer.density(mode: .script), .script)
        XCTAssertEqual(ConversationPreviewRenderer.density(mode: .focal), .focal)
    }

    // MARK: - Le groupement : un auteur, une identité

    func test_layout_threeConsecutiveMessagesFromOneAuthor_showOneBubbleIdentity() {
        let messages = [message("m1", offset: 0), message("m2", offset: 30), message("m3", offset: 60)]

        let layout = ConversationPreviewRenderer.layout(of: messages)

        XCTAssertEqual(layout.filter { $0.showsIdentity(kind: .bubble, isDirect: false) }.count, 1)
        XCTAssertEqual(layout.last?.isLastInGroup, true)
        XCTAssertEqual(layout.first?.isLastInGroup, false)
    }

    func test_layout_threeConsecutiveMessagesFromOneAuthor_showOneFlatRowIdentity() {
        let messages = [message("m1", offset: 0), message("m2", offset: 30), message("m3", offset: 60)]

        let layout = ConversationPreviewRenderer.layout(of: messages)

        XCTAssertEqual(layout.filter { $0.showsIdentity(kind: .flatRow, isDirect: false) }.count, 1)
        XCTAssertEqual(layout.first?.isFirstInGroup, true)
        XCTAssertEqual(layout.last?.isFirstInGroup, false)
    }

    func test_layout_alternatingAuthors_eachOpensItsGroup() {
        let messages = [
            message("m1", senderId: "a", offset: 0),
            message("m2", senderId: "b", offset: 30),
            message("m3", senderId: "a", offset: 60)
        ]

        let layout = ConversationPreviewRenderer.layout(of: messages)

        XCTAssertEqual(layout.map(\.isFirstInGroup), [true, true, true])
        XCTAssertEqual(layout.map(\.isLastInGroup), [true, true, true])
    }

    /// En conversation directe, la bulle ne porte pas l'identité de l'autre :
    /// comme le fil (`BubbleStandardLayout.showIdentityBar`).
    func test_layout_direct_bubbleShowsNoIdentity() {
        let layout = ConversationPreviewRenderer.layout(of: [message("m1")])

        XCTAssertFalse(layout[0].showsIdentity(kind: .bubble, isDirect: true))
    }

    /// Mes propres bulles ne portent pas mon avatar.
    func test_layout_mine_bubbleShowsNoIdentity() {
        let layout = ConversationPreviewRenderer.layout(of: [message("m1", senderId: "me", isMe: true)])

        XCTAssertFalse(layout[0].showsIdentity(kind: .bubble, isDirect: false))
    }

    /// L'air sépare les SUITES, pas les messages d'une même suite.
    func test_gap_separatesGroupsOnly() {
        let messages = [
            message("m1", senderId: "a", offset: 0),
            message("m2", senderId: "a", offset: 30),
            message("m3", senderId: "b", offset: 60)
        ]
        let layout = ConversationPreviewRenderer.layout(of: messages)

        let gaps = layout.indices.map { ConversationPreviewRenderer.gap(before: layout[$0], isFirst: $0 == 0) }

        XCTAssertEqual(gaps, [0, 0, ConversationPreviewRenderer.rowSpacing])
        XCTAssertEqual(ConversationPreviewRenderer.rowSpacing, 12)
    }

    // MARK: - Les états : charger n'est jamais « vide »

    func test_display_loadingWithoutMessages_isTheSkeleton() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .loading, messageCount: 0), .skeleton)
    }

    func test_display_loading_isNeverTheEmptyState() {
        XCTAssertNotEqual(ConversationPreviewRenderer.display(phase: .loading, messageCount: 0), .empty)
    }

    /// Ce qui est servi reste à l'écran pendant que le réseau revalide.
    func test_display_loadingWithServedMessages_showsTheMessages() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .loading, messageCount: 3), .messages)
    }

    func test_display_emptyConstated_isTheEmptyState() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .empty, messageCount: 0), .empty)
    }

    func test_display_networkFailureWithoutCache_isUnavailable() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .unavailable, messageCount: 0), .unavailable)
    }

    // MARK: - Un message chiffré scellé se dit chiffré

    func test_isSealed_encryptedWithoutClearText_isSealed() {
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(message("m1", isEncrypted: true, content: "")))
    }

    func test_isSealed_encryptedDecryptedOnDevice_isReadable() {
        XCTAssertFalse(ConversationPreviewRenderer.isSealed(message("m1", isEncrypted: true, content: "Salut")))
    }

    func test_isSealed_clearMessage_isReadable() {
        XCTAssertFalse(ConversationPreviewRenderer.isSealed(message("m1", content: "")))
    }

    // MARK: - Les marges

    func test_contentWidth_keepsSixteenPointsOnEachSide() {
        XCTAssertEqual(ConversationPreviewRenderer.margin, 16)
        XCTAssertEqual(ConversationPreviewRenderer.contentWidth(cardWidth: 340), 308)
    }

    func test_contentWidth_neverNegative() {
        XCTAssertEqual(ConversationPreviewRenderer.contentWidth(cardWidth: 10), 0)
    }

    // MARK: - Le header : interactif ou non

    /// L'aperçu natif d'iOS 26 n'est pas interactif : ses boutons y seraient
    /// inertes. Il ne garde que ce qui SE LIT — non-lus, chiffrement, sourdine.
    func test_headerControls_nonInteractive_keepsOnlyTheIndicators() {
        XCTAssertFalse(ConversationPreviewRenderer.showsHeaderActions(isInteractive: false))
        XCTAssertTrue(ConversationPreviewRenderer.showsHeaderActions(isInteractive: true))
    }

    func test_headerTarget_isAtLeastFortyFourPoints() {
        XCTAssertGreaterThanOrEqual(ConversationPreviewRenderer.headerTargetSize, 44)
    }

    func test_isEndToEnd_readsTheConversationEncryptionMode() {
        var conversation = Conversation(id: "c1", identifier: "c1", type: .group, title: "T",
                                        lastMessageAt: start, createdAt: start, updatedAt: start)
        XCTAssertFalse(ConversationPreviewRenderer.isEndToEnd(conversation))
        conversation.encryptionMode = "e2ee"
        XCTAssertTrue(ConversationPreviewRenderer.isEndToEnd(conversation))
    }

    // MARK: - Le repli < iOS 26 : l'entrée sous Réduire les animations

    func test_entrance_reduceMotion_neverStartsFromTheRow() {
        XCTAssertFalse(ConversationPreviewEntranceMotion.emergesFromRow(reduceMotion: true))
        XCTAssertTrue(ConversationPreviewEntranceMotion.emergesFromRow(reduceMotion: false))
    }

    func test_entrance_reduceMotion_hasNoBlur() {
        XCTAssertEqual(ConversationPreviewEntranceMotion.blurRadius(previewScale: 0.3, reduceMotion: true), 0)
        XCTAssertGreaterThan(ConversationPreviewEntranceMotion.blurRadius(previewScale: 0.3, reduceMotion: false), 0)
    }

    func test_entrance_blur_isNeverNegativeOnOvershoot() {
        XCTAssertEqual(ConversationPreviewEntranceMotion.blurRadius(previewScale: 1.2, reduceMotion: false), 0)
    }

    func test_placement_reduceMotion_startsInPlace() {
        let start = ConversationPreviewEntranceMotion.placement(
            source: CGRect(x: 0, y: 500, width: 393, height: 76), rest: CGRect(x: 0, y: 100, width: 340, height: 380), reduceMotion: true
        )

        XCTAssertEqual(start.scale, 1.0)
        XCTAssertEqual(start.offset, 0)
    }

    /// La carte part de la ligne pressée : réduite à la hauteur de la ligne,
    /// son centre visuel posé sur celui de la ligne.
    func test_placement_fromTheRow_centersOnThePressedRow() {
        let rest = CGRect(x: 0, y: 100, width: 340, height: 380)
        let source = CGRect(x: 0, y: 500, width: 393, height: 76)

        let start = ConversationPreviewEntranceMotion.placement(source: source, rest: rest, reduceMotion: false)

        XCTAssertEqual(start.scale, 0.22, accuracy: 0.0001, "76 / 380 = 0.2, relevé au plancher 0.22")
        XCTAssertEqual(rest.maxY - start.scale * rest.height / 2 + start.offset, source.midY, accuracy: 0.0001)
    }

    func test_placement_unknownRow_zoomsFromTheCenter() {
        let start = ConversationPreviewEntranceMotion.placement(source: nil, rest: CGRect(x: 0, y: 0, width: 340, height: 380), reduceMotion: false)

        XCTAssertEqual(start.scale, 0.7)
        XCTAssertEqual(start.offset, 0)
    }

    func test_entrance_menuRise_isNullUnderReduceMotion() {
        XCTAssertEqual(ConversationPreviewEntranceMotion.menuRestOffset(reduceMotion: true), 0)
        XCTAssertGreaterThan(ConversationPreviewEntranceMotion.menuRestOffset(reduceMotion: false), 0)
    }

    /// Le ressort de pression de la rangée : à peine perceptible, à la
    /// iMessage — la rangée s'enfonce, elle ne rétrécit pas.
    func test_rowPress_scale_isASubtleSpring() {
        XCTAssertEqual(ConversationRowMetrics.pressedScale, 0.97)
    }
}
