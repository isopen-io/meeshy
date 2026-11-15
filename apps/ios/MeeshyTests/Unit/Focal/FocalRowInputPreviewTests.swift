import XCTest
import MeeshySDK
@testable import Meeshy

/// **`FocalRowInput.preview` — l'entrée de la rangée plate que l'aperçu
/// d'appui long rend en Script et en Focal** (#11208, décision #11204).
///
/// La fabrique est pure : elle reçoit le message, ses traductions et la
/// traduction que le fil sert déjà, et rend la rangée que le fil montre — le
/// texte servi, l'accent de la conversation, la densité du mode, les effets
/// persistants, et une identité ENTIÈRE. La capture de la cellule vivante
/// tranchait l'identité et la méta, posées à cheval sur son cadre (directive
/// 2026-08-23) : la rangée rendue ici est une tête de groupe au repos, jamais
/// l'élue Focal dont le chrome déborde.
@MainActor
final class FocalRowInputPreviewTests: XCTestCase {

    // MARK: - Fabriques

    private func koreanMessage(isMe: Bool = false) -> Message {
        var message = Message(id: "m9", conversationId: "c1", senderId: "u2",
                              content: "이제 12일만 기다리면 돼 ❤️", senderName: "Demo")
        message.originalLanguage = "ko"
        message.senderColor = "#F59E0B"
        message.isMe = isMe
        return message
    }

    private func translation(_ language: String, _ text: String) -> MessageTranslation {
        MessageTranslation(id: "m9-\(language)", messageId: "m9", sourceLanguage: "ko",
                           targetLanguage: language, translatedContent: text,
                           translationModel: "nllb", confidenceScore: nil)
    }

    private func preview(
        message: Message? = nil,
        translations: [MessageTranslation],
        served: MessageTranslation? = nil,
        density: FocalRowInput.Density = .script,
        context: FocalRowInput.PreviewContext = FocalRowInput.PreviewContext()
    ) -> FocalRowInput {
        FocalRowInput.preview(message: message ?? koreanMessage(), translations: translations, servedTranslation: served,
                              accentHex: "#6366F1", density: density, context: context)
    }

    // MARK: - Le texte que le fil sert

    /// Le fil a déjà descendu le Prisme (`preferredTranslation(for:)`, override
    /// manuel compris) : l'aperçu rend SON choix tel quel, même quand une
    /// traduction d'un autre rang existe — jamais une seconde descente.
    func test_preview_servesTheThreadsChoice_asIs() {
        let english = translation("en", "Only 12 more days ❤️")
        let row = preview(translations: [translation("fr", "Plus que 12 jours ❤️"), english], served: english)

        XCTAssertEqual(row.content.text?.raw, "Only 12 more days ❤️")
        XCTAssertEqual(row.content.translation?.activeLangCode, "en")
    }

    /// Le fil sert l'ORIGINAL (aucun rang servi, ou override vers l'original) :
    /// l'aperçu ne le remplace pas par une traduction prise au hasard.
    func test_preview_threadServesTheOriginal_isKept() {
        let row = preview(translations: [translation("fr", "Plus que 12 jours ❤️")], served: nil)

        XCTAssertEqual(row.content.text?.raw, "이제 12일만 기다리면 돼 ❤️")
    }

    /// La rangée et le texte de référence de l'aperçu (`previewServedText`) lisent
    /// la même source : jamais deux textes pour un même message.
    func test_preview_text_isThePreviewServedText() {
        let french = translation("fr", "Plus que 12 jours ❤️")
        let row = preview(translations: [french], served: french)
        let served = MessageOverlayMenu.previewServedText(
            message: koreanMessage(), textTranslations: [french], translatedAudios: [],
            preferredTranslation: french, userLanguages: (regional: nil, custom: nil),
            selection: nil, usesFlatRow: true, preferredAudioLangCode: nil, currentUserId: "")

        XCTAssertEqual(row.content.text?.raw, served.text)
    }

    /// Le drapeau basculé dans le fil gouverne la face affichée, par-dessus la
    /// traduction servie.
    func test_preview_followsTheFlagSelectedInTheThread() {
        let french = translation("fr", "Plus que 12 jours ❤️")
        let selection = ConversationViewModel.BubbleLanguageSelection(activeDisplayLangCode: "en", secondaryLangCode: nil)
        let row = preview(translations: [french, translation("en", "Only 12 more days ❤️")], served: french,
                          context: FocalRowInput.PreviewContext(selection: selection))

        XCTAssertEqual(row.content.text?.raw, "Only 12 more days ❤️")
        XCTAssertEqual(row.activeDisplayLangCode, "en")
    }

    // MARK: - L'accent et la densité

    func test_preview_carriesTheConversationAccent() {
        XCTAssertEqual(preview(translations: []).accentHex, "#6366F1")
    }

    func test_preview_senderColor_isTheSendersOwn() {
        XCTAssertEqual(preview(translations: []).senderColorHex, "#F59E0B")
    }

    func test_preview_carriesTheDensityOfTheMode() {
        XCTAssertEqual(preview(translations: [], density: .script).density, .script)
        XCTAssertEqual(preview(translations: [], density: .focal).density, .focal)
    }

    // MARK: - Une identité non coupée

    /// Tête ET fin de groupe : l'identité (pastille, nom) et la méta (drapeaux)
    /// sont DANS la rangée.
    func test_preview_isAWholeGroup_soIdentityAndMetaAreDrawn() {
        let row = preview(translations: [])

        XCTAssertTrue(row.isFirstInGroup, "l'identité ne se dessine qu'en tête de groupe")
        XCTAssertTrue(row.isLastInGroup, "les drapeaux ne se dessinent qu'en fin de groupe")
        XCTAssertEqual(row.senderDisplayName, "Demo")
    }

    /// Jamais l'élue Focal : son chrome (carte, pastille d'identité soulevée)
    /// déborde du cadre de la rangée, c'est lui que la capture tranchait.
    func test_preview_isNeverTheFocalElect_whoseChromeOverflows() {
        let row = preview(translations: [], density: .focal)

        XCTAssertFalse(row.isFocused)
        XCTAssertFalse(row.isExpanded)
        XCTAssertNil(row.focusTimestamp)
    }

    /// Un aperçu n'est ni un envoi en cours, ni le dernier reçu (pas de « + »).
    func test_preview_isStill() {
        let row = preview(translations: [])

        XCTAssertFalse(row.isOptimistic)
        XCTAssertFalse(row.isLastReceivedMessage)
    }

    func test_preview_identifiesTheMessage() {
        let row = preview(translations: [])

        XCTAssertEqual(row.localId, "m9")
        XCTAssertEqual(row.senderId, "u2")
    }

    // MARK: - Au plus près de la cellule visible

    /// Les effets PERSISTANTS (arc-en-ciel, lueur…) se voient dans le fil : la
    /// rangée de l'aperçu les garde, comme la bulle les garde en Bulles. Les
    /// effets d'APPARITION, eux, ne se rejouent pas sous le doigt.
    func test_preview_keepsPersistentEffects_dropsAppearanceOnes() {
        var message = koreanMessage()
        message.effects = MessageEffects(flags: [.rainbow, .glow, .confetti, .shake])

        let flags = preview(message: message, translations: []).effects.flags

        XCTAssertTrue(flags.contains(.rainbow), "l'arc-en-ciel du fil reste dans l'aperçu")
        XCTAssertTrue(flags.contains(.glow), "la lueur du fil reste dans l'aperçu")
        XCTAssertTrue(flags.intersection(.appearanceMask).isEmpty, "aucun effet d'apparition ne se rejoue")
    }

    /// L'anneau de story et l'humeur autour de la pastille sont ceux de la
    /// cellule : ils ne disparaissent pas entre la rangée et son aperçu.
    func test_preview_carriesTheSendersStoryRingAndMood() {
        let row = preview(translations: [],
                          context: FocalRowInput.PreviewContext(senderStoryRing: .unread, senderMoodEmoji: "🌴"))

        XCTAssertEqual(row.senderStoryRing, .unread)
        XCTAssertEqual(row.senderMoodEmoji, "🌴")
    }

    /// La présence d'un message à soi n'est pas dessinée, comme dans la cellule
    /// (`messageCellInputs` : `isMine ? nil`).
    func test_preview_ownMessage_drawsNoPresence() {
        let row = preview(message: koreanMessage(isMe: true), translations: [],
                          context: FocalRowInput.PreviewContext(senderPresence: .online))

        XCTAssertEqual(row.senderPresence, .offline)
    }
}
