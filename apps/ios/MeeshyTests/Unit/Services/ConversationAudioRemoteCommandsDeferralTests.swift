import XCTest
import MediaPlayer
@testable import Meeshy
import MeeshySDK

/// #11558 — `MPRemoteCommandCenter` (XPC vers `mediaremoted`) ne se touche plus
/// au montage de la racine : les transports système s'installent quand un
/// vocal a quelque chose à jouer, et une seule fois.
@MainActor
final class ConversationAudioRemoteCommandsDeferralTests: XCTestCase {

    override func tearDown() async throws {
        CallManager.shared.testOverrideCallActive = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try await super.tearDown()
    }

    private func makeQueuedAudio(_ attachmentId: String) -> QueuedAudio {
        QueuedAudio(
            attachmentId: attachmentId,
            messageId: "msg-\(attachmentId)",
            conversationId: "conv-1",
            fileUrl: "https://cdn/\(attachmentId).m4a",
            durationMs: 5_000,
            senderName: "Alice",
            senderAvatarURL: nil,
            receivedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func play(_ sut: ConversationAudioCoordinator) {
        sut.play(current: makeQueuedAudio("a1"), tail: [], conversationName: "Conv", conversationArtworkURL: nil)
    }

    func test_activate_withNothingToPlay_leavesTheRemoteCommandCenterAlone() {
        let sut = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())

        sut.activateNowPlayingBridge()

        XCTAssertTrue(sut._remoteCommandTokens.isEmpty)
    }

    func test_firstAudioToPlay_installsTheRemoteCommands() {
        let sut = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        sut.activateNowPlayingBridge()

        play(sut)

        XCTAssertEqual(sut._remoteCommandTokens.count, 5)
    }

    func test_secondAudio_doesNotInstallTheCommandsTwice() {
        let sut = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        sut.activateNowPlayingBridge()
        play(sut)

        sut.play(current: makeQueuedAudio("a2"), tail: [], conversationName: "Conv", conversationArtworkURL: nil)

        XCTAssertEqual(sut._remoteCommandTokens.count, 5)
    }

    func test_activate_withAudioAlreadyPlaying_installsTheCommandsAtOnce() {
        let sut = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        play(sut)

        sut.activateNowPlayingBridge()

        XCTAssertEqual(sut._remoteCommandTokens.count, 5)
    }

    func test_commandsInstalledDuringACall_stayDisarmed() {
        let sut = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        sut.activateNowPlayingBridge()
        sut.suspendForSystemCall()

        play(sut)

        XCTAssertEqual(sut._remoteCommandTokens.count, 5)
        XCTAssertFalse(MPRemoteCommandCenter.shared().playCommand.isEnabled)
    }
}
