import XCTest
@testable import Meeshy
import MeeshySDK

/// Loi de la piste audio effective (`AudioTrackLanguageResolver`) — la MÊME
/// loi sert le widget (segments karaoké, URL affichée) et le moteur
/// (`ConversationViewModel.playAudio`). Ces tests fixent le contrat :
/// bascule manuelle du drapeau d'abord, Prisme sinon, l'original à son rang.
final class AudioTrackLanguageResolverTests: XCTestCase {

    private func track(_ lang: String, url: String? = nil) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "t-\(lang)", attachmentId: "a1", targetLanguage: lang,
            url: url ?? "https://cdn/\(lang).m4a", transcription: "…",
            durationMs: 3_000, format: "m4a", cloned: false, quality: 0.9,
            ttsModel: "tts"
        )
    }

    // MARK: - Bascule manuelle (drapeau)

    func test_resolve_manualOriginal_returnsNil_theOriginalTrack() {
        XCTAssertNil(AudioTrackLanguageResolver.resolve(
            manualOverride: "EN",
            originalLanguage: "en",
            preferredLanguages: ["fr"],
            translatedAudios: [track("fr")]
        ), "basculer sur la langue d'ORIGINE = piste originale (nil), jamais une piste fabriquée")
    }

    func test_resolve_manualTranslated_withTrack_returnsThatLanguage() {
        XCTAssertEqual(AudioTrackLanguageResolver.resolve(
            manualOverride: "fr",
            originalLanguage: "en",
            preferredLanguages: [],
            translatedAudios: [track("fr")]
        ), "fr")
    }

    func test_resolve_manualLanguageWithoutTrack_fallsBackToOriginal() {
        XCTAssertNil(AudioTrackLanguageResolver.resolve(
            manualOverride: "es",
            originalLanguage: "en",
            preferredLanguages: ["fr"],
            translatedAudios: [track("fr")]
        ), "une bascule vers une langue SANS piste retombe sur l'original — le Prisme ne doit pas la remplacer en douce")
    }

    // MARK: - Prisme (pas de bascule)

    func test_resolve_prisme_firstPreferredLanguageWithTrackWins() {
        XCTAssertEqual(AudioTrackLanguageResolver.resolve(
            manualOverride: nil,
            originalLanguage: "en",
            preferredLanguages: ["fr", "es"],
            translatedAudios: [track("es"), track("fr")]
        ), "fr")
    }

    func test_resolve_prisme_originalWinsAtItsRank_neverAsShortCircuit() {
        // Prisme ['en','fr'], message anglais : l'anglais (rang 1) est servi
        // par le message lui-même — piste originale, même si une piste
        // française existe (règle 3 du Prisme).
        XCTAssertNil(AudioTrackLanguageResolver.resolve(
            manualOverride: nil,
            originalLanguage: "en",
            preferredLanguages: ["en", "fr"],
            translatedAudios: [track("fr")]
        ))
        // Prisme ['fr','en'], même message : le français (rang 1) est servi
        // par sa piste traduite — la langue d'origine au rang 2 ne
        // court-circuite RIEN.
        XCTAssertEqual(AudioTrackLanguageResolver.resolve(
            manualOverride: nil,
            originalLanguage: "en",
            preferredLanguages: ["fr", "en"],
            translatedAudios: [track("fr")]
        ), "fr")
    }

    func test_resolve_noTracks_alwaysNil() {
        XCTAssertNil(AudioTrackLanguageResolver.resolve(
            manualOverride: "fr",
            originalLanguage: "en",
            preferredLanguages: ["fr"],
            translatedAudios: []
        ))
    }

    // MARK: - URL de piste

    func test_url_nilLanguage_returnsOriginal() {
        XCTAssertEqual(AudioTrackLanguageResolver.url(
            for: nil, translatedAudios: [track("fr")], originalUrl: "https://cdn/orig.m4a"
        ), "https://cdn/orig.m4a")
    }

    func test_url_matchingTrack_returnsItsUrl_caseInsensitive() {
        XCTAssertEqual(AudioTrackLanguageResolver.url(
            for: "FR", translatedAudios: [track("fr", url: "https://cdn/voix-fr.m4a")], originalUrl: "https://cdn/orig.m4a"
        ), "https://cdn/voix-fr.m4a")
    }

    func test_url_languageWithoutTrack_fallsBackToOriginal() {
        XCTAssertEqual(AudioTrackLanguageResolver.url(
            for: "es", translatedAudios: [track("fr")], originalUrl: "https://cdn/orig.m4a"
        ), "https://cdn/orig.m4a")
    }
}
