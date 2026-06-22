import XCTest
@testable import Meeshy
import MeeshySDK

/// Éditer une pièce jointe audio doit REMPLACER le chip existant dans la zone
/// de composition — jamais en créer un second (même contrat que l'éditeur
/// d'image : remplacement par id). Reproduit le bug « deux audio dans les
/// attachements » signalé sur le composeur de message.
@MainActor
final class ConversationComposerStateTests: XCTestCase {

    private func makeStateWithAudio(
        attachmentId: String = "audio-1",
        originalURL: URL = URL(fileURLWithPath: "/tmp/original.m4a"),
        durationMs: Int = 3000
    ) -> ConversationComposerState {
        var state = ConversationComposerState()
        state.pendingAttachments = [
            MessageAttachment(id: attachmentId, mimeType: "audio/mp4", duration: durationMs, channels: 2)
        ]
        state.pendingMediaFiles[attachmentId] = originalURL
        return state
    }

    func test_applyEditedAudio_replacesChipInPlace_doesNotAppend() {
        var state = makeStateWithAudio(attachmentId: "audio-1")

        state.applyEditedAudio(
            attachmentId: "audio-1",
            editedURL: URL(fileURLWithPath: "/tmp/edited.m4a"),
            durationMs: 1800
        )

        XCTAssertEqual(state.pendingAttachments.count, 1)
        XCTAssertEqual(state.pendingAttachments.first?.id, "audio-1")
        XCTAssertEqual(state.pendingAttachments.first?.type, .audio)
    }

    func test_applyEditedAudio_updatesDurationOfReplacedChip() {
        var state = makeStateWithAudio(attachmentId: "audio-1", durationMs: 3000)

        state.applyEditedAudio(
            attachmentId: "audio-1",
            editedURL: URL(fileURLWithPath: "/tmp/edited.m4a"),
            durationMs: 1800
        )

        XCTAssertEqual(state.pendingAttachments.first?.duration, 1800)
    }

    func test_applyEditedAudio_routesMediaFileToEditedFile() {
        let edited = URL(fileURLWithPath: "/tmp/edited.m4a")
        var state = makeStateWithAudio(attachmentId: "audio-1")

        state.applyEditedAudio(attachmentId: "audio-1", editedURL: edited, durationMs: 1800)

        XCTAssertEqual(state.pendingMediaFiles["audio-1"], edited)
    }

    func test_applyEditedAudio_returnsStaleURLForCleanup() {
        let original = URL(fileURLWithPath: "/tmp/original.m4a")
        var state = makeStateWithAudio(attachmentId: "audio-1", originalURL: original)

        let stale = state.applyEditedAudio(
            attachmentId: "audio-1",
            editedURL: URL(fileURLWithPath: "/tmp/edited.m4a"),
            durationMs: 1800
        )

        XCTAssertEqual(stale, original)
    }

    func test_applyEditedAudio_clampsTinyDurationToFloor() {
        var state = makeStateWithAudio(attachmentId: "audio-1")

        state.applyEditedAudio(
            attachmentId: "audio-1",
            editedURL: URL(fileURLWithPath: "/tmp/edited.m4a"),
            durationMs: 100
        )

        XCTAssertEqual(state.pendingAttachments.first?.duration, 500)
    }

    func test_applyEditedAudio_unknownAttachment_appendsSingleChip() {
        var state = ConversationComposerState()

        state.applyEditedAudio(
            attachmentId: "audio-new",
            editedURL: URL(fileURLWithPath: "/tmp/edited.m4a"),
            durationMs: 2000
        )

        XCTAssertEqual(state.pendingAttachments.count, 1)
        XCTAssertEqual(state.pendingAttachments.first?.id, "audio-new")
        XCTAssertEqual(state.pendingAttachments.first?.type, .audio)
    }
}
