import XCTest
import MeeshySDK
@testable import Meeshy

/// F-082 (WS-3) — critère §7 « routage audio → une seule décision, jamais
/// deux footers, jamais de caption dupliquée (les 4 modes couverts) ».
/// `FocalAudioRouting.mode(for:)` reproduit `audioIsSoleContent`/
/// `audioHostsCaption` (`BubbleStandardLayout.swift`, `private`, non
/// réutilisables — RE-PREUVE en tête de `FocalAudioBlock.swift`) +
/// `BubbleContent.audioHostsReply` (public) + le garde carrousel (`.audio`
/// pur, `count > 1`).
@MainActor
final class FocalAudioRoutingTests: XCTestCase {

    // MARK: - Fabrique minimale (même patron que `A11yLabelComposerTests`)

    private func makeContent(
        text: String? = nil,
        reply: BubbleContent.Reply? = nil,
        attachments: BubbleContent.Attachments = .none,
        isEmojiOnly: Bool = false
    ) -> BubbleContent {
        BubbleContent(
            messageId: "m1",
            kind: .standard,
            text: text.map {
                BubbleContent.Text(
                    raw: $0, isEmojiOnly: isEmojiOnly, emojiFontSize: nil,
                    firstLinkURL: nil, embeddedVideo: nil, trackedLinks: [:], embedTrackedURL: nil
                )
            },
            translation: nil,
            reply: reply,
            attachments: attachments,
            location: nil,
            ephemeral: nil,
            isBlurred: false,
            isViewOnce: false,
            isPinned: false,
            forwardAttribution: nil,
            editedAt: nil,
            isEditSaving: false,
            hasEditHistory: false,
            reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: false,
            senderName: "Ali",
            callNotice: nil, joinNotice: nil
        )
    }

    private func audioAttachment(id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)
    }

    private func fakeReply() -> BubbleContent.Reply {
        BubbleContent.Reply(
            reference: ReplyReference(
                messageId: "quoted1", authorName: "Bo", previewText: "hello",
                isMe: false, authorColor: "#31B6BA"
            ),
            isStory: false
        )
    }

    // MARK: - .none

    func test_noAudio_isNone() {
        XCTAssertEqual(FocalAudioRouting.mode(for: makeContent()), .none)
        XCTAssertEqual(FocalAudioRouting.mode(for: makeContent(text: "hello")), .none)
    }

    // MARK: - .carousel

    func test_pureAudioMultiTrack_isCarousel() {
        let content = makeContent(attachments: .audio([audioAttachment(id: "a1"), audioAttachment(id: "a2")]))
        XCTAssertEqual(FocalAudioRouting.mode(for: content), .carousel)
    }

    /// Garde : un `.mixed` multi-audio retombe au traitement standard —
    /// PAS carrousel (miroir de `BubbleStandardLayout.swift:766-769`).
    func test_mixedMultiTrackAudio_isNotCarousel() {
        let content = makeContent(attachments: .mixed(
            visual: [], audio: [audioAttachment(id: "a1"), audioAttachment(id: "a2")], nonMedia: []
        ))
        XCTAssertNotEqual(FocalAudioRouting.mode(for: content), .carousel)
    }

    func test_singleTrackAudio_isNeverCarousel() {
        let content = makeContent(attachments: .audio([audioAttachment(id: "a1")]))
        XCTAssertNotEqual(FocalAudioRouting.mode(for: content), .carousel)
    }

    // MARK: - .soleWithFooter

    func test_audioAlone_noTextNoReply_isSoleWithFooter() {
        let content = makeContent(attachments: .audio([audioAttachment(id: "a1")]))
        XCTAssertEqual(FocalAudioRouting.mode(for: content), .soleWithFooter)
    }

    // MARK: - .hostsReply

    func test_audioWithReply_noText_isHostsReply() {
        let content = makeContent(reply: fakeReply(), attachments: .audio([audioAttachment(id: "a1")]))
        XCTAssertEqual(FocalAudioRouting.mode(for: content), .hostsReply)
    }

    /// Le `.audio` PUR + texte N'EST PAS un caption — c'est
    /// `.soleWithFooter`, exactement comme la bulle.
    ///
    /// `BubbleContent.hasTextOrNonMediaContent` (`BubbleContent.swift:207-215`,
    /// PUBLIQUE et partagée par les deux implémentations) renvoie
    /// délibérément `false` pour « audio-only with transcription text » : sur
    /// un message dont les pièces jointes sont le cas `.audio` PUR, le texte
    /// EST la transcription du vocal, et le widget audio la rend lui-même —
    /// aucune bulle texte séparée. Il s'ensuit, côté bulle, que
    /// `audioIsSoleContent` (`BubbleStandardLayout.swift:278`) est VRAI et
    /// `audioHostsCaption` (`:301`) FAUX : le footer est injecté dans le
    /// widget, `embedsCaption` reste `false`.
    ///
    /// La parité du fil (le comportement bulle fait foi) impose donc
    /// `.soleWithFooter` ici. `audioHostsCaption` sert les cas où le
    /// texte/lieu/pièce non-média N'EST PAS une transcription — voir le test
    /// suivant.
    func test_pureAudioWithText_isSoleWithFooter_notCaption_bubbleParity() {
        let content = makeContent(text: "un mot", attachments: .audio([audioAttachment(id: "a1")]))
        XCTAssertEqual(
            FocalAudioRouting.mode(for: content), .soleWithFooter,
            "parité bulle : `.audio` pur + texte ⇒ audioIsSoleContent, jamais audioHostsCaption"
        )
    }

    // MARK: - .hostsCaption

    /// Le cas caption RÉEL : audio + texte dans un `.mixed` SANS visuel.
    /// `.mixed` n'est pas le cas `.audio` pur, donc l'exclusion
    /// « audio-only with transcription text » ne s'applique pas :
    /// `hasTextOrNonMediaContent` est vrai, `audioHostsCaption` l'est aussi
    /// (pas de reply, pas de pièce jointe visuelle) et le texte devient la
    /// légende rendue DANS le `playerBackground`.
    func test_mixedAudioWithText_noVisual_noReply_isHostsCaption() {
        let content = makeContent(text: "un mot", attachments: .mixed(
            visual: [], audio: [audioAttachment(id: "a1")], nonMedia: []
        ))
        XCTAssertEqual(FocalAudioRouting.mode(for: content), .hostsCaption)
    }

    /// Garde : audio + texte + grille visuelle (`.mixed`) N'EST PAS caption
    /// — le texte devient la légende de la grille visuelle, pas de l'audio
    /// (miroir `audioHostsCaption`, exclusion « visualAttachments.isEmpty »).
    func test_audioWithTextAndVisual_isNotHostsCaption() {
        let visual = MeeshyMessageAttachment(id: "v1", fileName: "v", originalName: "v", mimeType: "image/jpeg", fileSize: 1)
        let content = makeContent(text: "un mot", attachments: .mixed(
            visual: [visual], audio: [audioAttachment(id: "a1")], nonMedia: []
        ))
        XCTAssertNotEqual(FocalAudioRouting.mode(for: content), .hostsCaption)
    }

    // MARK: - .standalone (résidu)

    func test_emojiOnlyAudioWithReply_fallsThroughToStandalone_notSoleWithFooter() {
        // emoji-only + reply : ni soleContent (guard emoji-only exclut),
        // ni hostsReply (`BubbleContent.audioHostsReply` exige `!isEmojiOnly`).
        let content = makeContent(text: "😀", reply: fakeReply(), attachments: .audio([audioAttachment(id: "a1")]), isEmojiOnly: true)
        XCTAssertEqual(FocalAudioRouting.mode(for: content), .standalone)
    }

    // MARK: - Exhaustivité — jamais deux décisions à la fois

    func test_modesAreMutuallyExclusive_forASampleMatrix() {
        let visual = MeeshyMessageAttachment(id: "v1", fileName: "v", originalName: "v", mimeType: "image/jpeg", fileSize: 1)
        let matrix: [BubbleContent.Attachments] = [
            .audio([audioAttachment(id: "a1")]),
            .audio([audioAttachment(id: "a1"), audioAttachment(id: "a2")]),
            .mixed(visual: [visual], audio: [audioAttachment(id: "a1")], nonMedia: [])
        ]
        for attachments in matrix {
            for text in [nil, "hello"] {
                for reply in [nil, fakeReply()] {
                    let content = makeContent(text: text, reply: reply, attachments: attachments)
                    // Une seule décision est toujours retournée — jamais un
                    // crash, jamais une ambiguïté (le type de retour EST la
                    // preuve : un enum ne peut porter deux cas à la fois).
                    _ = FocalAudioRouting.mode(for: content)
                }
            }
        }
    }
}
