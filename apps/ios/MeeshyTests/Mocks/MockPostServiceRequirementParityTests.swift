import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Un double qui perd un paramètre ne casse RIEN — et c'est le problème.**
///
/// `PostServiceProviding` fournit des extensions par défaut pour ses
/// requirements les plus larges, précisément pour que les doubles de test
/// restent valides quand le protocole s'élargit. La contrepartie est brutale :
/// quand la requirement COMPLÈTE gagne un paramètre et que le double garde son
/// ancienne surcharge, l'appel de production **retombe en silence** sur la
/// signature plus pauvre. Le mock compile, le test s'exécute, et l'observatoire
/// qu'il interroge n'est jamais écrit.
///
/// C'est exactement ce qui a rendu le CI iOS rouge : `mediaCaption` est arrivé
/// dans `create(…)` et `createCanvasPost(…)`, le double ne l'a pas suivi, et
/// **quatre tests** de deux suites différentes ont cessé de mesurer quoi que ce
/// soit — trois en échouant (`lastCreateCanvasPostType` jamais posé,
/// `lastCreateDiscoverabilityPrecision` resté `nil`), et **un en passant** :
/// `test_createPost_placeWithoutText_withoutConsent_carriesNoPrecision`
/// attendait `nil` et l'a obtenu par l'évaporation, pas par la règle.
///
/// Ces témoins appellent le double **PAR LE PROTOCOLE**, avec la requirement la
/// plus complète, et vérifient qu'il a vu passer chaque paramètre. Ils rougissent
/// au prochain élargissement non suivi — sur la compilation cette fois, puisque
/// la signature écrite ici doit exister.
@MainActor
final class MockPostServiceRequirementParityTests: XCTestCase {

    /// La requirement complète de `create(…)` — la seule que
    /// `FeedViewModel.createPost` appelle.
    func test_leDouble_observeLaRequirementCompleteDeCreate() async throws {
        let mock = MockPostService()
        let service: PostServiceProviding = mock

        _ = try await service.create(
            content: "x", type: "POST", visibility: "PUBLIC", visibilityUserIds: nil,
            moodEmoji: nil, mediaIds: nil, audioUrl: nil, audioDuration: nil,
            originalLanguage: nil, mobileTranscription: nil, repostOfId: nil,
            location: nil, mentions: nil, allowSoundExtraction: nil,
            mediaAlt: nil, mediaCaption: ["m1": "une légende"],
            discoverabilityPrecision: .city
        )

        XCTAssertEqual(
            mock.lastCreateDiscoverabilityPrecision, .city,
            "L'appel est retombé sur une surcharge plus pauvre : le double ne voit plus ce qui part."
        )
        XCTAssertEqual(mock.lastCreateMediaCaption, ["m1": "une légende"])
    }

    /// La requirement complète de `createCanvasPost(…)` — celle par laquelle
    /// une scène part sous le TYPE que l'auteur a choisi.
    func test_leDouble_observeLaRequirementCompleteDeCreateCanvasPost() async throws {
        let mock = MockPostService()
        let service: PostServiceProviding = mock

        _ = try await service.createCanvasPost(
            type: .reel, content: nil, storyEffects: nil,
            visibility: "PUBLIC", visibilityUserIds: nil, originalLanguage: nil,
            mediaIds: nil, repostOfId: nil, mentions: nil,
            allowSoundExtraction: nil, mediaAlt: nil,
            mediaCaption: ["m2": "légende de piste"]
        )

        XCTAssertEqual(
            mock.lastCreateCanvasPostType, .reel,
            "L'appel est retombé sur `createStory` : le double ne voit plus sous quel TYPE la publication part."
        )
        XCTAssertEqual(mock.lastCreateCanvasMediaCaption, ["m2": "légende de piste"])
    }

    /// **Et le témoin qui aurait attrapé le défaut le plus discret des quatre.**
    /// Un test qui attend `nil` ne distingue pas « la règle n'a rien posé » de
    /// « le paramètre s'est évaporé ». Celui-ci lève l'ambiguïté : le double doit
    /// avoir été APPELÉ, et rendre `nil` parce que l'appelant l'a voulu.
    func test_unNilObserve_vientDeLAppelant_jamaisDeLEvaporation() async throws {
        let mock = MockPostService()
        let service: PostServiceProviding = mock

        _ = try await service.create(
            content: "x", type: "POST", visibility: "PUBLIC", visibilityUserIds: nil,
            moodEmoji: nil, mediaIds: nil, audioUrl: nil, audioDuration: nil,
            originalLanguage: nil, mobileTranscription: nil, repostOfId: nil,
            location: nil, mentions: nil, allowSoundExtraction: nil,
            mediaAlt: nil, mediaCaption: nil, discoverabilityPrecision: nil
        )

        XCTAssertEqual(mock.createCallCount, 1, "Le double doit avoir été atteint.")
        XCTAssertNil(mock.lastCreateDiscoverabilityPrecision)
    }
}
