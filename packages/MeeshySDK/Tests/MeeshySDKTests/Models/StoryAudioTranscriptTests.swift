import XCTest
@testable import MeeshySDK

/// Pendant sonore de `StoryTextLanguageAvailability` : quelle transcription
/// afficher, et quelle variante audio JOUER, pour une chaîne de langues donnée.
///
/// La règle du Prisme diffère entre texte et son, et c'est délibéré :
/// - le TEXTE sans traduction correspondante s'affiche dans son original, que
///   le canvas porte déjà — le résolveur renvoie donc `nil` ;
/// - la TRANSCRIPTION n'a pas d'« original déjà affiché » : si aucune langue
///   préférée ne correspond, il faut bien montrer quelque chose, et c'est la
///   première entrée — la langue réellement parlée, par convention gateway.
final class StoryAudioTranscriptTests: XCTestCase {

    private func effects(transcripts: [(String, String)] = [],
                         variants: [(String, String)] = []) -> StoryEffects {
        var e = StoryEffects()
        e.voiceTranscriptions = transcripts.map { StoryVoiceTranscription(language: $0.0, content: $0.1) }
        e.backgroundAudioVariants = variants.map { StoryAudioVariant(postMediaId: $0.0, language: $0.1) }
        return e
    }

    // MARK: - Langues disponibles

    func test_availableLanguages_unionsTranscriptsAndAudioVariants() {
        let e = effects(transcripts: [("fr", "Bonjour"), ("en", "Hello")],
                        variants: [("m1", "es"), ("m2", "fr")])
        XCTAssertEqual(StoryAudioTranscript.availableLanguages(effects: e), ["en", "es", "fr"])
    }

    /// Une variante audio SANS transcription reste proposée : on peut écouter
    /// une langue qu'on ne peut pas lire.
    func test_availableLanguages_audioOnlyLanguageStillOffered() {
        let e = effects(transcripts: [("fr", "Bonjour")], variants: [("m1", "de")])
        XCTAssertEqual(StoryAudioTranscript.availableLanguages(effects: e), ["de", "fr"])
    }

    func test_availableLanguages_normalisesRegionalCodes() {
        let e = effects(transcripts: [("fr-FR", "Bonjour"), ("FR", "Salut")], variants: [("m1", "pt-BR")])
        XCTAssertEqual(StoryAudioTranscript.availableLanguages(effects: e), ["fr", "pt"])
    }

    func test_availableLanguages_noAudioContent_isEmpty() {
        XCTAssertEqual(StoryAudioTranscript.availableLanguages(effects: StoryEffects()), [])
        XCTAssertEqual(StoryAudioTranscript.availableLanguages(effects: nil), [])
    }

    // MARK: - Transcription résolue

    func test_resolve_prefersTheFirstMatchingLanguageOfTheChain() {
        let e = effects(transcripts: [("en", "Hello"), ("fr", "Bonjour"), ("es", "Hola")])
        let hit = StoryAudioTranscript.resolve(effects: e, preferredLanguages: ["fr", "en"])
        XCTAssertEqual(hit?.content, "Bonjour")
    }

    /// La chaîne est ORDONNÉE : la langue secondaire ne doit servir que si la
    /// primaire est absente.
    func test_resolve_fallsBackToTheSecondaryLanguage() {
        let e = effects(transcripts: [("en", "Hello"), ("es", "Hola")])
        let hit = StoryAudioTranscript.resolve(effects: e, preferredLanguages: ["fr", "es"])
        XCTAssertEqual(hit?.content, "Hola")
    }

    /// Aucune langue préférée ne correspond → la LANGUE PARLÉE (1ʳᵉ entrée),
    /// jamais une traduction arbitraire.
    func test_resolve_noMatch_returnsTheSpokenOriginal() {
        let e = effects(transcripts: [("en", "Hello"), ("es", "Hola")])
        let hit = StoryAudioTranscript.resolve(effects: e, preferredLanguages: ["de"])
        XCTAssertEqual(hit?.content, "Hello")
    }

    func test_resolve_matchesAcrossRegionalVariants() {
        let e = effects(transcripts: [("pt-BR", "Olá")])
        XCTAssertEqual(StoryAudioTranscript.resolve(effects: e, preferredLanguages: ["pt"])?.content, "Olá")
    }

    func test_resolve_withoutTranscripts_returnsNil() {
        XCTAssertNil(StoryAudioTranscript.resolve(effects: StoryEffects(), preferredLanguages: ["fr"]))
        XCTAssertNil(StoryAudioTranscript.resolve(effects: nil, preferredLanguages: ["fr"]))
    }

    // MARK: - Variante audio à jouer

    func test_variant_returnsTheMatchingLanguageTrack() {
        let e = effects(variants: [("m-es", "es"), ("m-fr", "fr")])
        XCTAssertEqual(StoryAudioTranscript.variant(effects: e, preferredLanguages: ["fr"])?.postMediaId, "m-fr")
    }

    /// Aucune variante dans la langue voulue → on garde l'audio D'ORIGINE.
    /// Jouer une langue arbitraire serait pire que ne rien changer.
    func test_variant_noMatch_returnsNilSoTheOriginalKeepsPlaying() {
        let e = effects(variants: [("m-es", "es")])
        XCTAssertNil(StoryAudioTranscript.variant(effects: e, preferredLanguages: ["de", "it"]))
    }

    func test_variant_honoursChainOrder() {
        let e = effects(variants: [("m-en", "en"), ("m-es", "es")])
        XCTAssertEqual(StoryAudioTranscript.variant(effects: e, preferredLanguages: ["es", "en"])?.postMediaId, "m-es")
    }

    // MARK: - Présence

    func test_hasTranscript_trueOnlyWhenSomeTranscriptCarriesText() {
        XCTAssertTrue(StoryAudioTranscript.hasTranscript(effects: effects(transcripts: [("fr", "Bonjour")])))
        XCTAssertFalse(StoryAudioTranscript.hasTranscript(effects: effects(transcripts: [("fr", "   ")])))
        XCTAssertFalse(StoryAudioTranscript.hasTranscript(effects: StoryEffects()))
        XCTAssertFalse(StoryAudioTranscript.hasTranscript(effects: nil))
    }
}
