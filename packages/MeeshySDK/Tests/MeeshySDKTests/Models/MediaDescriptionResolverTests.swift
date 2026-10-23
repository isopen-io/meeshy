import Foundation
import Testing
@testable import MeeshySDK

/// #12333 — la description d'un média, dans la langue du lecteur : miroir de
/// `resolveMediaDescription` (`packages/shared/utils/media-description.ts`),
/// mêmes cas que `media-description.test.ts`.
struct MediaDescriptionResolverTests {

    private static let author = MediaDescriptionResolver.Source(
        original: "Un chat qui chante", language: "fr", translations: ["es": "Un gato que canta"])
    private static let transcript = MediaDescriptionResolver.Source(
        original: "Bonjour à tous.", language: "fr",
        translations: ["en": "Hello everyone.", "es": "Hola a todos."])

    @Test func resolve_rangServiParLaDescriptionDeLAuteur_laTraductionDeLAuteur() {
        let served = MediaDescriptionResolver.resolve(author: Self.author, transcript: Self.transcript, preferredLanguages: ["es"], isProtected: false)
        #expect(served == .init(text: "Un gato que canta", language: "es", translated: true))
    }

    @Test func resolve_rangAbsentChezLAuteur_laTranscriptionAuRangSuivant() {
        let served = MediaDescriptionResolver.resolve(author: Self.author, transcript: Self.transcript, preferredLanguages: ["it", "en"], isProtected: false)
        #expect(served == .init(text: "Hello everyone.", language: "en", translated: true))
    }

    @Test func resolve_langueDOrigineASonRang_lOriginal() {
        let served = MediaDescriptionResolver.resolve(author: Self.author, transcript: Self.transcript, preferredLanguages: ["fr", "en"], isProtected: false)
        #expect(served == .init(text: "Un chat qui chante", language: "fr", translated: false))
    }

    @Test func resolve_aucunRangServi_lOriginalDeLAuteur_jamaisLaPremiereTraduction() {
        let served = MediaDescriptionResolver.resolve(author: Self.author, transcript: Self.transcript, preferredLanguages: ["ja"], isProtected: false)
        #expect(served == .init(text: "Un chat qui chante", language: "fr", translated: false))
    }

    @Test func resolve_sansDescription_laTranscriptionParDefaut() {
        let served = MediaDescriptionResolver.resolve(author: nil, transcript: Self.transcript, preferredLanguages: ["it", "es"], isProtected: false)
        #expect(served == .init(text: "Hola a todos.", language: "es", translated: true))
    }

    @Test func resolve_pieceProtegee_rien() {
        #expect(MediaDescriptionResolver.resolve(author: Self.author, transcript: Self.transcript, preferredLanguages: ["fr"], isProtected: true) == nil)
    }

    @Test func servedDescription_pieceFloutee_rien() {
        let attachment = MeeshyMessageAttachment(mimeType: "image/jpeg", alt: "Un chat", isBlurred: true, altLanguage: "fr")
        #expect(attachment.servedDescription(preferredLanguages: ["fr"]) == nil)
    }

    @Test func servedDescription_descriptionTraduite_auRangDuLecteur() {
        let attachment = MeeshyMessageAttachment(mimeType: "image/jpeg", alt: "Un chat roux", altLanguage: "fr", altTranslations: ["de": "Eine rote Katze"])
        #expect(attachment.servedDescription(preferredLanguages: ["es", "de"])?.text == "Eine rote Katze")
    }

    @Test func servedDescription_descriptionRetenueParLaPasserelle_jamaisLaTranscription() {
        let attachment = MeeshyMessageAttachment(
            mimeType: "audio/mp4",
            transcription: .init(text: "Le code est 4512", language: "fr"),
            descriptionWithheld: true)
        #expect(attachment.servedDescription(preferredLanguages: ["fr"]) == nil)
    }

    @Test func servedDescription_messageProtege_jamaisLaTranscription() {
        let attachment = MeeshyMessageAttachment(mimeType: "audio/mp4", transcription: .init(text: "Le code est 4512", language: "fr"))
        #expect(attachment.servedDescription(preferredLanguages: ["fr"], carrierIsProtected: true) == nil)
        #expect(attachment.servedDescription(preferredLanguages: ["fr"])?.text == "Le code est 4512")
    }

    @Test func decodage_descriptionRetenue() throws {
        let json = #"{"id":"a1","alt":null,"descriptionWithheld":true}"#
        let decoded = try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
        #expect(decoded.descriptionWithheld == true)
    }

    @Test func decodage_laDescriptionEtSesTraductionsDuFil() throws {
        let json = #"{"id":"a1","alt":"Un chat","altLanguage":"fr","altTranslations":{"en":{"text":"A cat","translationModel":"nllb"}}}"#
        let decoded = try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
        #expect(decoded.alt == "Un chat")
        #expect(decoded.altTranslations == ["en": "A cat"])
    }

    @Test func decodage_uneCarteMalformee_neFaitPasPerdreLaPiece() throws {
        let json = #"{"id":"a1","alt":"Un chat","altTranslations":"oops"}"#
        let decoded = try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
        #expect(decoded.id == "a1")
        #expect(decoded.altTranslations == nil)
    }
}
