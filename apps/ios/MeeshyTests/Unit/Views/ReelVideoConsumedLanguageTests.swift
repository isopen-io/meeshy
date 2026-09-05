import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **La langue que le rapport `watched` d'un réel VIDÉO déclare (#3912).**
///
/// Deux témoins pour deux natures de défaut, parce qu'un seul en raterait un :
///
/// 1. Le COMPORTEMENT — quelle langue le résolveur élit. Il verrouille la
///    décision produit : la « langue consommée » d'une vidéo est la langue
///    PARLÉE, pas celle du post.
/// 2. Le CÂBLAGE — que le résolveur soit branché sur le moteur. C'est la
///    régression réelle qu'on répare ici : `SharedAVPlayerManager
///    .consumedLanguageProvider` était DÉCLARÉ (`:110`) et LU (`:412`) sans
///    être assigné nulle part, si bien que tout rapport de visionnage partait
///    avec `language: nil`. Un contrat MORT ne rougit dans aucun test de
///    comportement — il faut ancrer sa présence, pas seulement son contenu.
final class ReelVideoConsumedLanguageTests: XCTestCase {

    private func video(transcribedIn language: String?) -> FeedMedia {
        FeedMedia(
            id: "m-1", type: .video, url: "https://x/m-1.mp4",
            transcription: language.map {
                MessageTranscription(attachmentId: "m-1", text: "bonjour", language: $0)
            }
        )
    }

    // MARK: - Comportement

    func test_consumedLanguage_withTranscription_isTheSpokenLanguage() {
        XCTAssertEqual(
            ReelVideoView.consumedLanguage(for: video(transcribedIn: "es")), "es",
            "La vidéo joue TOUJOURS `attachment.fileUrl`, sa piste d'origine : la seule " +
            "source qui en connaisse la langue est sa transcription."
        )
    }

    func test_consumedLanguage_withoutTranscription_isNil_ratherThanInvented() {
        XCTAssertNil(
            ReelVideoView.consumedLanguage(for: video(transcribedIn: nil)),
            "Sans transcription, personne ne sait quelle langue a été entendue. Un `nil` " +
            "qui dit « je ne sais pas » vaut mieux qu'une langue reprise du TEXTE du post " +
            "(`originalLanguage`), qui peut différer de ce qui est parlé dans la vidéo."
        )
    }

    func test_consumedLanguage_doesNotFallBackToTheDisplayPrism() {
        // Un lecteur francophone qui regarde un réel espagnol ENTEND de l'espagnol.
        // Le rapport doit dire ce qui a été consommé, jamais ce que le lecteur préfère.
        XCTAssertEqual(ReelVideoView.consumedLanguage(for: video(transcribedIn: "es")), "es")
        XCTAssertNotEqual(ReelVideoView.consumedLanguage(for: video(transcribedIn: "es")), "fr")
    }

    // MARK: - Câblage : le contrat ne doit plus jamais être mort

    func test_drive_publishesTheConsumedLanguageToTheEngine() throws {
        let text = try MyStoriesSourceCorpus.text(
            of: "Meeshy/Features/Main/Views/ReelsPlayerView+Video.swift")
        XCTAssertTrue(
            text.contains("manager.consumedLanguageProvider = { spoken }"),
            "Le fournisseur DOIT être assigné au moteur — c'est la régression #3912 elle-même : " +
            "déclaré et lu, jamais écrit, il laissait `language: nil` dans chaque rapport."
        )
        XCTAssertTrue(
            text.contains("publishConsumedLanguage()"),
            "…et `drive()` DOIT l'appeler. Une méthode d'assignation que personne n'appelle " +
            "est exactement le même contrat mort, une couche plus haut."
        )
    }
}
