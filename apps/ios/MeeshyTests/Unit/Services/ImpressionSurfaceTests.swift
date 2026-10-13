import XCTest
@testable import Meeshy
import MeeshySDK

/// #10483 — chaque point d'affichage dit OÙ un contenu est apparu. Une file
/// qui porte une surface part par la porte unique `POST /social/events`, sous
/// sa propre clé de persistance.
@MainActor
final class ImpressionSurfaceTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "impression-surface-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        try await super.tearDown()
    }

    private func makeBatcher(
        source: String,
        surface: ReachSurface?,
        service: MockPostService = MockPostService()
    ) -> (sut: ImpressionBatcher, service: MockPostService) {
        let sut = ImpressionBatcher(source: source, surface: surface, postService: service, flushDelay: 60, defaults: defaults)
        return (sut, service)
    }

    // MARK: - La porte et la surface

    func test_nearby_sendsSearchImpressions_onTheNearbySurface() async {
        let (sut, service) = makeBatcher(source: "search", surface: .nearby)

        sut.record("p1")
        sut.record("p1")
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents, [
            .impression(postId: "p1", source: "search", surface: .nearby),
            .impression(postId: "p1", source: "search", surface: .nearby),
        ], "Un compte compte chaque apparition, comme le fil.")
        XCTAssertEqual(service.recordedSocialEventsCredentials, [.account])
        XCTAssertEqual(service.recordImpressionsCallCount, 0)
    }

    func test_sound_sendsSearchImpressions_onTheSoundSurface() async {
        let (sut, service) = makeBatcher(source: "search", surface: .sound)

        sut.record("p9")
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents, [.impression(postId: "p9", source: "search", surface: .sound)])
    }

    func test_bookmarks_keepTheProfileSource_withTheirOwnSurface() async {
        let (sut, service) = makeBatcher(source: "profile", surface: .bookmarks)

        sut.record("b1")
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents, [.impression(postId: "b1", source: "profile", surface: .bookmarks)])
    }

    func test_withoutSurface_theLegacyBatchRouteIsUnchanged() async {
        let (sut, service) = makeBatcher(source: "feed", surface: nil)

        sut.record("f1")
        await sut.flushNow()

        XCTAssertEqual(service.lastRecordImpressionPostIds, ["f1"])
        XCTAssertEqual(service.recordSocialEventsCallCount, 0)
        XCTAssertEqual(ImpressionBatcher.storageKey(source: "feed", surface: nil), "meeshy.impressions.pending.feed")
    }

    // MARK: - Une clé par surface

    func test_twoSurfacesOfOneSource_doNotShareTheirQueue() async {
        let offline = MockPostService()
        offline.recordSocialEventsResult = .failure(URLError(.notConnectedToInternet))
        let (nearby, _) = makeBatcher(source: "search", surface: .nearby, service: offline)
        nearby.record("n1")
        await nearby.flushNow()

        let (sound, soundService) = makeBatcher(source: "search", surface: .sound)
        await sound.flushNow()

        XCTAssertEqual(soundService.recordSocialEventsCallCount, 0, "La file « son » ne rejoue pas celle d'« autour de moi ».")
        XCTAssertNotEqual(
            ImpressionBatcher.storageKey(source: "search", surface: .nearby),
            ImpressionBatcher.storageKey(source: "search", surface: .sound)
        )
    }

    func test_aRefusedChunk_keepsOnlyWhatWasNotAccepted() async {
        let service = MockPostService()
        service.recordSocialEventsResultsQueue = [
            .success(SocialEventsReceipt(recorded: 200, rejected: 0)),
            .failure(URLError(.timedOut)),
        ]
        let (sut, _) = makeBatcher(source: "search", surface: .nearby, service: service)
        (0..<250).forEach { sut.record("p\($0)") }

        await sut.flushNow()
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventBatches.map(\.count), [200, 50, 50],
                       "Le paquet accepté ne repart pas ; seul le reste est rejoué.")
    }

    // MARK: - Une fois par montage

    func test_storyRail_aRingAppearance_queuesItsStories() async {
        let (batcher, service) = makeBatcher(source: "story", surface: .storyRail)
        let sut = OncePerMountImpressions(batcher: batcher)

        sut.record(["s1", "s2"])
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents, [
            .impression(postId: "s1", source: "story", surface: .storyRail),
            .impression(postId: "s2", source: "story", surface: .storyRail),
        ])
    }

    func test_storyRail_aReappearanceInTheSameMount_isNotCountedTwice() async {
        let (batcher, service) = makeBatcher(source: "story", surface: .storyRail)
        let sut = OncePerMountImpressions(batcher: batcher)

        sut.record(["s1"])
        sut.record(["s1"])
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents.map(\.postId), ["s1"])
    }

    func test_storyRail_aNewMount_countsAgain() async {
        let (batcher, service) = makeBatcher(source: "story", surface: .storyRail)

        OncePerMountImpressions(batcher: batcher).record(["s1"])
        OncePerMountImpressions(batcher: batcher).record(["s1"])
        await batcher.flushNow()

        XCTAssertEqual(service.recordedSocialEvents.map(\.postId), ["s1", "s1"])
    }

    func test_storyRail_ringShowsOnlyActiveStories() {
        let now = Date()
        let group = StoryGroup(id: "u1", username: "ada", avatarColor: "#000000", stories: [
            StoryItem(id: "live", createdAt: now, expiresAt: now.addingTimeInterval(3_600)),
            StoryItem(id: "gone", createdAt: now.addingTimeInterval(-90_000), expiresAt: now.addingTimeInterval(-60)),
        ])

        XCTAssertEqual(StoryRailReach.displayedStoryIds(of: group, at: now), ["live"])
    }

    // MARK: - Les citations

    func test_citation_ofAStoryOrAMood_namesTheCitedContent() {
        let story = ReplyReference(messageId: "story1", authorName: "Ada", previewText: "", isStoryReply: true)
        let mood = ReplyReference(messageId: "mood1", authorName: "Ada", previewText: "", moodEmoji: "🙂")

        XCTAssertEqual(CitationReach.citedContentId(of: story), "story1")
        XCTAssertEqual(CitationReach.citedContentId(of: mood), "mood1")
    }

    func test_citation_ofAMessageOrAVanishedStory_countsNothing() {
        let message = ReplyReference(messageId: "m1", authorName: "Ada", previewText: "Salut")
        let vanished = ReplyReference(messageId: "story2", authorName: "Ada", previewText: "", isStoryReply: true, storyUnavailable: true)

        XCTAssertNil(CitationReach.citedContentId(of: message))
        XCTAssertNil(CitationReach.citedContentId(of: vanished))
    }

    func test_citation_sharedQueue_usesTheCitationSurface() async {
        let (batcher, service) = makeBatcher(source: "shared_link", surface: .citation)

        batcher.record("story1")
        await batcher.flushNow()

        XCTAssertEqual(service.recordedSocialEvents, [.impression(postId: "story1", source: "shared_link", surface: .citation)])
    }
}
