import XCTest
import MeeshySDK
@testable import Meeshy

/// **`FocalRowInput.preview` — l'entrée de la rangée plate que l'aperçu
/// d'appui long rend en Script et en Focal** (#11208, décision #11204).
///
/// La fabrique est pure : elle reçoit le message et ses traductions, et rend la
/// rangée que le fil montre — le texte servi par le Prisme, l'accent de la
/// conversation, la densité du mode, et une identité ENTIÈRE. La capture de la
/// cellule vivante tranchait l'identité et la méta, posées à cheval sur son
/// cadre (directive 2026-08-23) : la rangée rendue ici est une tête de groupe
/// au repos, jamais l'élue Focal dont le chrome déborde.
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
        translations: [MessageTranslation],
        density: FocalRowInput.Density = .script,
        context: FocalRowInput.PreviewContext = FocalRowInput.PreviewContext()
    ) -> FocalRowInput {
        FocalRowInput.preview(message: koreanMessage(), translations: translations,
                              accentHex: "#6366F1", density: density, context: context)
    }

    // MARK: - Le texte servi par le Prisme

    /// Prisme `['fr', 'en']`, aucune traduction française : le rang 2 est servi,
    /// jamais l'original coréen ni `translations.first`.
    func test_preview_rankOneMissing_servesRankTwo() {
        let row = preview(translations: [translation("es", "Solo 12 días más ❤️"), translation("en", "Only 12 more days ❤️")],
                          context: FocalRowInput.PreviewContext(readerPrism: ["fr", "en"]))

        XCTAssertEqual(row.content.text?.raw, "Only 12 more days ❤️")
        XCTAssertEqual(row.content.translation?.activeLangCode, "en")
    }

    /// Le rang 1 servi gagne sur le rang 2.
    func test_preview_rankOneServed_winsOverRankTwo() {
        let row = preview(translations: [translation("en", "Only 12 more days ❤️"), translation("fr", "Plus que 12 jours ❤️")],
                          context: FocalRowInput.PreviewContext(readerPrism: ["fr", "en"]))

        XCTAssertEqual(row.content.text?.raw, "Plus que 12 jours ❤️")
    }

    /// Aucune langue du lecteur n'est servie : l'original, jamais une traduction
    /// prise au hasard.
    func test_preview_noRankServed_servesTheOriginal() {
        let row = preview(translations: [translation("es", "Solo 12 días más ❤️")],
                          context: FocalRowInput.PreviewContext(readerPrism: ["fr", "en"]))

        XCTAssertEqual(row.content.text?.raw, "이제 12일만 기다리면 돼 ❤️")
    }

    /// Le choix que le fil a déjà résolu (override manuel compris) prime sur la
    /// descente : l'aperçu dit ce que la cellule dit.
    func test_preview_threadChoice_winsOverThePrism() {
        let english = translation("en", "Only 12 more days ❤️")
        let row = preview(translations: [english, translation("fr", "Plus que 12 jours ❤️")],
                          context: FocalRowInput.PreviewContext(readerPrism: ["fr"], chosenTranslation: .some(english)))

        XCTAssertEqual(row.content.text?.raw, "Only 12 more days ❤️")
    }

    /// Un override vers l'ORIGINAL (`activeTranslationOverrides[id] = nil`) est un
    /// choix, pas une absence : la descente ne le remplace pas.
    func test_preview_threadChoiceOfTheOriginal_isKept() {
        let row = preview(translations: [translation("fr", "Plus que 12 jours ❤️")],
                          context: FocalRowInput.PreviewContext(readerPrism: ["fr"], chosenTranslation: .some(nil)))

        XCTAssertEqual(row.content.text?.raw, "이제 12일만 기다리면 돼 ❤️")
    }

    /// La rangée et le texte de référence de l'aperçu (`previewServedText`) lisent
    /// la même source : jamais deux textes pour un même message.
    func test_preview_text_isThePreviewServedText() {
        let french = translation("fr", "Plus que 12 jours ❤️")
        let row = preview(translations: [french], context: FocalRowInput.PreviewContext(chosenTranslation: .some(french)))
        let served = MessageOverlayMenu.previewServedText(
            message: koreanMessage(), textTranslations: [french], translatedAudios: [],
            preferredTranslation: french, userLanguages: (regional: nil, custom: nil),
            selection: nil, usesFlatRow: true, preferredAudioLangCode: nil, currentUserId: "")

        XCTAssertEqual(row.content.text?.raw, served.text)
    }

    /// Le drapeau basculé dans le fil gouverne la face affichée.
    func test_preview_followsTheFlagSelectedInTheThread() {
        let selection = ConversationViewModel.BubbleLanguageSelection(activeDisplayLangCode: "en", secondaryLangCode: nil)
        let row = preview(translations: [translation("fr", "Plus que 12 jours ❤️"), translation("en", "Only 12 more days ❤️")],
                          context: FocalRowInput.PreviewContext(readerPrism: ["fr"], selection: selection))

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

    /// Un aperçu n'est ni un envoi en cours, ni le dernier reçu (pas de « + »),
    /// et il ne rejoue aucun effet d'apparition.
    func test_preview_isStill() {
        let row = preview(translations: [])

        XCTAssertFalse(row.isOptimistic)
        XCTAssertFalse(row.isLastReceivedMessage)
        XCTAssertEqual(row.effects, .none)
    }

    func test_preview_identifiesTheMessage() {
        let row = preview(translations: [])

        XCTAssertEqual(row.localId, "m9")
        XCTAssertEqual(row.senderId, "u2")
    }
}
