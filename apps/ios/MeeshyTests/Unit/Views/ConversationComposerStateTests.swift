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

    // MARK: - Vidéo éditée (#8443)

    private func makeStateWithVideo(attachmentId: String = "video-1",
                                    originalURL: URL = URL(fileURLWithPath: "/tmp/original.mp4"))
        -> ConversationComposerState {
        var state = ConversationComposerState()
        state.pendingAttachments = [
            MessageAttachment(id: attachmentId, mimeType: "video/mp4", width: 1080, height: 1920, duration: 9000)
        ]
        state.pendingMediaFiles[attachmentId] = originalURL
        return state
    }

    private func editResult(url: URL, didEdit: Bool, duration: Double = 4.5) -> VideoEditResult {
        VideoEditResult(url: url, didEdit: didEdit, duration: duration,
                        transcriptionText: nil, captions: [], captionLanguageCode: nil)
    }

    func test_applyEditedVideo_edited_remplaceLeFichierQuiPart() {
        let edited = URL(fileURLWithPath: "/tmp/edited.mp4")
        var state = makeStateWithVideo()

        let stale = state.applyEditedVideo(attachmentId: "video-1", result: editResult(url: edited, didEdit: true))

        XCTAssertEqual(state.pendingMediaFiles["video-1"], edited, "La vidéo éditée doit être celle qui part")
        XCTAssertEqual(stale, URL(fileURLWithPath: "/tmp/original.mp4"))
        XCTAssertEqual(state.pendingAttachments.count, 1, "Remplacement par id, jamais un second chip")
        XCTAssertEqual(state.pendingAttachments.first?.id, "video-1")
        XCTAssertEqual(state.pendingAttachments.first?.duration, 4500)
        XCTAssertEqual(state.pendingAttachments.first?.width, 1080)
    }

    func test_applyEditedVideo_nonEditee_gardeLOriginal() {
        let original = URL(fileURLWithPath: "/tmp/original.mp4")
        var state = makeStateWithVideo(originalURL: original)

        let stale = state.applyEditedVideo(attachmentId: "video-1", result: editResult(url: original, didEdit: false))

        XCTAssertNil(stale)
        XCTAssertEqual(state.pendingMediaFiles["video-1"], original)
        XCTAssertEqual(state.pendingAttachments.first?.duration, 9000)
    }

    /// Le résultat de l'éditeur était jeté dans le composeur du message : la
    /// garde lit que la couverture l'applique.
    func test_editeurVideoDuMessage_appliqueLeResultat() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+Composer.swift")
        let retouche = try String(contentsOf: url.deletingLastPathComponent()
            .appendingPathComponent("ConversationView+SceneRetouch.swift"), encoding: .utf8)
        XCTAssertTrue(retouche.contains("composerState.applyEditedVideo(attachmentId: id"),
                      "La vidéo retouchée dans la scène remplace SA pièce (#9124, #9126).")

        // Jumeau #8523 : la citation d'un post jetait aussi le résultat.
        let citation = try String(contentsOf: url.deletingLastPathComponent()
            .appendingPathComponent("FeedComposerSheet.swift"), encoding: .utf8)
        XCTAssertFalse(citation.contains("onComplete: { _ in editingVideoURL = nil }"),
                       "La citation d'un post jette le résultat de l'éditeur vidéo.")
        XCTAssertTrue(citation.contains("PendingVideoEditReplacement.apply(result, to: target.id"))
    }
}
