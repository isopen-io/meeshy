import Testing
import Foundation
@testable import MeeshySDK

/// La légende d'un média (`PostMedia.caption`) ne portait ni langue source ni
/// traductions — le pipeline ZMQ de #6280 la traduit désormais, mais `FeedMedia`
/// doit DÉCLARER `captionLanguage`/`captionTranslations` et les DESCENDRE par le
/// Prisme (`PrismTranslationResolver`, même règle que
/// `MeeshyConversation.resolvedLastMessagePreview`) pour qu'aucune vue ne les
/// jette en silence — le précédent exact de `FeedMediaCaptionTransportTests`.
///
/// DISTINCT de `PostMedia.translations` (pistes audio/transcriptions) : ces
/// témoins ne touchent JAMAIS `translatedAudios`.
@Suite("FeedMedia — traduction de légende (#6280)")
struct FeedMediaCaptionTranslationTests {

    // MARK: - resolvedCaption : règles du Prisme

    @Test("sans traduction, la légende propre est servie telle quelle")
    func noTranslationsServesOwnCaption() {
        let media = FeedMedia(type: .image, caption: "Coucher de soleil")
        #expect(media.resolvedCaption(preferredLanguages: ["en"]) == "Coucher de soleil")
    }

    @Test("aucune langue préférée ⇒ légende propre, jamais une traduction au hasard")
    func noPreferredLanguageFallsBackToOwnCaption() {
        let media = FeedMedia(
            type: .image, caption: "Coucher de soleil",
            captionLanguage: "fr", captionTranslations: ["en": "Sunset"]
        )
        #expect(media.resolvedCaption(preferredLanguages: []) == "Coucher de soleil")
    }

    /// Leçon 261 : un témoin de RANG s'écrit sur un rang AUTRE que le premier —
    /// au rang 1 le court-circuit interdit et la règle juste rendent le même
    /// verdict.
    @Test("la traduction du RANG 2 du lecteur gagne quand le rang 1 est absent")
    func rankTwoWinsWhenRankOneIsMissing() {
        let media = FeedMedia(
            type: .image, caption: "Sunset",
            captionLanguage: "en", captionTranslations: ["fr": "Coucher de soleil"]
        )
        #expect(media.resolvedCaption(preferredLanguages: ["de", "fr"]) == "Coucher de soleil")
    }

    @Test("la langue d'origine concourt à SON rang, jamais en court-circuit")
    func originalLanguageCompetesAtItsRank() {
        // Prisme ['fr','en'], légende écrite en anglais, traduction française
        // disponible ⇒ « Coucher de soleil », jamais « Sunset » (règle #3 du
        // Prisme, § CLAUDE.md racine).
        let media = FeedMedia(
            type: .image, caption: "Sunset",
            captionLanguage: "en", captionTranslations: ["fr": "Coucher de soleil"]
        )
        #expect(media.resolvedCaption(preferredLanguages: ["fr", "en"]) == "Coucher de soleil")
    }

    @Test("la langue d'origine à son rang retourne l'ORIGINAL, jamais translations.first")
    func originalLanguageAtItsRankServesOriginal() {
        let media = FeedMedia(
            type: .image, caption: "Sunset",
            captionLanguage: "en", captionTranslations: ["fr": "Coucher de soleil", "es": "Atardecer"]
        )
        #expect(media.resolvedCaption(preferredLanguages: ["en", "fr"]) == "Sunset")
    }

    @Test("une traduction vide n'est pas une traduction : elle est sautée")
    func blankTranslationIsSkipped() {
        let media = FeedMedia(
            type: .image, caption: "Sunset",
            captionLanguage: "en", captionTranslations: ["fr": "   ", "es": "Atardecer"]
        )
        #expect(media.resolvedCaption(preferredLanguages: ["fr", "es"]) == "Atardecer")
    }

    // MARK: - Décodage du fil (APIPostMedia → FeedMedia)

    @Test("APIPostMedia décode captionLanguage/captionTranslations et les transporte")
    func apiPostMediaDecodesAndTransportsCaptionTranslations() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg",
         "caption":"Sunset","captionLanguage":"en",
         "captionTranslations":{"fr":{"text":"Coucher de soleil","translationModel":"nllb-200","createdAt":"2026-09-14T00:00:00Z"}}}
        """
        let api = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        let feedMedia = api.toFeedMedia()
        #expect(feedMedia.captionLanguage == "en")
        #expect(feedMedia.captionTranslations?["fr"] == "Coucher de soleil")
        #expect(feedMedia.resolvedCaption(preferredLanguages: ["fr"]) == "Coucher de soleil")
    }

    @Test("un blob antérieur au champ décode toujours (clé absente → nil)")
    func legacyPayloadWithoutCaptionTranslationsDecodes() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg","caption":"Sunset"}
        """
        let api = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        let feedMedia = api.toFeedMedia()
        #expect(feedMedia.captionLanguage == nil)
        #expect(feedMedia.captionTranslations == nil)
        #expect(feedMedia.resolvedCaption(preferredLanguages: ["fr"]) == "Sunset")
    }

    @Test("une traduction vide sur le fil n'atteint jamais FeedMedia")
    func emptyWireTranslationIsDropped() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg",
         "caption":"Sunset","captionLanguage":"en",
         "captionTranslations":{"fr":{"text":"","translationModel":"nllb-200","createdAt":"2026-09-14T00:00:00Z"}}}
        """
        let api = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        #expect(api.toFeedMedia().captionTranslations?["fr"] == nil)
    }

    // MARK: - Codable roundtrip (cache GRDB du feed)

    @Test("aller-retour Codable conserve captionLanguage/captionTranslations")
    func codableRoundTripPreservesCaptionTranslations() throws {
        let media = FeedMedia(
            type: .image, caption: "Sunset",
            captionLanguage: "en", captionTranslations: ["fr": "Coucher de soleil"]
        )
        let data = try JSONEncoder().encode(media)
        let decoded = try JSONDecoder().decode(FeedMedia.self, from: data)
        #expect(decoded.captionLanguage == "en")
        #expect(decoded.captionTranslations?["fr"] == "Coucher de soleil")
    }
}
