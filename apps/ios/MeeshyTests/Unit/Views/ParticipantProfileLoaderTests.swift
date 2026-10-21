import XCTest
@testable import Meeshy
import MeeshySDK

/// #10111 — la fiche d'un participant s'ouvre sur ce que le cache garde, se synchronise dès l'ouverture (cache frais
/// compris), ne montre de chargement que sur un cache vide, et un échec de synchro ne retire jamais la fiche. Seul le
/// départ du participant (404) efface la copie : c'est un fait, pas une panne.
@MainActor
final class ParticipantProfileLoaderTests: XCTestCase {

    private struct Offline: Error {}

    private func makeProfile(displayName: String = "Bob") throws -> ConversationParticipantProfile {
        let json = #"""
        {"participantId":"p-bob","conversationId":"g1","isAnonymous":true,"userId":null,
         "username":"bob","displayName":"\#(displayName)","isOnline":false,"hasEmail":false,"hasBirthday":false}
        """#
        return try JSONDecoder().decode(ConversationParticipantProfile.self, from: Data(json.utf8))
    }

    private func makeSUT(
        cached: CacheResult<[ConversationParticipantProfile]> = .empty,
        fetched: Result<ConversationParticipantProfile, Error> = .failure(Offline())
    ) -> (sut: ParticipantProfileLoader, data: MockParticipantProfileData) {
        let data = MockParticipantProfileData()
        data.cachedResult = cached
        data.fetchResult = fetched
        return (ParticipantProfileLoader(conversationId: "g1", participantId: "p-bob", data: data), data)
    }

    func test_paintFromCache_cachedProfile_showsItWithoutLoadingOrNetwork() async throws {
        let (sut, data) = makeSUT(cached: .stale([try makeProfile(displayName: "Bob en cache")], age: 900))

        await sut.paintFromCache()

        XCTAssertEqual(sut.profile?.displayName, "Bob en cache")
        XCTAssertFalse(sut.isLoading)
        XCTAssertEqual(data.fetchCallCount, 0)
    }

    func test_paintFromCache_emptyCache_showsTheLoadingStateOnly() async {
        let (sut, _) = makeSUT()

        await sut.paintFromCache()

        XCTAssertNil(sut.profile)
        XCTAssertTrue(sut.isLoading)
    }

    func test_open_freshCache_stillSynchronizesOnOpening() async throws {
        let (sut, data) = makeSUT(cached: .fresh([try makeProfile(displayName: "Bob en cache")], age: 5),
                                  fetched: .success(try makeProfile(displayName: "Bob à jour")))

        await sut.open()

        XCTAssertEqual(data.fetchCallCount, 1)
        XCTAssertEqual(sut.profile?.displayName, "Bob à jour")
        XCTAssertEqual(data.stored.map(\.displayName), ["Bob à jour"])
        XCTAssertEqual(data.storedKeys, ["g1/p-bob"])
    }

    func test_open_synchronizationFails_keepsTheCachedProfile() async throws {
        let (sut, _) = makeSUT(cached: .stale([try makeProfile(displayName: "Bob en cache")], age: 900))

        await sut.open()

        XCTAssertEqual(sut.profile?.displayName, "Bob en cache")
        XCTAssertFalse(sut.loadFailed)
        XCTAssertFalse(sut.isLoading)
    }

    func test_open_emptyCacheAndFailure_saysTheProfileIsUnavailable() async {
        let (sut, _) = makeSUT()

        await sut.open()

        XCTAssertNil(sut.profile)
        XCTAssertTrue(sut.loadFailed)
        XCTAssertFalse(sut.hasLeft)
        XCTAssertFalse(sut.isLoading)
    }

    func test_open_participantLeft_dropsTheCachedCopyAndSaysSo() async throws {
        let (sut, data) = makeSUT(cached: .stale([try makeProfile()], age: 900),
                                  fetched: .failure(APIError.serverError(404, nil)))

        await sut.open()

        XCTAssertNil(sut.profile)
        XCTAssertTrue(sut.hasLeft)
        XCTAssertTrue(sut.loadFailed)
        XCTAssertEqual(data.invalidatedKeys, ["g1/p-bob"])
    }

    func test_update_changesTheShownProfileAndKeepsItInTheCache() async throws {
        let (sut, data) = makeSUT(cached: .fresh([try makeProfile()], age: 1))
        await sut.paintFromCache()
        let date = Date(timeIntervalSince1970: 1_800_000_000)

        await sut.update { $0.historyVisibleFrom = date }

        XCTAssertEqual(sut.profile?.historyVisibleFrom, date)
        XCTAssertEqual(data.stored.last?.historyVisibleFrom, date)
    }

    func test_cachedProfile_roundTripsThroughTheCacheEncoding() throws {
        let profile = try makeProfile(displayName: "Bob")

        let decoded = try JSONDecoder().decode(ConversationParticipantProfile.self, from: JSONEncoder().encode(profile))

        XCTAssertEqual(decoded, profile)
        XCTAssertEqual(profile.id, "g1/p-bob")
    }
}

@MainActor
final class MockParticipantProfileData: ParticipantProfileDataProviding {
    var cachedResult: CacheResult<[ConversationParticipantProfile]> = .empty
    var fetchResult: Result<ConversationParticipantProfile, Error> = .failure(URLError(.notConnectedToInternet))

    private(set) var fetchCallCount = 0
    private(set) var stored: [ConversationParticipantProfile] = []
    private(set) var storedKeys: [String] = []
    private(set) var invalidatedKeys: [String] = []

    nonisolated deinit {}

    func cachedProfile(for key: String) async -> CacheResult<[ConversationParticipantProfile]> { cachedResult }

    func fetchProfile(conversationId: String, participantId: String) async throws -> ConversationParticipantProfile {
        fetchCallCount += 1
        return try fetchResult.get()
    }

    func storeProfile(_ profile: ConversationParticipantProfile, for key: String) async {
        stored.append(profile)
        storedKeys.append(key)
    }

    func invalidateProfile(for key: String) async {
        invalidatedKeys.append(key)
    }
}
