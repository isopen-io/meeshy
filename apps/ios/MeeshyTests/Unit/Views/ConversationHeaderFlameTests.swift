import XCTest
import SwiftUI
@testable import Meeshy

// MARK: - L'en-tête de l'aperçu et la flamme du jour (#9031)

// Demande porteur du 2026-10-01 : dans l'aperçu tiré d'une notification, le
// bouton « agrandir » remplace la loupe, et l'avatar montre la pile des plus
// actifs puis l'interlocuteur ou le groupe. Sous l'avatar de l'en-tête replié,
// une flamme porte les points du jour ; elle rejoue son effet à chaque envoi,
// disparaît au toucher et revient après un dépliement. Le dépliement et le
// masquage sont retenus par conversation, sur l'appareil.
@MainActor
final class ConversationHeaderFlameTests: XCTestCase {

    // MARK: - La disposition

    func test_resolve_previewMode_showsTheIdentityAvatars() {
        XCTAssertTrue(ConversationHeaderLayout.resolve(previewMode: true, showOptions: false).avatarShowsIdentity)
    }

    func test_resolve_fullConversationFolded_showsTheSingleAvatarWithItsFlame() {
        XCTAssertFalse(ConversationHeaderLayout.resolve(previewMode: false, showOptions: false).avatarShowsIdentity)
    }

    func test_resolve_fullConversationUnfolded_showsTheIdentityAvatars() {
        XCTAssertTrue(ConversationHeaderLayout.resolve(previewMode: false, showOptions: true).avatarShowsIdentity)
    }

    func test_headerButtonsCluster_previewPutsOpenFullInTheSearchSlot() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertTrue(source.contains("searchButton: { previewMode ? openFullConversationButton : expandedHeaderSearchButton }"))
        XCTAssertFalse(source.contains("cluster; openFullConversationButton"),
                       "« agrandir » remplace la loupe, il ne s'ajoute plus après elle")
    }

    // MARK: - La visibilité de la flamme

    func test_isShown_foldedWithPointsAndNotDismissed_showsTheFlame() {
        XCTAssertTrue(HeaderFlameVisibility.isShown(headerExpanded: false, dismissed: false, hasEngagement: true))
    }

    func test_isShown_unfolded_hidesTheFlame() {
        XCTAssertFalse(HeaderFlameVisibility.isShown(headerExpanded: true, dismissed: false, hasEngagement: true))
    }

    func test_isShown_dismissed_hidesTheFlame() {
        XCTAssertFalse(HeaderFlameVisibility.isShown(headerExpanded: false, dismissed: true, hasEngagement: true))
    }

    func test_isShown_withoutEngagement_hidesTheFlame() {
        XCTAssertFalse(HeaderFlameVisibility.isShown(headerExpanded: false, dismissed: false, hasEngagement: false))
    }

    func test_dismissed_afterUnfolding_isCleared() {
        XCTAssertFalse(HeaderFlameVisibility.dismissed(afterHeaderExpanded: true, wasDismissed: true))
    }

    func test_dismissed_afterFolding_isKept() {
        XCTAssertTrue(HeaderFlameVisibility.dismissed(afterHeaderExpanded: false, wasDismissed: true))
        XCTAssertFalse(HeaderFlameVisibility.dismissed(afterHeaderExpanded: false, wasDismissed: false))
    }

    // MARK: - La trajectoire

    func test_pose_atRestBeforeAndAfter_staysInPlaceAtNaturalSize() {
        for progress in [CGFloat(0), 1] {
            let pose = HeaderFlameOrbit.pose(at: progress, radius: 28)
            XCTAssertEqual(pose.offset.width, 0, accuracy: 0.001)
            XCTAssertEqual(pose.offset.height, 0, accuracy: 0.001)
            XCTAssertEqual(pose.scale, 1, accuracy: 0.001)
        }
    }

    func test_pose_halfwayThroughTheTurn_isAboveTheAvatar() {
        let pose = HeaderFlameOrbit.pose(at: HeaderFlameOrbit.orbitShare / 2, radius: 28)
        XCTAssertEqual(pose.offset.width, 0, accuracy: 0.001)
        XCTAssertEqual(pose.offset.height, -56, accuracy: 0.001, "à mi-tour, la flamme passe au-dessus de l'avatar")
    }

    func test_pose_duringThePulse_growsInPlace() {
        let middleOfPulse = HeaderFlameOrbit.orbitShare + (1 - HeaderFlameOrbit.orbitShare) / 2
        let pose = HeaderFlameOrbit.pose(at: middleOfPulse, radius: 28)
        XCTAssertEqual(pose.offset, .zero)
        XCTAssertEqual(pose.scale, HeaderFlameOrbit.peakScale, accuracy: 0.001)
    }

    func test_glow_isOffAtRestAndBrightestMidway() {
        XCTAssertEqual(HeaderFlameOrbit.glowOpacity(at: 0), 0, accuracy: 0.001)
        XCTAssertEqual(HeaderFlameOrbit.glowOpacity(at: 1), 0, accuracy: 0.001)
        XCTAssertEqual(HeaderFlameOrbit.glowOpacity(at: 0.5), 1, accuracy: 0.001)
    }

    func test_pose_outOfRangeProgress_isClamped() {
        XCTAssertEqual(HeaderFlameOrbit.pose(at: -1, radius: 28), HeaderFlameOrbit.pose(at: 0, radius: 28))
        XCTAssertEqual(HeaderFlameOrbit.pose(at: 2, radius: 28), HeaderFlameOrbit.pose(at: 1, radius: 28))
    }

    // MARK: - La mémoire, par conversation

    private func makeSUT() -> (sut: ConversationHeaderMemory, defaults: UserDefaults) {
        let suite = "ConversationHeaderFlameTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return (ConversationHeaderMemory(defaults: defaults), defaults)
    }

    func test_memory_remembersTheUnfoldedHeaderPerConversation() {
        let (sut, _) = makeSUT()
        sut.setExpanded(true, for: "c1")

        XCTAssertTrue(sut.isExpanded("c1"))
        XCTAssertFalse(sut.isExpanded("c2"))
    }

    func test_memory_foldingForgetsTheUnfoldedHeader() {
        let (sut, _) = makeSUT()
        sut.setExpanded(true, for: "c1")
        sut.setExpanded(false, for: "c1")

        XCTAssertFalse(sut.isExpanded("c1"))
    }

    func test_memory_remembersTheDismissedFlameAcrossInstances() {
        let (sut, defaults) = makeSUT()
        sut.setFlameDismissed(true, for: "c1")

        let reopened = ConversationHeaderMemory(defaults: defaults)
        XCTAssertTrue(reopened.isFlameDismissed("c1"))
        XCTAssertFalse(reopened.isExpanded("c1"), "masquer la flamme ne déplie rien")
    }

    func test_memory_ignoresAnEmptyConversationId() {
        let (sut, defaults) = makeSUT()
        sut.setExpanded(true, for: "")

        XCTAssertNil(defaults.stringArray(forKey: ConversationHeaderMemory.expandedKey))
    }

    // MARK: - Le rejeu à chaque envoi

    func test_sendMessage_firesTheFlameReplayAfterTheEligibilityGuard() throws {
        let send = try String(contentsOf: Self.appFile("Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift"), encoding: .utf8)
        let code = AppSourceGuard.stripComments(send)
        guard let guardRange = code.range(of: "guard SendEligibility.canSend("),
              let replayRange = code.range(of: "HeaderFlameReplay.messageSent(in: conversationId)") else {
            return XCTFail("l'envoi doit signaler la flamme de sa conversation")
        }
        XCTAssertLessThan(guardRange.lowerBound, replayRange.lowerBound,
                          "un envoi refusé par la garde ne fait pas jouer la flamme")
    }

    func test_replaySignal_carriesTheConversationId() {
        var received: [String] = []
        let cancellable = HeaderFlameReplay.sent.sink { received.append($0) }
        HeaderFlameReplay.messageSent(in: "c42")
        cancellable.cancel()

        XCTAssertEqual(received, ["c42"])
    }

    private static func appFile(_ relative: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relative)
    }
}
