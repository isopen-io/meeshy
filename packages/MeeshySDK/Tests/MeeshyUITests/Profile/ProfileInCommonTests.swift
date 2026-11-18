import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19377 — planche `Autre-Commun` et `Etat-Vide` § 6 : « En commun » sur la Vitrine de l'autre. Une partie ouverte
/// donne son nombre et sa liste ; une partie verrouillée ne donne que le cercle qui l'ouvre ; le vide n'apparaît que
/// quand rien n'est partagé. Le cache peint d'abord, le réseau revalide en silence.
@MainActor
final class ProfileInCommonTests: XCTestCase {

    // MARK: - Fabriques

    private func friend(_ id: String, _ name: String?, username: String, circle: RelationLevel? = nil) -> InCommonFriend {
        InCommonFriend(id: id, username: username, displayName: name, circle: circle)
    }

    private func media(_ id: String, _ kind: InCommonMediaKind, playable: Bool = true) -> InCommonMedia {
        InCommonMedia(id: id, kind: kind, fileUrl: playable ? "https://x/\(id)" : nil)
    }

    private func leoInCommon(friendsTotal: Int = 12) -> UserInCommon {
        UserInCommon(
            id: "leo",
            communities: InCommonListPart(access: .open, total: 3, items: [
                InCommonCommunity(id: "c1", name: "Beatmakers Dakar"),
                InCommonCommunity(id: "c2", name: "Carnets de ville"),
                InCommonCommunity(id: "c3", name: "Lusophones"),
            ]),
            friends: InCommonListPart(access: .open, total: friendsTotal, items: [
                friend("f1", "Mina Okafor", username: "mina.o", circle: .blood),
                friend("f2", "Kwame Mensah", username: "kwame.m", circle: .close),
                friend("f3", "Tomás Ribeiro", username: "tomas.r", circle: .friend),
            ]),
            media: InCommonMediaPart(access: .open, counts: [.image: 200, .video: 30, .audio: 12, .file: 6],
                                     items: [media("m1", .image), media("m2", .audio), media("m3", .video)])
        )
    }

    // MARK: - Le résumé

    func test_resolve_summarizesConversationsCommunitiesAndFriends() {
        let digest = ProfileInCommonDigest.resolve(conversations: 6, inCommon: leoInCommon())

        XCTAssertEqual(digest.figures, [.conversations(6), .communities(3), .friends(12)])
        XCTAssertFalse(digest.isNothingInCommon)
    }

    func test_resolve_aLockedOrAbsentPartIsNeverCounted() {
        let inCommon = UserInCommon(id: "leo",
                                    communities: InCommonListPart(access: .open, total: 0, items: []),
                                    friends: InCommonListPart(access: .locked(.friend)))

        let digest = ProfileInCommonDigest.resolve(conversations: 2, inCommon: inCommon)

        XCTAssertEqual(digest.figures, [.conversations(2)])
        XCTAssertEqual(digest.friendsTotal, 0)
        XCTAssertTrue(digest.friends.isEmpty)
    }

    // MARK: - Les parties verrouillées

    func test_resolve_aLockedPartCarriesItsCircleOnly() {
        let inCommon = UserInCommon(id: "leo",
                                    communities: InCommonListPart(access: .open, total: 1,
                                                                  items: [InCommonCommunity(id: "c1", name: "Lusophones")]),
                                    friends: InCommonListPart(access: .locked(.friend)),
                                    media: InCommonMediaPart(access: .locked(.acquaintance)))

        let digest = ProfileInCommonDigest.resolve(conversations: 0, inCommon: inCommon)

        XCTAssertEqual(digest.locked, [
            ProfileInCommonDigest.LockedPart(part: .friends, opensAt: .friend),
            ProfileInCommonDigest.LockedPart(part: .media, opensAt: .acquaintance),
        ])
        XCTAssertTrue(digest.mediaFilters.isEmpty)
        XCTAssertTrue(digest.media.isEmpty)
        XCTAssertEqual(digest.mediaTotal, 0)
    }

    // MARK: - Les amis

    func test_friendLead_namesTwoFirstNamesThenCountsTheOthers() {
        let digest = ProfileInCommonDigest.resolve(conversations: 0, inCommon: leoInCommon())

        let lead = digest.friendLead

        XCTAssertEqual(lead.names, ["Mina", "Kwame"])
        XCTAssertEqual(lead.others, 10)
    }

    func test_friendLead_aFriendWithoutDisplayNameIsNamedByUsername() {
        let inCommon = UserInCommon(id: "leo", friends: InCommonListPart(access: .open, total: 1,
                                                                        items: [friend("f1", nil, username: "kwame.m")]))

        let lead = ProfileInCommonDigest.resolve(conversations: 0, inCommon: inCommon).friendLead

        XCTAssertEqual(lead.names, ["kwame.m"])
        XCTAssertEqual(lead.others, 0)
    }

    // MARK: - Les médias

    func test_mediaFilters_offerOnlyTheKindsTheServerCountsInThePlancheOrder() {
        let inCommon = UserInCommon(id: "leo", media: InCommonMediaPart(access: .open, counts: [.file: 2, .image: 5, .audio: 0]))

        let digest = ProfileInCommonDigest.resolve(conversations: 1, inCommon: inCommon)

        XCTAssertEqual(digest.mediaFilters, [.image, .file], "Liens n'apparaît qu'une fois servi (#19228)")
        XCTAssertEqual(digest.defaultFilter, .image)
        XCTAssertEqual(digest.mediaTotal, 7)
    }

    func test_latestVoice_isTheFirstPlayableAudio() {
        let inCommon = UserInCommon(id: "leo", media: InCommonMediaPart(
            access: .open, counts: [.audio: 2],
            items: [media("a0", .audio, playable: false), media("a1", .audio), media("a2", .audio)]))

        let digest = ProfileInCommonDigest.resolve(conversations: 1, inCommon: inCommon)

        XCTAssertEqual(digest.latestVoice?.id, "a1")
    }

    // MARK: - Le vide

    func test_isNothingInCommon_whenNoConversationAndEveryOpenPartIsEmpty() {
        let inCommon = UserInCommon(id: "leo",
                                    communities: InCommonListPart(access: .open, total: 0, items: []),
                                    friends: InCommonListPart(access: .locked(.friend)),
                                    media: InCommonMediaPart(access: .open, counts: [:]))

        XCTAssertTrue(ProfileInCommonDigest.resolve(conversations: 0, inCommon: inCommon).isNothingInCommon)
        XCTAssertFalse(ProfileInCommonDigest.resolve(conversations: 1, inCommon: inCommon).isNothingInCommon)
    }

    // MARK: - Notre histoire

    func test_history_keepsTheFirstStepOfEachKindInTimeOrder() {
        let day: TimeInterval = 86_400
        let start = Date(timeIntervalSince1970: 1_772_755_200)
        let inCommon = UserInCommon(id: "leo", history: [
            InCommonHistoryStep(kind: .close, at: start.addingTimeInterval(13 * day)),
            InCommonHistoryStep(kind: .firstMessage, at: start),
            InCommonHistoryStep(kind: .friend, at: start.addingTimeInterval(5 * day)),
            InCommonHistoryStep(kind: .friend, at: start.addingTimeInterval(40 * day)),
        ])

        let history = ProfileInCommonDigest.resolve(conversations: 1, inCommon: inCommon).history

        XCTAssertEqual(history.map(\.kind), [.firstMessage, .friend, .close])
        XCTAssertEqual(history[1].date, start.addingTimeInterval(5 * day), "une rétrogradation puis un retour ne déplacent pas le jalon")
    }

    func test_history_isEmptyWhenTheServerDoesNotServeIt() {
        XCTAssertTrue(ProfileInCommonDigest.resolve(conversations: 1, inCommon: leoInCommon()).history.isEmpty)
    }

    // MARK: - Le modèle : cache d'abord

    func test_open_paintsTheFreshCacheWithoutCallingTheNetwork() async {
        let source = StubInCommonLoading()
        source.cached = .fresh([leoInCommon()], age: 1)
        let model = ProfileInCommonModel()

        await model.open(userId: "leo", using: source)

        XCTAssertEqual(model.inCommon, leoInCommon())
        XCTAssertEqual(source.fetchCalls.count, 0)
    }

    func test_open_paintsTheStaleCacheThenRevalidatesAndStores() async {
        let source = StubInCommonLoading()
        source.cached = .stale([leoInCommon(friendsTotal: 4)], age: 999)
        source.served = .success(leoInCommon(friendsTotal: 12))
        let model = ProfileInCommonModel()

        await model.open(userId: "leo", using: source)

        XCTAssertEqual(model.inCommon?.friends?.shownTotal, 12)
        XCTAssertEqual(source.fetchCalls.map { $0.kind }, [nil])
        XCTAssertEqual(source.stored.map(\.id), ["leo"])
    }

    func test_open_aNetworkFailureKeepsWhatTheCacheShowed() async {
        let source = StubInCommonLoading()
        source.cached = .stale([leoInCommon(friendsTotal: 4)], age: 999)
        source.served = .failure(StubFailure())
        let model = ProfileInCommonModel()

        await model.open(userId: "leo", using: source)

        XCTAssertEqual(model.inCommon?.friends?.shownTotal, 4)
        XCTAssertTrue(source.stored.isEmpty)
    }

    func test_open_anotherPersonNeverSeesThePreviousOne() async {
        let source = StubInCommonLoading()
        source.cached = .fresh([leoInCommon()], age: 1)
        let model = ProfileInCommonModel()
        await model.open(userId: "leo", using: source)
        source.cached = .empty
        source.served = .failure(StubFailure())

        await model.open(userId: "sofia", using: source)

        XCTAssertNil(model.inCommon)
    }

    func test_select_asksTheServerForAKindWhoseFirstPageIsIncomplete() async {
        let source = StubInCommonLoading()
        source.cached = .fresh([leoInCommon()], age: 1)
        let model = ProfileInCommonModel()
        await model.open(userId: "leo", using: source)
        let videos = UserInCommon(id: "leo", media: InCommonMediaPart(
            access: .open, counts: [.video: 30], items: [media("v1", .video), media("v2", .video), media("i9", .image)]))
        source.served = .success(videos)

        await model.select(.video, userId: "leo", using: source)

        let digest = model.digest(conversations: 6)
        XCTAssertEqual(source.fetchCalls.map { $0.kind }, [.video])
        XCTAssertEqual(digest.map { model.media(of: .video, in: $0).map(\.id) }, ["v1", "v2"])
        XCTAssertEqual(digest.flatMap { model.shownFilter(in: $0) }, .video)
    }

    func test_select_aKindAlreadyCompleteIsNotAskedAgain() async {
        let source = StubInCommonLoading()
        let complete = UserInCommon(id: "leo", media: InCommonMediaPart(access: .open, counts: [.audio: 1],
                                                                       items: [media("a1", .audio)]))
        source.cached = .fresh([complete], age: 1)
        let model = ProfileInCommonModel()
        await model.open(userId: "leo", using: source)

        await model.select(.audio, userId: "leo", using: source)

        XCTAssertTrue(source.fetchCalls.isEmpty)
    }
}

@MainActor
private final class StubInCommonLoading: ProfileInCommonLoading {
    nonisolated deinit {}

    var cached: CacheResult<[UserInCommon]> = .empty
    var served: Result<UserInCommon, Error> = .failure(StubFailure())
    private(set) var fetchCalls: [(userId: String, kind: InCommonMediaKind?)] = []
    private(set) var stored: [UserInCommon] = []

    func cachedInCommon(with userId: String) async -> CacheResult<[UserInCommon]> { cached }

    func fetchInCommon(with userId: String, mediaKind: InCommonMediaKind?) async throws -> UserInCommon {
        fetchCalls.append((userId, mediaKind))
        return try served.get()
    }

    func storeInCommon(_ inCommon: UserInCommon) async {
        stored.append(inCommon)
    }
}
