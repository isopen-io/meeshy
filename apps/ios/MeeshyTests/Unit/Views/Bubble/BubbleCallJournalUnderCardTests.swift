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
            replay: { _ in replayed = true; return .nothingKept },
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
            replay: { _ in .served(replayed) },
            willWaitOnNetwork: { waits += 1 }
        )
        XCTAssertEqual(result, .served(replayed))
        XCTAssertEqual(waits, 1)
    }

    func test_load_nothingKept_saysSo() async {
        let result = await BubbleCallJournalLoading.load(
            callId: "call-1", readCache: { _ in nil }, replay: { _ in .nothingKept }, willWaitOnNetwork: {}
        )
        XCTAssertEqual(result, .nothingKept)
    }

    /// Replier la bascule pendant le replay annule la tâche : la lecture échoue alors (A1.13). Cet échec ne dit
    /// PAS « rien n'a été gardé » — le lire ainsi figeait « Aucune transcription » sur un appel qui en a une.
    func test_load_cancelledDuringReplay_isAbandoned_neverNothingKept() async {
        let result = await Task { @MainActor in
            await BubbleCallJournalLoading.load(
                callId: "call-1",
                readCache: { _ in nil },
                replay: { _ in
                    withUnsafeCurrentTask { $0?.cancel() }
                    return .unreachable
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
        XCTAssertTrue(section.contains("-MeeshyTapTarget.inset(forVisualSide:"),
                      "La cible de 44 pt déborde sans pousser le pied de la feuille.")
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
        XCTAssertTrue(view.contains("CallTranscriptLoader.replay(callId:"), "Cache chiffré d'abord, replay serveur ensuite.")
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

    // A1.8 / A2.3 / loi 7 (#17862, #17895) : la bascule INVERSE les deux lignes, rien ne disparaît.

    func test_lines_translatedSentence_onTheTranslation_leadsWithTranslation_originalBelow() {
        let lines = CallJournalAfterCall.lines(for: segment(), showsOriginal: false)
        XCTAssertEqual(lines.primary, "Salut !")
        XCTAssertTrue(lines.primaryIsTranslation, "La traduction en tête est à la couleur d'auteur.")
        XCTAssertEqual(lines.below, CallJournalLines.Below(kind: .original, text: "Hi!"))
    }

    func test_lines_translatedSentence_onTheOriginal_leadsWithOriginal_translationBelow() {
        let lines = CallJournalAfterCall.lines(for: segment(), showsOriginal: true)
        XCTAssertEqual(lines.primary, "Hi!")
        XCTAssertFalse(lines.primaryIsTranslation, "L'original en tête est à l'encre du thème.")
        XCTAssertEqual(lines.below, CallJournalLines.Below(kind: .translated, text: "Salut !"),
                       "La traduction passe dessous au lieu de disparaître.")
    }

    func test_lines_myOwnSentence_staysAlone_inBothStates() {
        for showsOriginal in [false, true] {
            let lines = CallJournalAfterCall.lines(for: segment(isLocal: true), showsOriginal: showsOriginal)
            XCTAssertEqual(lines, CallJournalLines(primary: "Hi!", primaryIsTranslation: false, below: nil),
                           "Ma phrase n'est jamais traduite pour moi.")
        }
    }

    func test_lines_aSentenceWithoutTranslation_staysAlone_inBothStates() {
        for showsOriginal in [false, true] {
            XCTAssertEqual(
                CallJournalAfterCall.lines(for: segment(translated: nil, translatedLanguage: nil), showsOriginal: showsOriginal),
                CallJournalLines(primary: "Hi!", primaryIsTranslation: false, below: nil))
            XCTAssertEqual(
                CallJournalAfterCall.lines(for: segment(translated: "  "), showsOriginal: showsOriginal),
                CallJournalLines(primary: "Hi!", primaryIsTranslation: false, below: nil),
                "Une traduction blanche n'est pas une traduction.")
        }
    }

    func test_toggleLabel_saysSeeOriginal_thenSeeTranslation() {
        // Le simulateur de la CI sert la langue de l'appareil : on compare aux clés du catalogue, pas au français.
        XCTAssertEqual(
            CallJournalAfterCall.toggleLabel(showsOriginal: false),
            String(localized: "call.transcript.toggle.showOriginal", defaultValue: "Voir l'original", bundle: .main)
        )
        XCTAssertEqual(
            CallJournalAfterCall.toggleLabel(showsOriginal: true),
            String(localized: "call.transcript.toggle.showTranslation", defaultValue: "Voir la traduction", bundle: .main)
        )
        XCTAssertNotEqual(
            CallJournalAfterCall.toggleLabel(showsOriginal: false),
            CallJournalAfterCall.toggleLabel(showsOriginal: true)
        )
    }

    func test_belowLabel_namesWhatTheLineHolds() {
        XCTAssertEqual(CallJournalLineKind.original.label, CallCaptionsCopy.original)
        XCTAssertEqual(CallJournalLineKind.translated.label, CallCaptionsCopy.translated)
    }

    func test_spokenLabel_readsThePrimaryLine_thenTranslatedOrOriginal() {
        let byDefault = CallJournalAfterCall.lines(for: segment(), showsOriginal: false)
        XCTAssertEqual(
            CallJournalAfterCall.spokenLabel(name: "Awa", elapsed: "0:04", lines: byDefault),
            "Awa, 0:04 : Salut !. \(CallCaptionsCopy.original) : Hi!")
        let inverted = CallJournalAfterCall.lines(for: segment(), showsOriginal: true)
        XCTAssertEqual(
            CallJournalAfterCall.spokenLabel(name: "Awa", elapsed: "0:04", lines: inverted),
            "Awa, 0:04 : Hi!. \(CallCaptionsCopy.translated) : Salut !")
        let alone = CallJournalAfterCall.lines(for: segment(isLocal: true), showsOriginal: true)
        XCTAssertEqual(CallJournalAfterCall.spokenLabel(name: "Vous", elapsed: "0:04", lines: alone), "Vous, 0:04 : Hi!")
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
        XCTAssertTrue(section.contains("kind: below.kind"), "Une seule pièce dit « Original · » comme « Traduit · ».")
        XCTAssertTrue(section.contains("theme.textSecondary"))
        let live = try source("Meeshy/Features/Call/Views/CallCaptionsViews.swift")
        XCTAssertTrue(live.contains("CallOriginalBelowText("), "Le journal vivant et celui d'après l'appel posent la même ligne.")
    }

    func test_transcriptSection_footLabelsComeFromTheLaw_andTheFlipFades() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains("CallJournalAfterCall.toggleLabel(showsOriginal: showOriginalText)"))
        XCTAssertFalse(section.contains("CallCaptionsCopy.showOriginalHint"), "Ces deux clés restent l'indice de la phrase vivante.")
        XCTAssertFalse(section.contains("CallCaptionsCopy.showTranslatedHint"))
        XCTAssertTrue(section.contains(".contentTransition(.opacity)"), "Le changement d'état se fait en fondu.")
        XCTAssertTrue(section.contains("MeeshyMotion.shouldReduce("), "Réduire les animations : aucun déplacement.")
        XCTAssertTrue(section.contains(".accessibilityAddTraits(showOriginalText ? .isSelected : [])"), "Lecteur d'écran : l'état pressé.")
        XCTAssertTrue(section.contains(".meeshyTapTarget()"), "Cible 44 pt.")
    }

    func test_catalog_footLabels_existInSevenLanguages() throws {
        let catalog = try source("Meeshy/Localizable.xcstrings")
        for key in ["call.transcript.toggle.showOriginal", "call.transcript.toggle.showTranslation"] {
            let data = try XCTUnwrap(catalog.data(using: .utf8))
            let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let strings = try XCTUnwrap(root["strings"] as? [String: Any])
            let entry = try XCTUnwrap(strings[key] as? [String: Any], "\(key) absente")
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
            XCTAssertEqual(Set(localizations.keys), ["ar", "de", "en", "es", "fr", "it", "pt-BR"], key)
        }
    }

    func test_transcriptSection_namesMeYou_atReplayAndInTheRows() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains("CallJournalAfterCall.authorName("))
        XCTAssertFalse(section.contains("localUser?.displayName ?? localUser?.username"), "Le replay ne grave plus mon nom d'affichage.")
    }

    func test_card_showsTheParticipantsLine_underTheTitle() throws {
        let view = try notice()
        XCTAssertTrue(view.contains("summary.participantsLine(viewerId: notice.viewerId"),
                      "Le lecteur se retire de la liste par son identifiant, jamais par son nom.")
        guard let title = view.range(of: "Text(title)"), let line = view.range(of: "participantsLine") else {
            return XCTFail("ligne des participants absente")
        }
        XCTAssertLessThan(title.lowerBound, line.lowerBound, "Sous le titre.")
    }

    // Le thème recolore le journal ouvert : la cellule est égale par primitives (la bascule ne se redessine pas
    // quand le thème change), donc le journal lit la palette de l'ENVIRONNEMENT, qui l'invalide directement.

    func test_transcriptSection_readsThePaletteOfTheEnvironment_notTheUnobservedSingleton() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains("@ResolvedThemePalette private var theme"))
        XCTAssertFalse(section.contains("ThemeManager.shared"), "Lu sans être observé : un journal ouvert gardait l'ancien thème.")
    }

    func test_journalUnderCard_saysNothingKept_inThePaletteOfTheEnvironment_andStaysEqualByPrimitives() throws {
        let view = try source("Meeshy/Features/Main/Views/Bubble/BubbleCallJournalUnderCard.swift")
        XCTAssertTrue(view.contains("@ResolvedThemePalette private var theme"))
        XCTAssertFalse(view.contains("ThemeManager.shared"))
        XCTAssertTrue(
            view.contains("lhs.callId == rhs.callId && lhs.accentHex == rhs.accentHex && lhs.alignsTrailing == rhs.alignsTrailing"),
            "La cellule reste égale par primitives."
        )
    }

    // MARK: - Lot #18209 — A1.3 · A1.7 · A1.13 · A1.18

    private func wireSegment(
        speakerId: String = "u2", text: String = "Hello", language: String = "en",
        translations: [(language: String, text: String)] = []
    ) throws -> APICallTranscriptSegment {
        let json: [String: Any] = [
            "id": "s1", "speakerId": speakerId, "speakerDisplayName": "Awa", "text": text, "language": language,
            "confidence": 0.9, "capturedAtMs": 4_000,
            "translations": translations.map { ["targetLanguage": $0.language, "translatedText": $0.text] }
        ]
        return try JSONDecoder().decode(APICallTranscriptSegment.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func replayed(_ wire: APICallTranscriptSegment, prism: [String]) -> CallTranscriptSegment {
        CallTranscriptLoader.replayedSegment(wire, localUserId: "me", localName: "Vous", readerPrism: prism)
    }

    // A1.7 : le replay descend le Prisme du lecteur, rang par rang — les vecteurs d'Android (CallTranscriptReplayTest).

    func test_replay_servesTheReadersPrimaryLanguage() throws {
        let line = replayed(try wireSegment(translations: [("es", "Hola"), ("fr", "Bonjour")]), prism: ["fr"])
        XCTAssertEqual(line.translatedText, "Bonjour")
        XCTAssertEqual(line.translatedLanguage, "fr")
        XCTAssertEqual(line.text, "Hello", "L'original reste sous la traduction.")
    }

    func test_replay_aLowerRankTranslationServes_whenThePrimaryLanguageIsMissing() throws {
        let line = replayed(try wireSegment(text: "Hola", language: "es", translations: [("en", "Hello")]), prism: ["fr", "en"])
        XCTAssertEqual(line.translatedText, "Hello", "Prisme [fr, en], phrase espagnole traduite en anglais seulement : l'anglais, jamais l'espagnol.")
        XCTAssertEqual(line.translatedLanguage, "en")
    }

    func test_replay_theOriginalLanguageCompetesAtItsRank() throws {
        let line = replayed(try wireSegment(translations: [("es", "Hola")]), prism: ["fr", "en", "es"])
        XCTAssertNil(line.translatedText, "L'anglais, rang 2, est servi par l'original avant l'espagnol de rang 3.")
    }

    func test_replay_aPrimaryTranslationWins_evenWhenTheOriginalIsInTheReadersPrism() throws {
        let line = replayed(try wireSegment(translations: [("fr", "Bonjour")]), prism: ["fr", "en"])
        XCTAssertEqual(line.translatedText, "Bonjour", "La langue d'origine concourt à son rang, jamais en court-circuit.")
    }

    func test_replay_noTranslationInThePrism_servesTheOriginal_neverTheFirstTranslation() throws {
        XCTAssertNil(replayed(try wireSegment(translations: [("es", "Hola")]), prism: ["fr"]).translatedText)
        XCTAssertNil(replayed(try wireSegment(translations: [("es", "Hola")]), prism: []).translatedText,
                     "Un prisme vide sert l'original.")
    }

    func test_replay_aBlankTranslationIsNotATranslation_theNextRankServes() throws {
        let line = replayed(try wireSegment(text: "Hola", language: "es", translations: [("fr", "  "), ("en", "Hello")]), prism: ["fr", "en"])
        XCTAssertEqual(line.translatedText, "Hello")
    }

    func test_replay_mySentence_readsYou_andIsNeverTranslated() throws {
        let line = replayed(try wireSegment(speakerId: "me", text: "Salut", language: "fr", translations: [("en", "Hi")]), prism: ["en"])
        XCTAssertTrue(line.isLocal)
        XCTAssertEqual(line.speakerName, "Vous")
        XCTAssertNil(line.translatedText)
    }

    func test_replay_anUnknownReader_neverClaimsASentence() throws {
        let line = CallTranscriptLoader.replayedSegment(try wireSegment(speakerId: ""), localUserId: "", localName: "Vous", readerPrism: ["fr"])
        XCTAssertFalse(line.isLocal)
    }

    func test_replay_readsTheStrictReaderPrism_notTheSingleCallLanguage() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains("ReaderPrism.resolve(for: localUser)"))
        XCTAssertTrue(section.contains("PrismTranslationResolver.resolve("))
        XCTAssertFalse(section.contains("CallLanguagePreference.preferredCallLanguage"), "Une seule langue de rang 1 ne descend pas le Prisme.")
        XCTAssertFalse(section.contains("translations.first("))
    }

    // A1.13 : un replay en échec réseau propose Réessayer ; seuls un refus et un appel inconnu disent « rien gardé ».

    func test_replayFailure_forbiddenOrUnknownCall_saysNothingKept() {
        XCTAssertEqual(CallTranscriptReplay.failing(MeeshyError.forbidden(reason: nil, body: nil)), .nothingKept)
        XCTAssertEqual(CallTranscriptReplay.failing(MeeshyError.server(statusCode: 404, message: "")), .nothingKept)
    }

    func test_replayFailure_networkOrServerError_isUnreachable() {
        XCTAssertEqual(CallTranscriptReplay.failing(MeeshyError.network(.noConnection)), .unreachable)
        XCTAssertEqual(CallTranscriptReplay.failing(URLError(.notConnectedToInternet)), .unreachable)
        XCTAssertEqual(CallTranscriptReplay.failing(MeeshyError.server(statusCode: 500, message: "")), .unreachable)
        XCTAssertEqual(CallTranscriptReplay.failing(CancellationError()), .unreachable)
    }

    func test_replay_projectsItsTranscript_forTheDetailSheets() {
        let served = transcript()
        XCTAssertEqual(CallTranscriptReplay.served(served).transcript, served)
        XCTAssertNil(CallTranscriptReplay.nothingKept.transcript)
        XCTAssertNil(CallTranscriptReplay.unreachable.transcript)
    }

    func test_load_unreachableReplay_isUnreachable_neverNothingKept() async {
        let result = await BubbleCallJournalLoading.load(
            callId: "call-1", readCache: { _ in nil }, replay: { _ in .unreachable }, willWaitOnNetwork: {}
        )
        XCTAssertEqual(result, .unreachable)
    }

    func test_offersRetry_onlyWhenTheServerWasUnreachable() {
        XCTAssertTrue(BubbleCallJournalOffer.offersRetry(.unreachable))
        for phase in [BubbleCallJournalPhase.closed, .loading, .shown, .nothingKept] {
            XCTAssertFalse(BubbleCallJournalOffer.offersRetry(phase), "\(phase)")
        }
        XCTAssertFalse(BubbleCallJournalOffer.saysNothingWasKept(.unreachable), "Un échec réseau n'est pas « Aucune transcription ».")
    }

    func test_card_unreachable_saysUnavailable_andRetriesWithA44ptButton() throws {
        let view = try card()
        XCTAssertTrue(view.contains("BubbleCallJournalOffer.offersRetry(phase)"))
        XCTAssertTrue(view.contains("composer.audio.transcription.unavailable"), "« Transcription indisponible », déjà traduite en sept langues.")
        XCTAssertTrue(view.contains("call.action.retry"), "« Réessayer », déjà traduit en sept langues.")
        XCTAssertTrue(view.contains("attempt += 1"), "Réessayer relance la lecture.")
        XCTAssertTrue(view.contains("let attempt: Int"), "La tentative fait partie de la clé de chargement.")
        XCTAssertTrue(view.contains("case .unreachable:"))
    }

    // A1.3 : le lecteur d'écran annonce l'état déplié ou replié de la bascule.

    func test_toggleValue_saysExpandedThenCollapsed() {
        XCTAssertEqual(
            BubbleCallJournalCopy.toggleValue(isOpen: true),
            String(localized: "message.long.expanded", defaultValue: "Déplié", bundle: .main)
        )
        XCTAssertEqual(
            BubbleCallJournalCopy.toggleValue(isOpen: false),
            String(localized: "message.long.collapsed", defaultValue: "Replié", bundle: .main)
        )
        XCTAssertNotEqual(BubbleCallJournalCopy.toggleValue(isOpen: true), BubbleCallJournalCopy.toggleValue(isOpen: false))
    }

    func test_card_toggle_announcesItsState() throws {
        let view = try card()
        XCTAssertTrue(view.contains(".accessibilityValue(BubbleCallJournalCopy.toggleValue(isOpen: isOpen))"))
    }

    // A1.18 : « Voir l'original » ne fait que fondre — les deux états d'une phrase se superposent, sa hauteur ne
    // change pas, et aucune phrase ne glisse.

    func test_layers_translatedSentence_laysOutBothStates_andShowsOne() {
        for showsOriginal in [false, true] {
            let layers = CallJournalAfterCall.layers(for: segment(), showsOriginal: showsOriginal)
            XCTAssertEqual(layers.map(\.lines), [
                CallJournalAfterCall.lines(for: segment(), showsOriginal: false),
                CallJournalAfterCall.lines(for: segment(), showsOriginal: true)
            ], "Les mêmes lignes dans les deux états : la phrase garde sa hauteur.")
            XCTAssertEqual(layers.filter(\.isShown).map(\.lines), [CallJournalAfterCall.lines(for: segment(), showsOriginal: showsOriginal)])
        }
    }

    func test_layers_untranslatedSentence_isASingleShownLayer() {
        for showsOriginal in [false, true] {
            XCTAssertEqual(
                CallJournalAfterCall.layers(for: segment(translated: nil, translatedLanguage: nil), showsOriginal: showsOriginal),
                [CallJournalLayer(lines: CallJournalLines(primary: "Hi!", primaryIsTranslation: false, below: nil), isShown: true)]
            )
        }
    }

    func test_transcriptSection_flipFadesTheLayers_withoutAnimatingTheLayout() throws {
        let section = try source("Meeshy/Features/Call/Views/CallTranscriptSection.swift")
        XCTAssertTrue(section.contains("CallJournalAfterCall.layers(for: segment, showsOriginal: showOriginalText)"))
        XCTAssertTrue(section.contains(".opacity(layer.isShown ? 1 : 0)"))
        XCTAssertTrue(section.contains(".accessibilityHidden(!layer.isShown)"))
        XCTAssertTrue(section.contains("value: showOriginalText"), "Le fondu est limité à l'opacité des couches.")
        XCTAssertFalse(section.contains("{ showOriginalText.toggle() }"), "Une transaction autour de la bascule animait aussi la mise en page.")
    }
}
