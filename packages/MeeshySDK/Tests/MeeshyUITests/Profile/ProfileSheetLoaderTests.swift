import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #10093 — la fiche d'un profil s'ouvre sur ce que le cache garde (profil,
/// statistiques), puis se synchronise dès l'ouverture, même sur un cache frais ;
/// un échec de synchro ne retire jamais ce qui est affiché.
@MainActor
final class ProfileSheetLoaderTests: XCTestCase {

    private struct Offline: Error {}

    private func makeUser(id: String = "u-bob", username: String = "bob", displayName: String = "Bob") -> MeeshyUser {
        MeeshyUser(id: id, username: username, displayName: displayName)
    }

    private func makeStats(messages: Int) -> UserStats {
        UserStats(totalMessages: messages)
    }

    private func makeSUT(
        cachedProfile: CacheResult<[MeeshyUser]> = .empty,
        cachedStats: CacheResult<[UserStats]> = .empty,
        fetchedProfile: Result<MeeshyUser, Error>? = nil,
        fetchedStats: Result<UserStats, Error>? = nil
    ) -> (sut: ProfileSheetLoader, data: MockProfileSheetData) {
        let data = MockProfileSheetData()
        data.cachedProfileResult = cachedProfile
        data.cachedStatsResult = cachedStats
        data.fetchProfileResult = fetchedProfile ?? .success(makeUser())
        data.fetchStatsResult = fetchedStats ?? .success(makeStats(messages: 1))
        return (ProfileSheetLoader(), data)
    }

    func test_paintFromCache_freshProfileAndStats_paintsThemWithoutTouchingTheNetwork() async {
        let (sut, data) = makeSUT(
            cachedProfile: .fresh([makeUser(displayName: "Bob en cache")], age: 10),
            cachedStats: .stale([makeStats(messages: 42)], age: 900)
        )

        await sut.paintFromCache(userId: "u-bob", username: "bob", using: data)

        XCTAssertEqual(sut.profile?.displayName, "Bob en cache")
        XCTAssertEqual(sut.stats?.totalMessages, 42)
        XCTAssertFalse(sut.isLoadingProfile)
        XCTAssertFalse(sut.isLoadingStats)
        XCTAssertEqual(data.fetchProfileCallCount, 0)
        XCTAssertEqual(data.fetchStatsCallCount, 0)
    }

    func test_paintFromCache_emptyCache_showsTheLoadingStateOnly() async {
        let (sut, data) = makeSUT()

        await sut.paintFromCache(userId: "u-bob", username: "bob", using: data)

        XCTAssertNil(sut.profile)
        XCTAssertTrue(sut.isLoadingProfile)
        XCTAssertTrue(sut.isLoadingStats)
    }

    func test_open_freshCache_stillSynchronizesProfileAndStatsOnOpening() async {
        let (sut, data) = makeSUT(
            cachedProfile: .fresh([makeUser(displayName: "Bob en cache")], age: 10),
            cachedStats: .fresh([makeStats(messages: 42)], age: 10),
            fetchedProfile: .success(makeUser(displayName: "Bob à jour")),
            fetchedStats: .success(makeStats(messages: 43))
        )

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertEqual(data.fetchProfileCallCount, 1)
        XCTAssertEqual(data.fetchStatsCallCount, 1)
        XCTAssertEqual(sut.profile?.displayName, "Bob à jour")
        XCTAssertEqual(sut.stats?.totalMessages, 43)
        XCTAssertEqual(data.storedProfiles.map(\.displayName), ["Bob à jour"])
        XCTAssertEqual(data.storedStatsUserIds, ["u-bob"])
    }

    func test_open_synchronizationFails_keepsTheCachedProfileAndStatsOnScreen() async {
        let (sut, data) = makeSUT(
            cachedProfile: .stale([makeUser(displayName: "Bob en cache")], age: 900),
            cachedStats: .stale([makeStats(messages: 42)], age: 900),
            fetchedProfile: .failure(Offline()),
            fetchedStats: .failure(Offline())
        )

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertEqual(sut.profile?.displayName, "Bob en cache")
        XCTAssertEqual(sut.stats?.totalMessages, 42)
        XCTAssertFalse(sut.isLoadingProfile)
        XCTAssertFalse(sut.isLoadingStats)
        XCTAssertFalse(sut.isBlockedByTarget)
    }

    func test_open_emptyCache_paintsWhatTheNetworkServesAndEndsTheLoading() async {
        let (sut, data) = makeSUT(fetchedProfile: .success(makeUser(displayName: "Bob servi")))

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertEqual(sut.profile?.displayName, "Bob servi")
        XCTAssertFalse(sut.isLoadingProfile)
        XCTAssertFalse(sut.isLoadingStats)
    }

    func test_open_targetForbidsTheProfile_marksBlockedByTarget() async {
        let (sut, data) = makeSUT(fetchedProfile: .failure(APIError.serverError(403, nil)))

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertTrue(sut.isBlockedByTarget)
    }

    func test_open_404OverACachedProfile_marksBlockedByTarget() async {
        let (sut, data) = makeSUT(
            cachedProfile: .fresh([makeUser(displayName: "Bob en cache")], age: 10),
            fetchedProfile: .failure(APIError.serverError(404, nil))
        )

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertTrue(sut.isBlockedByTarget)
        XCTAssertFalse(sut.profileLoadFailed)
        XCTAssertNil(sut.profile, "rien du cache ne reste peint sur la fiche d'un pair qui m'a bloqué")
    }

    /// Le transport RÉEL ne lève jamais `APIError` : un 404 sort en `MeeshyError.server(statusCode: 404, …)` (#10750).
    func test_open_404FromTheRealTransportOverACachedProfile_marksBlockedAndDropsTheCache() async {
        let (sut, data) = makeSUT(
            cachedProfile: .fresh([makeUser(displayName: "Bob en cache")], age: 10),
            fetchedProfile: .failure(MeeshyError.server(statusCode: 404, message: "User not found"))
        )

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertTrue(sut.isBlockedByTarget)
        XCTAssertNil(sut.profile)
        XCTAssertFalse(sut.profileLoadFailed)
    }

    func test_open_404FromTheRealTransportOnColdCache_isAPlainFailure() async {
        let (sut, data) = makeSUT(fetchedProfile: .failure(MeeshyError.server(statusCode: 404, message: "User not found")))

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertFalse(sut.isBlockedByTarget)
        XCTAssertTrue(sut.profileLoadFailed)
    }

    func test_open_404OnColdCache_isAPlainFailureNotABlock() async {
        let (sut, data) = makeSUT(fetchedProfile: .failure(APIError.serverError(404, nil)))

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertFalse(sut.isBlockedByTarget)
        XCTAssertTrue(sut.profileLoadFailed)
    }

    // MARK: - Un profil qui n'a pas pu se charger (#8025)

    func test_open_emptyCacheAndSynchronizationFails_offersARetry() async {
        let (sut, data) = makeSUT(fetchedProfile: .failure(Offline()))

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertNil(sut.profile)
        XCTAssertTrue(sut.profileLoadFailed, "rien à montrer et rien de chargé : l'écran propose de réessayer")
        XCTAssertFalse(sut.isLoadingProfile)
        XCTAssertFalse(sut.isBlockedByTarget)
    }

    func test_open_synchronizationFailsOverACachedProfile_keepsItWithoutARetryState() async {
        let (sut, data) = makeSUT(
            cachedProfile: .stale([makeUser(displayName: "Bob en cache")], age: 900),
            fetchedProfile: .failure(Offline())
        )

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertEqual(sut.profile?.displayName, "Bob en cache")
        XCTAssertFalse(sut.profileLoadFailed, "le cache reste affiché : pas d'état d'erreur par-dessus")
    }

    func test_retry_afterAFailure_reloadsAndPaintsTheProfile() async {
        let (sut, data) = makeSUT(fetchedProfile: .failure(Offline()))
        await sut.open(userId: "u-bob", username: "bob", using: data)
        XCTAssertTrue(sut.profileLoadFailed)

        data.fetchProfileResult = .success(makeUser(displayName: "Bob revenu"))
        await sut.retry(userId: "u-bob", username: "bob", using: data)

        XCTAssertEqual(data.fetchProfileCallCount, 2, "Réessayer relance le chargement")
        XCTAssertEqual(sut.profile?.displayName, "Bob revenu")
        XCTAssertFalse(sut.profileLoadFailed)
        XCTAssertFalse(sut.isLoadingProfile)
    }

    func test_retry_failingAgain_keepsOfferingTheRetry() async {
        let (sut, data) = makeSUT(fetchedProfile: .failure(Offline()))
        await sut.open(userId: "u-bob", username: "bob", using: data)

        await sut.retry(userId: "u-bob", username: "bob", using: data)

        XCTAssertTrue(sut.profileLoadFailed)
        XCTAssertFalse(sut.isLoadingProfile)
    }

    func test_open_profileRefused_offersNoRetry() async {
        let (sut, data) = makeSUT(fetchedProfile: .failure(MeeshyError.forbidden(reason: nil, body: nil)))

        await sut.open(userId: "u-bob", username: "bob", using: data)

        XCTAssertFalse(sut.profileLoadFailed, "un refus n'est pas une panne : réessayer ne changerait rien")
    }

    func test_userProfileSheet_mountsTheRetryStateOnTheLoaderRetry() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Profile/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Profile/UserProfileSheet.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(source.contains("loader.profileLoadFailed"), "l'état d'erreur du profil est dessiné")
        XCTAssertTrue(source.contains("loader.retry(userId:"), "le bouton relance le chargement")
        XCTAssertTrue(source.contains("\"common.retry\""), "le bouton dit « Réessayer »")
        XCTAssertTrue(source.contains("minHeight: MeeshyControlSize.tapTarget"), "cible de 44 pt")
    }

    func test_open_byUsernameOnColdCache_readsTheStatsOfTheResolvedId() async {
        let (sut, data) = makeSUT(fetchedProfile: .success(makeUser(id: "u-resolved", username: "bob")))

        await sut.open(userId: nil, username: "bob", using: data)

        XCTAssertEqual(data.fetchedProfileHandles, ["bob"])
        XCTAssertEqual(data.fetchedStatsUserIds, ["u-resolved"])
        XCTAssertEqual(data.storedProfileLookupKeys, ["bob"])
    }

    func test_sharedConversations_estServiParLeChargeurInjecte() async throws {
        let (_, data) = makeSUT()
        data.sharedConversationsResult = .success([MeeshyConversation(id: "conv-1", identifier: "mshy_conv-1", type: .direct)])

        let served = try await data.sharedConversations(with: "u-bob", currentUserId: "u-me")

        XCTAssertEqual(served.map(\.id), ["conv-1"])
        XCTAssertEqual(data.sharedConversationRequests, ["u-bob|u-me"])
    }

    func test_repaint_replacesTheShownProfile() async {
        let (sut, data) = makeSUT(cachedProfile: .fresh([makeUser(displayName: "Bob")], age: 1))
        await sut.paintFromCache(userId: "u-bob", username: "bob", using: data)

        sut.repaint(makeUser(displayName: "Bobby"))

        XCTAssertEqual(sut.profile?.displayName, "Bobby")
    }
}

@MainActor
final class MockProfileSheetData: ProfileLoading {
    var cachedProfileResult: CacheResult<[MeeshyUser]> = .empty
    var cachedStatsResult: CacheResult<[UserStats]> = .empty
    var fetchProfileResult: Result<MeeshyUser, Error> = .failure(URLError(.notConnectedToInternet))
    var fetchStatsResult: Result<UserStats, Error> = .failure(URLError(.notConnectedToInternet))

    private(set) var fetchProfileCallCount = 0
    private(set) var fetchStatsCallCount = 0
    private(set) var fetchedProfileHandles: [String] = []
    private(set) var fetchedStatsUserIds: [String] = []
    private(set) var storedProfiles: [MeeshyUser] = []
    private(set) var storedProfileLookupKeys: [String] = []
    private(set) var storedStatsUserIds: [String] = []

    nonisolated deinit {}

    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]> { cachedProfileResult }

    func fetchProfile(handle: String) async throws -> MeeshyUser {
        fetchProfileCallCount += 1
        fetchedProfileHandles.append(handle)
        return try fetchProfileResult.get()
    }

    func storeProfile(_ user: MeeshyUser, lookupKey: String) async {
        storedProfiles.append(user)
        storedProfileLookupKeys.append(lookupKey)
    }

    func cachedStats(for userId: String) async -> CacheResult<[UserStats]> { cachedStatsResult }

    func fetchStats(userId: String) async throws -> UserStats {
        fetchStatsCallCount += 1
        fetchedStatsUserIds.append(userId)
        return try fetchStatsResult.get()
    }

    func storeStats(_ stats: UserStats, userId: String) async {
        storedStatsUserIds.append(userId)
    }

    var sharedConversationsResult: Result<[MeeshyConversation], Error> = .success([])
    private(set) var sharedConversationRequests: [String] = []

    func sharedConversations(with userId: String, currentUserId: String) async throws -> [MeeshyConversation] {
        sharedConversationRequests.append("\(userId)|\(currentUserId)")
        return try sharedConversationsResult.get()
    }
}
