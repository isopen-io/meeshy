import XCTest
import MeeshySDK
@testable import Meeshy

/// R1.11 (#17802, planche A1) — la bulle d'appel du fil déplie le journal d'après l'appel sous la carte,
/// comme Android (#17801) et le web. Le journal est celui de la feuille « Détails de l'appel » : jamais un jumeau.
@MainActor
final class BubbleCallJournalUnderCardTests: XCTestCase {

    // MARK: - Fabriques

    private func summary(
        callId: String = "call-1",
        outcome: CallSummaryMetadata.Outcome = .completed,
        durationSeconds: Int = 84,
        isLive: Bool = false
    ) -> CallSummaryMetadata {
        CallSummaryMetadata(
            callId: callId, initiatorId: "u1", callType: .audio, outcome: outcome,
            durationSeconds: durationSeconds, bytesTotal: nil, bytesEstimated: false,
            networkQuality: nil, isLive: isLive
        )
    }

    private func transcript(callId: String = "call-1") -> CallTranscript {
        CallTranscript(
            callId: callId, conversationId: "c1", callStartedAt: Date(timeIntervalSince1970: 0),
            segments: [], captures: []
        )
    }

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func notice() throws -> String { try source("Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift") }
    private func card() throws -> String { try source("Meeshy/Features/Main/Views/Bubble/BubbleCallJournalUnderCard.swift") }

    // MARK: - Quelle bulle offre le journal

    func test_isOffered_connectedCallThatLasted_isTrue() {
        XCTAssertTrue(BubbleCallJournalOffer.isOffered(summary()))
    }

    func test_isOffered_missedRejectedOrFailedCall_isFalse() {
        for outcome in [CallSummaryMetadata.Outcome.missed, .rejected, .failed] {
            XCTAssertFalse(BubbleCallJournalOffer.isOffered(summary(outcome: outcome)), "\(outcome) n'a rien dit")
        }
    }

    func test_isOffered_liveCallOrZeroLengthOrBlankId_isFalse() {
        XCTAssertFalse(BubbleCallJournalOffer.isOffered(summary(isLive: true)))
        XCTAssertFalse(BubbleCallJournalOffer.isOffered(summary(durationSeconds: 0)))
        XCTAssertFalse(BubbleCallJournalOffer.isOffered(summary(callId: "  ")))
    }

    func test_saysNothingWasKept_onlyWhenTheLoadFoundNothing() {
        XCTAssertTrue(BubbleCallJournalOffer.saysNothingWasKept(.nothingKept))
        XCTAssertFalse(BubbleCallJournalOffer.saysNothingWasKept(.closed))
        XCTAssertFalse(BubbleCallJournalOffer.saysNothingWasKept(.loading))
        XCTAssertFalse(BubbleCallJournalOffer.saysNothingWasKept(.shown))
    }

    // MARK: - Cache d'abord

    func test_load_cachedJournal_isServedWithoutWaitingOnTheNetwork() async {
        var waited = false
        var replayed = false
        let cached = transcript()
        let result = await BubbleCallJournalLoading.load(
            callId: "call-1",
            readCache: { _ in cached },
            replay: { _ in replayed = true; return nil },
            willWaitOnNetwork: { waited = true }
        )
        XCTAssertEqual(result, cached)
        XCTAssertFalse(waited, "Un journal en cache ne montre aucun spinner.")
        XCTAssertFalse(replayed)
    }

    func test_load_cacheMiss_announcesTheWaitThenServesTheReplay() async {
        var waits = 0
        let replayed = transcript()
        let result = await BubbleCallJournalLoading.load(
            callId: "call-1",
            readCache: { _ in nil },
            replay: { _ in replayed },
            willWaitOnNetwork: { waits += 1 }
        )
        XCTAssertEqual(result, replayed)
        XCTAssertEqual(waits, 1)
    }

    func test_load_nothingKept_returnsNil() async {
        let result = await BubbleCallJournalLoading.load(
            callId: "call-1", readCache: { _ in nil }, replay: { _ in nil }, willWaitOnNetwork: {}
        )
        XCTAssertNil(result)
    }

    // MARK: - Câblage : la bulle, la carte, la feuille

    func test_bubble_offersTheJournalUnderTheCard_onTheCardSide_whenOffered() throws {
        let view = try notice()
        XCTAssertTrue(view.contains("BubbleCallJournalOffer.isOffered(summary)"))
        XCTAssertTrue(view.contains("BubbleCallJournalUnderCard("))
        guard let cardRange = view.range(of: "                card\n"),
              let journalRange = view.range(of: "BubbleCallJournalUnderCard(") else {
            return XCTFail("la carte et le journal doivent partager la colonne de la bulle")
        }
        XCTAssertLessThan(cardRange.lowerBound, journalRange.lowerBound, "Le journal se déplie SOUS la carte.")
        XCTAssertTrue(view.contains("alignsTrailing: isOutgoing"), "Du côté de la carte : droite pour un appel sortant.")
    }

    func test_bubble_keepsTheDetailSheet() throws {
        let view = try notice()
        XCTAssertTrue(view.contains("struct CallSummaryDetailSheet: View {"))
        XCTAssertTrue(view.contains("CallTranscriptSection(transcript: transcript"))
        XCTAssertTrue(view.contains("onLongPress?()"))
    }

    func test_card_reusesTheSheetsJournal_neverATwin() throws {
        let view = try card()
        XCTAssertTrue(view.contains("CallTranscriptSection("), "Phrases et lignes de capture : la section de la feuille.")
        XCTAssertTrue(view.contains("CallTranscriptLoader.load(callId:"), "Cache chiffré d'abord, replay serveur ensuite.")
        XCTAssertTrue(view.contains("CallTranscriptStore.shared.transcript(for:"))
    }

    func test_card_loadsNothingWhileTheToggleIsClosed() throws {
        let view = try card()
        XCTAssertTrue(view.contains(".task(id:"))
        XCTAssertTrue(view.contains("guard isOpen"), "Rien n'est chargé tant que la bascule est fermée.")
    }

    func test_card_isALeaf_noGlobalSingletonObserved_andIsEquatable() throws {
        let view = try card()
        XCTAssertTrue(view.contains("struct BubbleCallJournalUnderCard: View, Equatable"))
        XCTAssertFalse(view.contains("@ObservedObject"))
        XCTAssertFalse(view.contains("@EnvironmentObject"))
        XCTAssertFalse(view.contains("@StateObject"))
    }

    func test_card_saysNothingKept_withTheAlreadyTranslatedKey() throws {
        let view = try card()
        XCTAssertTrue(view.contains("audio.fullscreen.transcription.empty"))
        XCTAssertTrue(view.contains("BubbleCallJournalOffer.saysNothingWasKept("))
    }

    func test_card_toggle_isA44ptButton_withShowHideLabels() throws {
        let view = try card()
        XCTAssertTrue(view.contains("story.viewer.transcript.show"))
        XCTAssertTrue(view.contains("story.viewer.transcript.hide"))
        XCTAssertTrue(view.contains("meeshyTapTarget("), "Cible d'au moins 44 pt.")
        XCTAssertTrue(view.contains(".accessibilityLabel(toggleTitle)"))
    }

    func test_card_reduceMotion_fadesInsteadOfMoving() throws {
        let view = try card()
        XCTAssertTrue(view.contains("accessibilityReduceMotion"))
        XCTAssertTrue(view.contains("meeshyForceReduceMotion"))
        XCTAssertTrue(view.contains(".transition(reduceMotion ? .opacity"))
    }

    func test_card_noStoredAsyncFunctionTypeWithoutMainActor() throws {
        let view = try card()
        let lines = view.components(separatedBy: "\n").filter { $0.contains("async ->") && !$0.contains("func ") && !$0.hasPrefix("    )") }
        for line in lines {
            XCTAssertTrue(line.contains("@MainActor"), "Type de fonction async sans @MainActor (#8182) : \(line)")
        }
    }
}
