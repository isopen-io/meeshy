import XCTest
import MeeshySDK
@testable import Meeshy

/// « QUI EST PRÉVENU » (#14062) — lecture cache-first par compte, écriture
/// optimiste d'une seule clé, retour arrière de CETTE clé seule.
@MainActor
final class CircleNotifySettingsViewModelTests: XCTestCase {

    private final class MockCircleNotifyService: CircleNotifyServiceProviding, @unchecked Sendable {
        var loadResult: Result<CircleNotifyPreferences, Error> = .success(.defaults)
        var updateResult: ((CircleNotifyKey, RelationAudienceChoice) -> Result<RelationAudienceChoice, Error>) = { .success($1) }
        private(set) var loadCount = 0
        private(set) var updates: [(CircleNotifyKey, RelationAudienceChoice)] = []

        func load() async throws -> CircleNotifyPreferences {
            loadCount += 1
            return try loadResult.get()
        }

        func update(_ key: CircleNotifyKey, to choice: RelationAudienceChoice) async throws -> RelationAudienceChoice {
            updates.append((key, choice))
            return try updateResult(key, choice).get()
        }
    }

    private struct Refused: Error {}

    private let post = CircleNotifyKey(family: .publication, action: .post)
    private let reel = CircleNotifyKey(family: .publication, action: .reel)
    private let elsewhereComment = CircleNotifyKey(family: .elsewhere, action: .comment)

    private func makeDefaults() -> UserDefaults {
        let name = "CircleNotifySettingsViewModelTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func makeSUT(
        service: MockCircleNotifyService = MockCircleNotifyService(),
        online: Bool = true,
        defaults: UserDefaults? = nil,
        accountId: String? = "u1",
        refusals: @escaping @MainActor (String) -> Void = { _ in }
    ) -> CircleNotifySettingsViewModel {
        CircleNotifySettingsViewModel(
            service: service,
            networkMonitor: FakeNetworkMonitor(isOnline: online),
            defaults: defaults ?? makeDefaults(),
            accountId: accountId,
            onRefusal: refusals
        )
    }

    func test_load_withoutCache_showsDefaultsProcheProcheSang() async {
        let sut = makeSUT()
        XCTAssertEqual(sut.loadState, .loading)
        await sut.load()
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(sut.preferences[post], .close)
        XCTAssertEqual(sut.preferences[elsewhereComment], .blood)
    }

    func test_load_failureWithoutCache_isUnavailable() async {
        let service = MockCircleNotifyService()
        service.loadResult = .failure(Refused())
        let sut = makeSUT(service: service)
        await sut.load()
        XCTAssertEqual(sut.loadState, .unavailable)
    }

    func test_init_withCacheOfSameAccount_showsItImmediately_withoutSpinner() async {
        let defaults = makeDefaults()
        let service = MockCircleNotifyService()
        service.loadResult = .success(CircleNotifyPreferences.defaults.setting(.public, for: reel))
        await makeSUT(service: service, defaults: defaults).load()

        let reopened = makeSUT(service: service, defaults: defaults)
        XCTAssertEqual(reopened.loadState, .loaded)
        XCTAssertEqual(reopened.preferences[reel], .public)

        let otherAccount = makeSUT(service: service, defaults: defaults, accountId: "u2")
        XCTAssertEqual(otherAccount.loadState, .loading, "le cache d'un compte ne sert jamais un autre")
    }

    func test_load_failureWithCache_keepsCachedValues() async {
        let defaults = makeDefaults()
        let service = MockCircleNotifyService()
        service.loadResult = .success(CircleNotifyPreferences.defaults.setting(.friend, for: post))
        await makeSUT(service: service, defaults: defaults).load()
        service.loadResult = .failure(Refused())
        let sut = makeSUT(service: service, defaults: defaults)
        await sut.load()
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(sut.preferences[post], .friend)
    }

    func test_choose_writesOneKey_andKeepsTheServedChoice() async {
        let service = MockCircleNotifyService()
        let sut = makeSUT(service: service)
        await sut.load()
        await sut.choose(.community, for: reel)
        XCTAssertEqual(service.updates.count, 1)
        XCTAssertEqual(service.updates.first?.0, reel)
        XCTAssertEqual(service.updates.first?.1, .community)
        XCTAssertEqual(sut.preferences[reel], .community)
        XCTAssertEqual(sut.preferences[post], .close, "les autres crans ne bougent pas")
    }

    func test_choose_refused_rollsBackThatKeyOnly_andSaysSo() async {
        let service = MockCircleNotifyService()
        service.updateResult = { key, choice in key == self.reel ? .failure(Refused()) : .success(choice) }
        var refusals: [String] = []
        let sut = makeSUT(service: service, refusals: { refusals.append($0) })
        await sut.load()
        await sut.choose(.nobody, for: post)
        await sut.choose(.public, for: reel)
        XCTAssertEqual(sut.preferences[reel], .close, "le cran refusé revient à sa valeur")
        XCTAssertEqual(sut.preferences[post], .nobody, "le cran accepté reste")
        XCTAssertEqual(refusals.count, 1)
    }

    func test_choose_offline_sendsNothing_andKeepsTheChoice() async {
        let service = MockCircleNotifyService()
        var refusals: [String] = []
        let sut = makeSUT(service: service, online: false, refusals: { refusals.append($0) })
        await sut.load()
        await sut.choose(.public, for: post)
        XCTAssertTrue(service.updates.isEmpty)
        XCTAssertEqual(sut.preferences[post], .close)
        XCTAssertEqual(refusals.count, 1)
    }

    func test_choose_sameChoice_sendsNothing() async {
        let service = MockCircleNotifyService()
        let sut = makeSUT(service: service)
        await sut.load()
        await sut.choose(.close, for: post)
        XCTAssertTrue(service.updates.isEmpty)
    }

    func test_everyChoice_hasALabel_andOnlyNobodyCommunityPublicExplain() {
        let explained = RelationAudienceChoice.allCases.filter { CircleNotifySettingsContent.explanation(of: $0) != nil }
        XCTAssertEqual(explained, [.nobody, .community, .public])
        XCTAssertEqual(Set(RelationAudienceChoice.allCases.map(CircleNotifySettingsContent.label(of:))).count, 7)
        XCTAssertEqual(Set(CircleNotifyAction.allCases.map(CircleNotifySettingsContent.title(of:))).count, 11)
    }
}
