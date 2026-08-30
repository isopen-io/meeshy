import Foundation
import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le rail de stories ne lit plus le disque pendant son `body` (#4002).**
///
/// Ce que ces témoins gardent n'est pas la cascade de couverture — elle vit
/// ailleurs, dans `StoryCoverThumbnail.preferredCoverURLString`, site unique
/// partagé avec le rail Lentille. Ce qu'ils gardent est le NOMBRE d'accès
/// disque : un seul par story, là où le `body` en faisait un par rendu.
///
/// Les deux témoins qui comptent le plus sont ceux qui répondent aux craintes
/// que le commentaire d'origine opposait à toute mémoïsation. Elles étaient
/// justes, et c'est pour ça qu'il faut y répondre plutôt que les contourner.
@MainActor
final class StoryCoverURLMemoTests: XCTestCase {

    override func setUp() {
        super.setUp()
        StoryCoverURLMemo.reset()
    }

    override func tearDown() {
        StoryCoverURLMemo.reset()
        super.tearDown()
    }

    // MARK: - Fabriques

    private func group(
        userId: String = "u1",
        storyId: String = "s1",
        avatarURL: String? = "https://x/avatar.jpg"
    ) -> StoryGroup {
        StoryGroup(
            id: userId,
            username: "alice",
            avatarColor: "FF2E63",
            avatarURL: avatarURL,
            stories: [
                StoryItem(
                    id: storyId,
                    content: "hello",
                    media: [],
                    storyEffects: nil,
                    createdAt: Date(),
                    expiresAt: Date().addingTimeInterval(72_000),
                    isViewed: false,
                    updatedAt: nil
                )
            ]
        )
    }

    /// Une sonde qui COMPTE ses appels — c'est le compteur qui est le sujet du
    /// test, pas la valeur rendue.
    private final class CountingProbe {
        private(set) var calls = 0
        var result: URL?
        init(result: URL? = nil) { self.result = result }
        func probe(_ key: String) -> URL? {
            calls += 1
            return result
        }
    }

    // MARK: - Le cœur du correctif

    /// Le défaut mesuré : `DiskCacheStore.cachedFileURL` appelé depuis un
    /// `body`, donc une fois par RENDU, sur une cellule répétée par anneau.
    /// 451 ms sur 100 s écran inactif, avec des pics de CPU à 34,5 %.
    func test_theDiskIsProbedOnce_howeverManyTimesTheBodyRuns() {
        let probe = CountingProbe()
        let g = group()

        for _ in 0..<50 {
            _ = StoryCoverURLMemo.coverURL(for: g, accountId: "me", probe: probe.probe)
        }

        XCTAssertEqual(probe.calls, 1,
                       "Le disque est interrogé à chaque passe de body : c'est exactement le défaut "
                       + "que #4002 mesure, et une mémoire qui ne mémorise pas ne corrige rien.")
    }

    /// Un `nil` se mémorise AUSSI. Sans cela, l'écrasante majorité des stories
    /// — celles sans couverture composite — continueraient de sonder le disque
    /// à chaque rendu, et le correctif ne servirait que la minorité.
    func test_anAbsentCover_isRemembered_too() {
        let probe = CountingProbe(result: nil)
        let g = group()

        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "me", probe: probe.probe)
        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "me", probe: probe.probe)

        XCTAssertEqual(probe.calls, 1, "un `nil` non mémorisé fait retomber le cas le plus fréquent")
    }

    func test_twoDifferentStories_areProbedSeparately() {
        let probe = CountingProbe()

        _ = StoryCoverURLMemo.coverURL(for: group(storyId: "s1"), accountId: "me", probe: probe.probe)
        _ = StoryCoverURLMemo.coverURL(for: group(storyId: "s2"), accountId: "me", probe: probe.probe)

        XCTAssertEqual(probe.calls, 2, "la mémoire est par STORY, pas globale")
    }

    // MARK: - Première crainte : la cover écrite APRÈS coup

    /// Une story reçue dont la couverture composite est rendue plus tard. Sans
    /// invalidation, la mémoire servirait éternellement le `nil` d'avant, et le
    /// rail n'afficherait jamais la couverture qu'il vient de fabriquer.
    func test_aCoverWrittenLater_isSeen_onceTheGenerationIsBumped() {
        let probe = CountingProbe(result: nil)
        let g = group()

        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "me", probe: probe.probe)
        probe.result = URL(fileURLWithPath: "/tmp/cover.jpg")

        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "me", probe: probe.probe)
        XCTAssertEqual(probe.calls, 1, "sans invalidation, la mémoire tient toujours son `nil`")

        StoryCoverURLMemo.bumpGeneration()
        let after = StoryCoverURLMemo.coverURL(for: g, accountId: "me", probe: probe.probe)

        XCTAssertEqual(probe.calls, 2)
        // La cascade rend `localCover.absoluteString`, pas le chemin nu.
        XCTAssertEqual(after, "file:///tmp/cover.jpg",
                       "la couverture fraîchement écrite doit devenir visible")
    }

    // MARK: - Seconde crainte : la purge de logout

    /// Le commentaire d'origine refusait toute mémoïsation pour cette raison
    /// précise : « la purge de logout peut détruire le fichier, et servir une
    /// URL morte au relogin coûterait plus cher ». La mémoire porte donc
    /// l'identité du compte pour lequel elle a été remplie.
    ///
    /// Ce qui rend la garde SÛRE est qu'aucun site de déconnexion n'a besoin de
    /// la connaître : il y a trois appels à `logout()` dans l'app, et un
    /// quatrième apparaîtrait sans que personne ne pense à cette mémoire.
    func test_switchingAccount_emptiesTheMemory_withoutAnyLogoutSiteKnowingIt() {
        let probe = CountingProbe(result: URL(fileURLWithPath: "/tmp/a.jpg"))
        let g = group()

        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "alice", probe: probe.probe)
        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "bob", probe: probe.probe)

        XCTAssertEqual(probe.calls, 2,
                       "un autre compte doit re-sonder : ses fichiers ont été purgés, "
                       + "et servir l'URL du compte précédent serait une URL morte")
    }

    func test_returningToTheSameAccount_stillReprobes_becauseTheMemoryWasEmptied() {
        let probe = CountingProbe(result: URL(fileURLWithPath: "/tmp/a.jpg"))
        let g = group()

        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "alice", probe: probe.probe)
        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "bob", probe: probe.probe)
        _ = StoryCoverURLMemo.coverURL(for: g, accountId: "alice", probe: probe.probe)

        XCTAssertEqual(probe.calls, 3, "le relogin re-sonde — c'est ce qui évite l'URL morte")
    }

    // MARK: - Le groupe sans story

    func test_anEmptyGroup_fallsBackToItsAvatar_withoutTouchingTheDisk() {
        let probe = CountingProbe()
        let empty = StoryGroup(id: "u1", username: "alice", avatarColor: "FF2E63",
                               avatarURL: "https://x/avatar.jpg", stories: [])

        let url = StoryCoverURLMemo.coverURL(for: empty, accountId: "me", probe: probe.probe)

        XCTAssertEqual(url, "https://x/avatar.jpg")
        XCTAssertEqual(probe.calls, 0, "rien à sonder quand il n'y a pas de story")
    }

    // MARK: - Garde de source — la lecture disque ne doit pas revenir dans le body

    func test_theTrayResolver_noLongerTouchesTheDiskItself() throws {
        let source = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryTrayView.swift")
        )
        XCTAssertTrue(
            Self.resolverIsMemoized(source),
            "`latestStoryThumbnailURL` interroge à nouveau le disque depuis le `body` du rail. "
            + "C'est le défaut de #4002 : 451 ms sur 100 s, écran inactif, pics de CPU à 34,5 %."
        )
    }

    /// Contre-épreuve — la garde doit savoir dire NON, sinon elle est née verte.
    func test_theGuardAbove_wouldCatchTheDiskReadComingBack() {
        XCTAssertTrue(Self.resolverIsMemoized(
            "func latestStoryThumbnailURL(_ group: StoryGroup) -> String? { StoryCoverURLMemo.coverURL(for: group) }"
        ))
        XCTAssertFalse(
            Self.resolverIsMemoized(
                "func latestStoryThumbnailURL(_ g: StoryGroup) -> String? { "
                + "let c = CacheCoordinator.thumbnailLocalFileURL(for: k); return f(c) }"
            ),
            "le retour à la lecture disque directe doit faire rougir"
        )
    }

    private static func resolverIsMemoized(_ source: String) -> Bool {
        guard let start = source.range(of: "func latestStoryThumbnailURL") else { return false }
        let body = String(source[start.lowerBound...].prefix(400))
        return body.contains("StoryCoverURLMemo.coverURL(for:")
            && !body.contains("CacheCoordinator.thumbnailLocalFileURL")
    }
}
