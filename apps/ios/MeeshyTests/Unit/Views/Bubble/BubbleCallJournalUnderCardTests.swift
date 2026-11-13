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
        XCTAssertEqual(result, .served(cached))
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
        XCTAssertEqual(result, .served(replayed))
        XCTAssertEqual(waits, 1)
    }

    func test_load_nothingKept_saysSo() async {
        let result = await BubbleCallJournalLoading.load(
            callId: "call-1", readCache: { _ in nil }, replay: { _ in nil }, willWaitOnNetwork: {}
        )
        XCTAssertEqual(result, .nothingKept)
    }

    /// Replier la bascule pendant le replay annule la tâche : le `try?` du replay rend alors `nil`. Ce `nil` ne dit
    /// PAS « rien n'a été gardé » — le lire ainsi figeait « Aucune transcription » sur un appel qui en a une.
    func test_load_cancelledDuringReplay_isAbandoned_neverNothingKept() async {
        let result = await Task { @MainActor in
            await BubbleCallJournalLoading.load(
                callId: "call-1",
                readCache: { _ in nil },
                replay: { _ in
                    withUnsafeCurrentTask { $0?.cancel() }
                    return nil
                },
                willWaitOnNetwork: {}
            )
        }.value
        XCTAssertEqual(result, .abandoned)
    }

    // MARK: - L'état ouvert survit au recyclage de la cellule

    func test_memory_aCallIsClosedUntilOpened() {
        let memory = BubbleCallJournalMemory()
        XCTAssertFalse(memory.isOpen("call-1"))
        memory.remember("call-1", isOpen: true)
        XCTAssertTrue(memory.isOpen("call-1"))
        XCTAssertFalse(memory.isOpen("call-2"))
        memory.remember("call-1", isOpen: false)
        XCTAssertFalse(memory.isOpen("call-1"))
    }

    func test_memory_isBounded_theOldestOpeningIsForgotten() {
        let memory = BubbleCallJournalMemory(capacity: 2)
        memory.remember("a", isOpen: true)
        memory.remember("b", isOpen: true)
        memory.remember("a", isOpen: true)
        memory.remember("c", isOpen: true)
        XCTAssertTrue(memory.isOpen("a"), "Rouvrir rafraîchit l'ancienneté.")
        XCTAssertFalse(memory.isOpen("b"))
        XCTAssertTrue(memory.isOpen("c"))
    }

    func test_card_startsFromTheMemory_andWritesEveryToggleToIt() throws {
        let view = try card()
        XCTAssertTrue(view.contains("State(initialValue: memory.isOpen(callId))"),
                      "Une cellule recyclée reprend le journal tel que l'utilisateur l'a laissé.")
        XCTAssertTrue(view.contains("memory.remember(callId, isOpen: isOpen)"))
        XCTAssertTrue(view.contains("memory: BubbleCallJournalMemory = .shared"))
    }

    func test_card_abandonedLoad_leavesThePhaseUntouched() throws {
        let view = try card()
        XCTAssertTrue(view.contains("case .abandoned:"))
    }

    // MARK: - La feuille garde sa mise en page

    func test_transcriptSection_translationToggle_is44pt_withoutGrowingTheFooter() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains(".meeshyTapTarget()"))
        XCTAssertTrue(section.contains(".padding(-MeeshyTapTarget.inset(forVisualSide:"),
                      "La cible de 44 pt déborde sans pousser l'en-tête de la feuille ni décaler le glyphe.")
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

    // MARK: - Lot carte d'appel et journal d'après l'appel (#17864) — A1.2 · A1.8 · A1.11 · A1.15 · A2.3

    private func segment(
        name: String = "Awa", isLocal: Bool = false, text: String = "Hi!",
        translated: String? = "Salut !", translatedLanguage: String? = "fr"
    ) -> CallTranscriptSegment {
        CallTranscriptSegment(
            speakerId: isLocal ? "me" : "u2", speakerName: name, isLocal: isLocal, text: text,
            translatedText: translated, translatedLanguage: translatedLanguage, language: "en",
            capturedAt: Date(timeIntervalSince1970: 4)
        )
    }

    // A1.8 / A2.3 : l'original est sous CHAQUE traduction, dépliée d'office.

    func test_originalBelow_aTranslatedSentence_carriesItsOriginal() {
        XCTAssertEqual(CallJournalAfterCall.originalBelow(segment(), showsOriginalInstead: false), "Hi!")
    }

    func test_originalBelow_myOwnSentence_hasNone() {
        XCTAssertNil(CallJournalAfterCall.originalBelow(segment(isLocal: true, translated: nil), showsOriginalInstead: false))
        XCTAssertNil(CallJournalAfterCall.originalBelow(segment(isLocal: true), showsOriginalInstead: false),
                     "Ma phrase n'est jamais traduite pour moi.")
    }

    func test_originalBelow_aSentenceWithoutTranslation_hasNone() {
        XCTAssertNil(CallJournalAfterCall.originalBelow(segment(translated: nil, translatedLanguage: nil), showsOriginalInstead: false))
        XCTAssertNil(CallJournalAfterCall.originalBelow(segment(translated: "  "), showsOriginalInstead: false))
    }

    func test_originalBelow_whenTheToggleAlreadyShowsTheOriginal_isNotRepeated() {
        XCTAssertNil(CallJournalAfterCall.originalBelow(segment(), showsOriginalInstead: true))
    }

    // A1.15 : la bascule n'existe que si une phrase sert une traduction.

    func test_offersOriginalToggle_onlyWhenASentenceIsServedTranslated() {
        XCTAssertTrue(CallJournalAfterCall.offersOriginalToggle([segment(isLocal: true, translated: nil), segment()]))
        XCTAssertFalse(CallJournalAfterCall.offersOriginalToggle([segment(isLocal: true, translated: nil)]))
        XCTAssertFalse(CallJournalAfterCall.offersOriginalToggle([segment(translated: nil, translatedLanguage: nil)]))
        XCTAssertFalse(CallJournalAfterCall.offersOriginalToggle([]))
    }

    // A1.11 : mes lignes disent « Vous », celles des autres gardent leur nom.

    func test_authorName_mine_isYou_whateverNameWasEngraved() {
        XCTAssertEqual(CallJournalAfterCall.authorName(speakerName: "Charles Dupont", isMine: true, you: "Vous"), "Vous")
        XCTAssertEqual(CallJournalAfterCall.authorName(speakerName: "", isMine: true, you: "Vous"), "Vous")
        XCTAssertEqual(CallJournalAfterCall.authorName(speakerName: "Awa", isMine: false, you: "Vous"), "Awa")
    }

    func test_authorName_capture_isMineWhenTheUserIdMatches() {
        XCTAssertTrue(CallJournalAfterCall.isMine(userId: "me", localUserId: "me"))
        XCTAssertFalse(CallJournalAfterCall.isMine(userId: "u2", localUserId: "me"))
        XCTAssertFalse(CallJournalAfterCall.isMine(userId: "", localUserId: ""), "Un identifiant vide n'est la ligne de personne.")
    }

    // Sécurité : la mention dit vrai selon le régime de la conversation.

    func test_retentionNotice_endToEnd_saysNothingLeavesTheDevice() {
        XCTAssertEqual(CallJournalAfterCall.retentionNotice(for: .endToEnd), .deviceOnly)
    }

    func test_retentionNotice_readableConversation_admitsTheServerKeepsFinalSentences() {
        XCTAssertEqual(CallJournalAfterCall.retentionNotice(for: .open), .serverKeepsFinalSentences)
    }

    func test_retentionNotice_unresolvedRegime_claimsNothing() {
        XCTAssertEqual(CallJournalAfterCall.retentionNotice(for: .unresolved), .hidden)
    }

    func test_transcriptSection_noLongerPromisesNeverSent_whateverTheRegime() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertFalse(section.contains("\"call.transcript.disclaimer\""), "La mention d'avant promettait « jamais envoyée au serveur » à tous.")
        XCTAssertTrue(section.contains("call.transcript.disclaimer.endToEnd"))
        XCTAssertTrue(section.contains("call.transcript.disclaimer.server"))
    }

    // Disposition : l'original sous la traduction, la bascule au pied, « Vous », la ligne des participants.

    func test_transcriptSection_togglesAtTheFootOfTheJournal_notInTheHeader() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertFalse(section.contains("character.bubble.fill"), "Plus d'icône en tête de section.")
        guard let journal = section.range(of: "ForEach(Array(journal.enumerated())"),
              let toggle = section.range(of: "originalToggle") else { return XCTFail("bascule absente") }
        XCTAssertLessThan(journal.lowerBound, toggle.lowerBound, "La bascule est au pied du journal.")
        XCTAssertTrue(section.contains("CallJournalAfterCall.offersOriginalToggle("), "Sans phrase traduite, pas de bascule.")
    }

    func test_transcriptSection_unfoldsTheOriginalWithTheSharedLine_inSecondaryInk() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains("CallOriginalBelowText("), "La ligne du journal vivant, jamais un jumeau.")
        XCTAssertTrue(section.contains("theme.textSecondary"))
        let live = try source("Meeshy/Features/Call/Views/CallCaptionsViews.swift")
        XCTAssertTrue(live.contains("CallOriginalBelowText("), "Le journal vivant et celui d'après l'appel posent la même ligne.")
    }

    func test_transcriptSection_namesMeYou_atReplayAndInTheRows() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains("CallJournalAfterCall.authorName("))
        XCTAssertFalse(section.contains("localUser?.displayName ?? localUser?.username"), "Le replay ne grave plus mon nom d'affichage.")
    }

    func test_card_showsTheParticipantsLine_underTheTitle() throws {
        let view = try notice()
        XCTAssertTrue(view.contains("summary.participantsLine("))
        guard let title = view.range(of: "Text(title)"), let line = view.range(of: "participantsLine") else {
            return XCTFail("ligne des participants absente")
        }
        XCTAssertLessThan(title.lowerBound, line.lowerBound, "Sous le titre.")
    }
}
