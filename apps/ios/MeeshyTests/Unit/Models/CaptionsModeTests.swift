import XCTest
@testable import Meeshy

@MainActor
final class CaptionsModeTests: XCTestCase {

    // MARK: - next (the cycle)

    func test_next_off_returnsTranslated() {
        XCTAssertEqual(CaptionsMode.off.next, .translated)
    }

    func test_next_translated_returnsOriginal() {
        XCTAssertEqual(CaptionsMode.translated.next, .original)
    }

    func test_next_original_returnsOff() {
        XCTAssertEqual(CaptionsMode.original.next, .off)
    }

    func test_next_fullCycle_returnsToStart() {
        var mode = CaptionsMode.off
        mode = mode.next
        mode = mode.next
        mode = mode.next
        XCTAssertEqual(mode, .off)
    }

    // MARK: - init(isShowingCaptions:showOriginalText:)

    func test_init_notTranscribing_ignoresShowOriginalText_returnsOff() {
        XCTAssertEqual(CaptionsMode(isShowingCaptions: false, showOriginalText: false), .off)
    }

    func test_init_notTranscribing_evenWithShowOriginalTextTrue_returnsOff() {
        // The isTranscribing guard takes priority — a stale showOriginalText=true left
        // over from a previous session must never surface .original while captions are off.
        XCTAssertEqual(CaptionsMode(isShowingCaptions: false, showOriginalText: true), .off)
    }

    func test_init_transcribing_showOriginalTextFalse_returnsTranslated() {
        XCTAssertEqual(CaptionsMode(isShowingCaptions: true, showOriginalText: false), .translated)
    }

    func test_init_transcribing_showOriginalTextTrue_returnsOriginal() {
        XCTAssertEqual(CaptionsMode(isShowingCaptions: true, showOriginalText: true), .original)
    }

    // MARK: - Ce que le bouton montre et dit

    func test_symbol_eachStateHasItsOwnGlyph() {
        XCTAssertEqual(CaptionsMode.off.symbol, "captions.bubble")
        XCTAssertEqual(CaptionsMode.translated.symbol, "captions.bubble.fill")
        XCTAssertEqual(CaptionsMode.original.symbol, "character.bubble.fill")
    }

    func test_stateLabel_eachStateIsSpokenDistinctly() {
        let spoken = [CaptionsMode.off, .translated, .original].map { $0.stateLabel }
        XCTAssertEqual(Set(spoken).count, 3)
        XCTAssertFalse(spoken.contains(""))
    }
}

// MARK: - TranscriptionCapturePolicy

/// La capture locale ne servait QUE le panneau local : ce device ne
/// transcrivait son micro que pendant que SON utilisateur avait ouvert les
/// sous-titres. En 1:1, activer les sous-titres faisait donc de vous un
/// émetteur et jamais un récepteur — l'autre recevait vos transcriptions,
/// vous ne receviez pas les siennes tant qu'il n'activait pas de son côté.
/// La règle est désormais : ce device capture dès que QUELQU'UN écoute —
/// son propre panneau, ou un pair qui a ouvert le sien.
final class TranscriptionCapturePolicyTests: XCTestCase {

    // #8475 — micro coupé, ma voix n'est plus transcrite ni envoyée : la
    // transcription écoute le micro par son PROPRE moteur, que la coupure de
    // la piste WebRTC n'atteint pas.
    func test_action_microphoneMuted_whileCapturing_stopsCapture() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: true, peerCaptionsActive: true, isCapturing: true, isMicrophoneMuted: true),
            .stop
        )
    }

    func test_action_microphoneMuted_neverStartsCapture_evenIfSomeoneListens() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: true, peerCaptionsActive: true, isCapturing: false, isMicrophoneMuted: true),
            .none
        )
    }

    func test_action_microphoneBackOn_resumesCapture_forSomeoneListening() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: false, peerCaptionsActive: true, isCapturing: false, isMicrophoneMuted: false),
            .start
        )
    }

    func test_action_nobodyListening_andNotCapturing_isNone() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: false, peerCaptionsActive: false, isCapturing: false),
            .none
        )
    }

    func test_action_localPanelOpens_startsCapture() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: true, peerCaptionsActive: false, isCapturing: false),
            .start
        )
    }

    func test_action_peerOpensItsPanel_startsCaptureEvenWithLocalPanelClosed() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: false, peerCaptionsActive: true, isCapturing: false),
            .start
        )
    }

    func test_action_alreadyCapturing_neverRestarts() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: true, peerCaptionsActive: true, isCapturing: true),
            .none
        )
    }

    func test_action_localCloses_butPeerStillListening_keepsCapturing() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: false, peerCaptionsActive: true, isCapturing: true),
            .none
        )
    }

    func test_action_peerCloses_butLocalStillOpen_keepsCapturing() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: true, peerCaptionsActive: false, isCapturing: true),
            .none
        )
    }

    func test_action_lastListenerLeaves_stopsCapture() {
        XCTAssertEqual(
            TranscriptionCapturePolicy.action(localPanelOpen: false, peerCaptionsActive: false, isCapturing: true),
            .stop
        )
    }

    // MARK: - La bascule du journal ne touche pas la bande (#17678, loi 7)

    func test_surface_bandFollowsTheCaptionsButtonOnly() {
        XCTAssertFalse(CallCaptionsSurface.band.prefersOriginal(bandOriginal: false, journalOriginal: true))
        XCTAssertTrue(CallCaptionsSurface.band.prefersOriginal(bandOriginal: true, journalOriginal: false))
    }

    func test_surface_journalFollowsItsOwnToggleOnly() {
        XCTAssertTrue(CallCaptionsSurface.journal.prefersOriginal(bandOriginal: false, journalOriginal: true))
        XCTAssertFalse(CallCaptionsSurface.journal.prefersOriginal(bandOriginal: true, journalOriginal: false))
    }

    func test_originalChosenInTheJournal_keepsTheBandInTheReadersLanguage() {
        let segment = Meeshy.CallTranscriptionSegment(
            id: UUID(), text: "Hello", speakerId: "peer", startTime: 0, endTime: 1, isFinal: true,
            confidence: 1, language: "en", translatedText: "Bonjour", translatedLanguage: "fr",
            capturedAt: Date(timeIntervalSince1970: 0)
        )
        func line(on surface: CallCaptionsSurface) -> CallCaptionLine {
            CallCaptionLine.make(
                segment: segment, isLocal: false, speakerName: "Peer",
                prefersOriginal: surface.prefersOriginal(bandOriginal: false, journalOriginal: true),
                isRevealed: false, readerPrism: ["fr"]
            )
        }
        XCTAssertEqual(line(on: .journal).text, "Hello")
        XCTAssertEqual(line(on: .band).text, "Bonjour")
    }
}
