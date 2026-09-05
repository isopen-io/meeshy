import XCTest
import MeeshySDK
@testable import Meeshy

/// F-083 (WS-4) — `FocalRowInput.==` : le gate de re-render
/// (`EquatableFocalRow(row:).equatable()`). `userLanguages` est un TUPLE
/// (aucune conformance `Equatable` synthétisable automatiquement pour un
/// type qui en porte un en propriété stockée) — `==` est manuelle, ce test
/// prouve qu'elle couvre bien CE champ, pas seulement les champs
/// "faciles" à synthétiser.
@MainActor
final class FocalRowInputEquatableTests: XCTestCase {

    // MARK: - Fabrique minimale

    private func makeContent(messageId: String = "m1", timeString: String = "10:41") -> BubbleContent {
        BubbleContent(
            messageId: messageId, kind: .standard, text: nil, translation: nil, reply: nil,
            attachments: .none, location: nil, ephemeral: nil, isBlurred: false,
            isViewOnce: false, isPinned: false, forwardAttribution: nil, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: timeString, deliveryStatus: nil),
            isMe: false, senderName: "Ali", callNotice: nil, joinNotice: nil
        )
    }

    private func makeInput(
        content: BubbleContent? = nil,
        density: FocalRowInput.Density = .focal,
        userLanguages: (regional: String?, custom: String?) = (nil, nil),
        allAudioItems: [ConversationViewModel.AudioItem] = [],
        effects: MessageEffects = .none,
        senderIsAnonymous: Bool = false
    ) -> FocalRowInput {
        FocalRowInput(
            localId: "m1", serverId: "s1", content: content ?? makeContent(), density: density,
            isFirstInGroup: true, senderId: "u1", senderDisplayName: "Ali", senderUsername: "ali",
            senderAvatarURL: nil, senderThumbHash: nil, senderColorHex: "#31B6BA",
            senderPresence: .online, senderStoryRing: .none, senderMoodEmoji: nil,
            senderIsAnonymous: senderIsAnonymous,
            accentHex: "#31B6BA", isDark: false, isDirect: true, isRightToLeft: false,
            isOptimistic: false, isAgentAuthored: false, showsAgentGrammar: false,
            highlightSearchTerm: nil, mentionDisplayNames: [:], userLanguages: userLanguages,
            activeDisplayLangCode: "en", secondaryLangCode: nil, voiceConsentMissing: false,
            transcription: nil, translatedAudios: [], allAudioItems: allAudioItems,
            conversationName: "Conv", effects: effects
        )
    }

    // MARK: - Égalité de base

    func test_identicalInputs_areEqual() {
        XCTAssertEqual(makeInput(), makeInput())
    }

    func test_differentContent_areNotEqual() {
        XCTAssertNotEqual(makeInput(content: makeContent(messageId: "m1")), makeInput(content: makeContent(messageId: "m2")))
    }

    func test_differentDensity_areNotEqual() {
        XCTAssertNotEqual(makeInput(density: .focal), makeInput(density: .script))
    }

    // MARK: - `effects` (F-083ter, F15) — AJOUT narrow au gel, valeur par défaut `.none`

    /// Le site de montage historique (`MessageListViewController.swift:1159`,
    /// hors périmètre F-083ter) ne passe pas `effects` — la valeur par
    /// défaut `.none` garantit sa compilation SANS modification.
    func test_effects_defaultsToNone() {
        XCTAssertEqual(makeInput().effects, .none)
    }

    func test_differentEffects_areNotEqual() {
        let flagged = MessageEffects(flags: .confetti)
        XCTAssertNotEqual(makeInput(effects: .none), makeInput(effects: flagged))
    }

    // MARK: - Le tuple `userLanguages` — la raison d'être du `==` manuel

    func test_sameUserLanguagesTuple_isEqual() {
        XCTAssertEqual(
            makeInput(userLanguages: ("fr-FR", "en")),
            makeInput(userLanguages: ("fr-FR", "en"))
        )
    }

    func test_differentRegionalLanguage_inTuple_isNotEqual() {
        XCTAssertNotEqual(
            makeInput(userLanguages: ("fr-FR", nil)),
            makeInput(userLanguages: ("en-US", nil))
        )
    }

    func test_differentCustomLanguage_inTuple_isNotEqual() {
        XCTAssertNotEqual(
            makeInput(userLanguages: (nil, "fr")),
            makeInput(userLanguages: (nil, "en"))
        )
    }

    // MARK: - `allAudioItems` — comparé par id (non-Equatable côté ViewModel)

    private func audioItem(id: String) -> ConversationViewModel.AudioItem {
        // Même fabrique que `AudioMediaViewRenderTests.swift` (déjà prouvée
        // contre ce même type `ConversationViewModel.AudioItem`).
        let message = MeeshyMessage(
            id: "msg1", conversationId: "c1", senderId: "u1", content: "",
            originalLanguage: "fr", createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0)
        )
        return ConversationViewModel.AudioItem(
            id: id,
            attachment: MeeshyMessageAttachment(id: id, fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1),
            message: message,
            transcription: nil,
            translatedAudios: []
        )
    }

    func test_sameAudioItemIds_isEqual() {
        XCTAssertEqual(
            makeInput(allAudioItems: [audioItem(id: "a1")]),
            makeInput(allAudioItems: [audioItem(id: "a1")])
        )
    }

    func test_differentAudioItemIds_isNotEqual() {
        XCTAssertNotEqual(
            makeInput(allAudioItems: [audioItem(id: "a1")]),
            makeInput(allAudioItems: [audioItem(id: "a2")])
        )
    }

    // MARK: - `FocalRowActions` reste EXCLU de l'égalité (patron BubbleFooterActions)

    func test_focalRowActions_hasNoEqualityRequirement_compilesWithClosures() {
        // Ce test EST la preuve : `FocalRowActions` n'est pas `Equatable` —
        // s'il l'était par erreur (closures comparées par erreur), ce fichier
        // ne compilerait pas ou `EquatableFocalRow` ne pourrait pas ignorer
        // `actions` dans son `==`. Rien à assert au runtime, seule la
        // COMPILATION de ce test avec des closures distinctes fait foi.
        _ = FocalRowActions(onReplyTap: { _ in }, onMediaTap: { _ in })
        _ = FocalRowActions(onReplyTap: { _ in }, onMediaTap: { _ in })
    }
}

// ─── Marquage des auteurs sans compte ────────────────────────────────────────
//
// `FocalRowInput.==` est le GATE de re-render de la rangée. Un champ oublié dans
// cette égalité n'est pas une omission cosmétique : la rangée cesse de se
// réévaluer quand ce champ change, et le glyphe reste celui du message
// précédent — deux auteurs enchaînés, l'un anonyme, l'autre non, se rendraient
// avec la même marque.
//
// Le drapeau vient de `Participant.type` (`MeeshyMessage.senderIsAnonymous`),
// jamais du pseudo : `ano_` est lisible, pas réservé, et un compte peut le
// porter.

extension FocalRowInputEquatableTests {

    func test_equality_distinguishesAnonymousSender() {
        XCTAssertNotEqual(makeInput(senderIsAnonymous: true), makeInput(senderIsAnonymous: false))
    }

    func test_equality_sameAnonymityStaysEqual() {
        XCTAssertEqual(makeInput(senderIsAnonymous: true), makeInput(senderIsAnonymous: true))
    }

    /// Défaut `false` : les centaines de sites qui construisent une rangée sans
    /// se prononcer ne marquent personne. Marquer à tort un inscrit comme
    /// « sans compte » serait une affirmation fausse sur son identité.
    func test_input_defaultsToNotAnonymous() {
        XCTAssertFalse(makeInput().senderIsAnonymous)
    }
}

// MARK: - Message en focus (Focal, 2026-08-21)

extension FocalRowInputEquatableTests {

    private func makeFocusInput(isFocused: Bool, sentAt: Date? = nil) -> FocalRowInput {
        FocalRowInput(
            localId: "m1", serverId: "s1", content: makeContent(), density: .focal,
            isFirstInGroup: false, senderId: "u1", senderDisplayName: "Ali", senderUsername: "ali",
            senderAvatarURL: nil, senderThumbHash: nil, senderColorHex: "#31B6BA",
            senderPresence: .online, senderStoryRing: .none, senderMoodEmoji: nil,
            accentHex: "#31B6BA", isDark: false, isDirect: true, isRightToLeft: false,
            isOptimistic: false, isAgentAuthored: false, showsAgentGrammar: false,
            highlightSearchTerm: nil, mentionDisplayNames: [:], userLanguages: (nil, nil),
            activeDisplayLangCode: "en", secondaryLangCode: nil, voiceConsentMissing: false,
            transcription: nil, translatedAudios: [], allAudioItems: [],
            conversationName: "Conv", isFocused: isFocused, sentAt: sentAt
        )
    }

    func test_isFocused_defaultsToFalse_andParticipatesInEquality() {
        XCTAssertFalse(makeInput().isFocused)
        XCTAssertNotEqual(makeFocusInput(isFocused: true), makeFocusInput(isFocused: false),
                          "passer en focus DOIT traverser le portillon .equatable() : la rangée gagne son identité et son plafond de texte")
        XCTAssertEqual(makeFocusInput(isFocused: true), makeFocusInput(isFocused: true))
    }

    func test_sentAt_participatesInEquality() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertNotEqual(makeFocusInput(isFocused: true, sentAt: now), makeFocusInput(isFocused: true, sentAt: nil))
    }
}

// MARK: - (+) d'ajout rapide de réaction — dernier message reçu (2026-08-21)

extension FocalRowInputEquatableTests {

    private func makePositionInput(isLastReceivedMessage: Bool) -> FocalRowInput {
        FocalRowInput(
            localId: "m1", serverId: "s1", content: makeContent(), density: .script,
            isFirstInGroup: true, senderId: "u1", senderDisplayName: "Ali", senderUsername: "ali",
            senderAvatarURL: nil, senderThumbHash: nil, senderColorHex: "#31B6BA",
            senderPresence: .online, senderStoryRing: .none, senderMoodEmoji: nil,
            accentHex: "#31B6BA", isDark: false, isDirect: true, isRightToLeft: false,
            isOptimistic: false, isAgentAuthored: false, showsAgentGrammar: false,
            highlightSearchTerm: nil, mentionDisplayNames: [:], userLanguages: (nil, nil),
            activeDisplayLangCode: "en", secondaryLangCode: nil, voiceConsentMissing: false,
            transcription: nil, translatedAudios: [], allAudioItems: [],
            conversationName: "Conv", isLastReceivedMessage: isLastReceivedMessage
        )
    }

    func test_isLastReceivedMessage_defaultsToFalse_andParticipatesInEquality() {
        XCTAssertFalse(makeInput().isLastReceivedMessage, "Sans signal de l'hôte, pas de (+) : le défaut est prudent.")
        XCTAssertNotEqual(
            makePositionInput(isLastReceivedMessage: true), makePositionInput(isLastReceivedMessage: false),
            "Devenir (ou cesser d'être) le dernier message reçu DOIT traverser le portillon .equatable() : " +
            "c'est ce qui monte ou démonte le bouton (+) d'ajout rapide."
        )
        XCTAssertEqual(makePositionInput(isLastReceivedMessage: true), makePositionInput(isLastReceivedMessage: true))
    }
}
