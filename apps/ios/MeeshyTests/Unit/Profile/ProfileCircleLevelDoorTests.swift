import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Toucher une pastille de « Mes cercles » sur ma fiche ouvre Mes cercles SUR ce niveau (#18685), et les pastilles se
/// nomment depuis la table servie (`GET /relations/config`), gardée en cache, avec repli sur le catalogue local.
@MainActor
final class ProfileCircleLevelDoorTests: XCTestCase {

    @MainActor private final class MemoryConfigCache: RelationsConfigCaching {
        var stored: RelationsConfig?
        var saveCount = 0
        init(_ stored: RelationsConfig? = nil) { self.stored = stored }
        func cached() -> RelationsConfig? { stored }
        func save(_ config: RelationsConfig) {
            saveCount += 1
            stored = config
        }
    }

    private func servedConfig(friend: String) -> RelationsConfig {
        RelationsConfig(levels: [
            RelationLevelPresentation(level: RelationLevel.friend.rawValue, labelKey: "circles.level.friend", icon: "🫂",
                                      labels: ["fr": friend, "en": "Buddy"])
        ])
    }

    // MARK: - Loi de route

    func test_aCirclePill_opensMyCirclesOnThatLevel() {
        let router = Router()
        ProfileDoor.circle(.close).open(with: RouterCommands(router: router))
        XCTAssertEqual(router.path, [.contacts(.circles, circle: .close)])
    }

    func test_theCirclesRoute_withoutALevel_staysTheRouteOldCallersPush() {
        XCTAssertEqual(Route.contacts(.circles), .contacts(.circles, circle: nil))
        XCTAssertEqual(Route.contacts(.circles, circle: .friend).displayTitle, PeopleTab.circles.title)
    }

    func test_eachPillOfTheScale_opensItsOwnLevel() {
        let summary = ProfileCirclesSummary.make(links: [], pendingCount: 0)
        XCTAssertEqual(summary.entries.indices.map { ProfileCirclesSection.door(forPillAt: $0, of: summary) },
                       ProfileCirclesSummary.levels.map(ProfileDoor.circle))
        XCTAssertEqual(ProfileCirclesSection.door(forPillAt: 99, of: summary), .circles,
                       "un index hors de l'échelle ouvre Mes cercles sans niveau, jamais rien")
    }

    func test_myCircles_focusesTheChosenLevel_onlyWhenItIsListed() async {
        let relations = MockRelationsService()
        relations.linksResult = .success([RelationLink(userId: "a", effectiveLevel: .close, grantedByMe: .close)])
        let sut = CirclesViewModel(relations: relations, friendService: MockFriendService(), people: FakeCirclePeople(),
                                   offlineQueue: MockOfflineQueue(), networkMonitor: FakeNetworkMonitor(isOnline: true),
                                   languageCode: "fr", configCache: MemoryConfigCache())
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        await sut.load(forceNetwork: true)
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)

        XCTAssertEqual(sut.focusTarget(for: .close), .close)
        XCTAssertNil(sut.focusTarget(for: .blood), "un cercle sans personne n'a pas de section où se poser")
        XCTAssertNil(sut.focusTarget(for: .community), "Communauté ne se liste pas : l'écran s'ouvre en haut")
        XCTAssertNil(sut.focusTarget(for: nil))
    }

    // MARK: - Noms servis, cache d'abord, repli sur le catalogue

    func test_levelTitles_readTheServedLabel_andFallBackOnTheCatalogue() {
        let titles = CircleLevelTitles(config: servedConfig(friend: "Copain"), language: "fr")
        XCTAssertEqual(titles.title(of: .friend), "Copain")
        XCTAssertEqual(titles.title(of: .blood), CircleLevelNames.title(of: .blood), "un niveau non servi garde son nom local")
        XCTAssertEqual(CircleLevelTitles(config: servedConfig(friend: "Copain"), language: "ja").title(of: .friend),
                       CircleLevelNames.title(of: .friend), "une langue non servie garde le nom local")
        XCTAssertEqual(CircleLevelTitles(config: servedConfig(friend: ""), language: "fr").title(of: .friend),
                       CircleLevelNames.title(of: .friend), "un libellé vide ne s'affiche jamais")
        XCTAssertEqual(CircleLevelTitles.catalogue.title(of: .close), CircleLevelNames.title(of: .close))
    }

    func test_thePills_areNamedFromTheCache_beforeAnyNetwork() {
        let sut = ProfileCirclesViewModel(relations: MockRelationsService(), pendingRequests: NoPendingRequests(),
                                          networkMonitor: FakeNetworkMonitor(isOnline: false),
                                          configCache: MemoryConfigCache(servedConfig(friend: "Copain")), languageCode: "fr")
        XCTAssertEqual(sut.levelTitles.title(of: .friend), "Copain")
        let summary = ProfileCirclesSummary.make(links: [], pendingCount: 0)
        XCTAssertTrue(ProfileCirclesSection.scaleLevels(of: summary, titles: sut.levelTitles).map(\.title).contains("Copain"))
    }

    func test_load_revalidatesTheNames_andKeepsThemForTheNextOpening() async {
        let relations = MockRelationsService()
        relations.configResult = .success(servedConfig(friend: "Pote"))
        let cache = MemoryConfigCache(servedConfig(friend: "Copain"))
        let sut = ProfileCirclesViewModel(relations: relations, pendingRequests: NoPendingRequests(),
                                          networkMonitor: FakeNetworkMonitor(isOnline: true), configCache: cache,
                                          languageCode: "fr")
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        await sut.load()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)

        XCTAssertEqual(sut.levelTitles.title(of: .friend), "Pote")
        XCTAssertEqual(cache.stored, servedConfig(friend: "Pote"))
    }

    func test_load_whenTheConfigFails_keepsTheCachedNames() async {
        let relations = MockRelationsService()
        relations.configResult = .failure(URLError(.notConnectedToInternet))
        let sut = ProfileCirclesViewModel(relations: relations, pendingRequests: NoPendingRequests(),
                                          networkMonitor: FakeNetworkMonitor(isOnline: true),
                                          configCache: MemoryConfigCache(servedConfig(friend: "Copain")), languageCode: "fr")
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        await sut.load()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)

        XCTAssertEqual(sut.levelTitles.title(of: .friend), "Copain")
    }

    func test_theDefaultsCache_roundTripsTheServedTable() throws {
        let suite = "ProfileCircleLevelDoorTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let cache = RelationsConfigDefaultsCache(defaults: defaults)
        XCTAssertNil(cache.cached())
        cache.save(servedConfig(friend: "Copain"))
        XCTAssertEqual(RelationsConfigDefaultsCache(defaults: defaults).cached(), servedConfig(friend: "Copain"))
    }
}

private final class NoPendingRequests: ProfilePendingRequestsCounting, @unchecked Sendable {
    var pendingReceivedCount: Int { 0 }
    var pendingReceivedChanges: AnyPublisher<Void, Never> { Empty().eraseToAnyPublisher() }
}
