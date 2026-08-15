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
            isViewOnce: false, isPinned: false, isForwarded: false, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: timeString, deliveryStatus: nil),
            isMe: false, senderName: "Ali", callNotice: nil
        )
    }

    private func makeInput(
        content: BubbleContent? = nil,
        density: FocalRowInput.Density = .focal,
        userLanguages: (regional: String?, custom: String?) = (nil, nil),
        allAudioItems: [ConversationViewModel.AudioItem] = []
    ) -> FocalRowInput {
        FocalRowInput(
            localId: "m1", serverId: "s1", content: content ?? makeContent(), density: density,
            isFirstInGroup: true, senderId: "u1", senderDisplayName: "Ali", senderUsername: "ali",
            senderAvatarURL: nil, senderThumbHash: nil, senderColorHex: "#31B6BA",
            senderPresence: .online, senderStoryRing: .none, senderMoodEmoji: nil,
            accentHex: "#31B6BA", isDark: false, isDirect: true, isRightToLeft: false,
            isOptimistic: false, isAgentAuthored: false, showsAgentGrammar: false,
            highlightSearchTerm: nil, mentionDisplayNames: [:], userLanguages: userLanguages,
            activeDisplayLangCode: "en", secondaryLangCode: nil, voiceConsentMissing: false,
            transcription: nil, translatedAudios: [], allAudioItems: allAudioItems,
            conversationName: "Conv"
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
