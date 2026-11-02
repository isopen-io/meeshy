import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// La barre montre la republication EN STORY d'un ami dès sa création (#14484).
/// La passerelle ne l'annonce que par `post:reposted`, jamais par
/// `story:created` : la barre écoute donc les deux, avec le même contrat
/// (ajout sans doublon, état « vu » conservé), et une passe complète du tray
/// partie AVANT l'annonce ne l'efface pas. Une republication dans le fil n'y
/// entre pas. Jumelle Android : `StoryRepostTrayTest`.
@MainActor
final class StoryTrayRepostAnnouncementTests: XCTestCase {

    private struct Harness {
        let sut: StoryViewModel
        let socket: MockSocialSocket
        let stories: MockStoryService
        let defaults: UserDefaults
        let suiteName: String
    }

    private var harnesses: [Harness] = []

    override func tearDown() async throws {
        for harness in harnesses {
            await StoryPublishFixtureCleanup.purge(harness.sut, defaults: harness.defaults)
            harness.defaults.removePersistentDomain(forName: harness.suiteName)
        }
        harnesses = []
        try await super.tearDown()
    }

    private func makeHarness(tray: [StoryGroup] = []) -> Harness {
        let suiteName = "StoryTrayRepostAnnouncementTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        let socket = MockSocialSocket()
        let stories = MockStoryService()
        let sut = StoryViewModel(
            storyService: stories,
            postService: MockPostService(),
            socialSocket: socket,
            api: MockAPIClientForApp(),
            visibilityStore: StoryVisibilityPreferenceStore(defaults: defaults)
        )
        sut.storyGroups = tray
        sut.subscribeToSocketEvents()
        let harness = Harness(sut: sut, socket: socket, stories: stories, defaults: defaults, suiteName: suiteName)
        harnesses.append(harness)
        return harness
    }

    private static let farFuture = "2099-01-01T00:00:00.000Z"

    private static func postJSON(id: String, type: String = "STORY", authorId: String, username: String) -> String {
        """
        {"id":"\(id)","type":"\(type)","content":"\(id)","createdAt":"2026-11-02T11:00:00.000Z",\
        "expiresAt":"\(farFuture)","author":{"id":"\(authorId)","username":"\(username)"}}
        """
    }

    private static func post(id: String, type: String = "STORY", authorId: String, username: String) -> APIPost {
        JSONStub.decode(postJSON(id: id, type: type, authorId: authorId, username: username))
    }

    private static func reposted(id: String, type: String = "STORY", authorId: String = "bob-id",
                                 username: String = "bob") -> SocketPostRepostedData {
        JSONStub.decode("""
        {"originalPostId":"original-1","repost":\(postJSON(id: id, type: type, authorId: authorId, username: username))}
        """)
    }

    private static let aliceServedPage: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
    {"success":true,"data":[\(postJSON(id: "s1", authorId: "alice-id", username: "alice"))],\
    "pagination":{"limit":50,"hasMore":false,"nextCursor":null},"error":null}
    """)

    private static func item(id: String, isViewed: Bool = false) -> StoryItem {
        let createdAt = Date(timeIntervalSince1970: 1_793_000_000)
        return StoryItem(id: id, content: id, media: [], storyEffects: nil, createdAt: createdAt,
                         expiresAt: createdAt.addingTimeInterval(86_400 * 365 * 80), isViewed: isViewed)
    }

    private static func group(_ userId: String, _ username: String, _ items: [StoryItem]) -> StoryGroup {
        StoryGroup(id: userId, username: username, avatarColor: "FF2E63", stories: items)
    }

    private static let aliceTray = [group("alice-id", "alice", [item(id: "s1")])]

    private func drainMainQueue() async {
        try? await Task.sleep(nanoseconds: 100_000_000)
    }

    private func trayIds(_ sut: StoryViewModel) -> Set<String> {
        Set(sut.storyGroups.flatMap(\.stories).map(\.id))
    }

    func test_postReposted_asAStory_joinsTheTrayAtOnce() async {
        let harness = makeHarness(tray: Self.aliceTray)

        harness.socket.postReposted.send(Self.reposted(id: "rp2"))
        await drainMainQueue()

        XCTAssertEqual(trayIds(harness.sut), ["s1", "rp2"])
        XCTAssertEqual(harness.sut.storyGroups.first(where: { $0.id == "bob-id" })?.stories.map(\.id), ["rp2"],
                       "la republication rejoint la bulle de l'ami qui republie")
    }

    func test_postReposted_intoTheFeedOrAsAStatus_staysOutOfTheTray() async {
        let harness = makeHarness(tray: Self.aliceTray)

        harness.socket.postReposted.send(Self.reposted(id: "rp-post", type: "POST"))
        harness.socket.postReposted.send(Self.reposted(id: "rp-reel", type: "REEL"))
        harness.socket.postReposted.send(Self.reposted(id: "rp-status", type: "STATUS"))
        await drainMainQueue()

        XCTAssertEqual(trayIds(harness.sut), ["s1"])
    }

    func test_postReposted_alreadyHeld_keepsWhatTheReaderSaw() async {
        let harness = makeHarness(tray: [Self.group("bob-id", "bob", [Self.item(id: "rp2", isViewed: true)])])

        harness.socket.postReposted.send(Self.reposted(id: "rp2"))
        await drainMainQueue()

        XCTAssertEqual(harness.sut.storyGroups.flatMap(\.stories).map(\.id), ["rp2"], "aucun doublon")
        XCTAssertEqual(harness.sut.storyGroups.first?.stories.first?.isViewed, true, "l'état vu du lecteur reste")
    }

    func test_postReposted_whileAFullRevalidationIsInFlight_survivesIt() async {
        let harness = makeHarness(tray: Self.aliceTray)
        harness.stories.listResult = .success(Self.aliceServedPage)
        harness.stories.whileListInFlight = { [socket = harness.socket] in
            socket.postReposted.send(Self.reposted(id: "rp2"))
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        await harness.sut.fetchStoriesFromNetwork()

        XCTAssertEqual(trayIds(harness.sut), ["s1", "rp2"],
                       "une page partie avant l'annonce ne porte pas la republication : elle ne doit pas l'effacer")
    }

    func test_storyCreated_whileAFullRevalidationIsInFlight_survivesIt() async {
        let harness = makeHarness(tray: Self.aliceTray)
        harness.stories.listResult = .success(Self.aliceServedPage)
        harness.stories.whileListInFlight = { [socket = harness.socket] in
            socket.storyCreated.send(Self.post(id: "s2", authorId: "bob-id", username: "bob"))
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        await harness.sut.fetchStoriesFromNetwork()

        XCTAssertEqual(trayIds(harness.sut), ["s1", "s2"])
    }

    func test_announcedThenDeletedWhileAFullRevalidationIsInFlight_staysGone() async {
        let harness = makeHarness(tray: Self.aliceTray)
        harness.stories.listResult = .success(Self.aliceServedPage)
        harness.stories.whileListInFlight = { [socket = harness.socket] in
            socket.postReposted.send(Self.reposted(id: "rp2"))
            try? await Task.sleep(nanoseconds: 50_000_000)
            socket.storyDeleted.send(JSONStub.decode(#"{"storyId":"rp2","authorId":"bob-id"}"#))
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        await harness.sut.fetchStoriesFromNetwork()

        XCTAssertEqual(trayIds(harness.sut), ["s1"], "une story retirée pendant la passe n'est pas ressuscitée")
    }

    func test_announcedBeforeAFullRevalidationStarts_isLeftToTheServer() async {
        let harness = makeHarness(tray: Self.aliceTray)
        harness.socket.postReposted.send(Self.reposted(id: "rp2"))
        await drainMainQueue()
        harness.stories.listResult = .success(Self.aliceServedPage)

        await harness.sut.fetchStoriesFromNetwork()

        XCTAssertEqual(trayIds(harness.sut), ["s1"],
                       "une passe partie APRÈS l'annonce fait foi : le serveur ne la sert plus, elle sort")
    }
}
