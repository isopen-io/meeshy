import XCTest
import SwiftUI
import UIKit
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
        window?.isHidden = true
        window = nil
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

    /// Sans surface, le lot part AUSSI par la porte unique — plus jamais par
    /// `POST /posts/impressions/batch` — et la file garde sa clé historique.
    func test_withoutSurface_goesThroughTheSocialEventsDoor_andKeepsItsKey() async {
        let (sut, service) = makeBatcher(source: "feed", surface: nil)

        sut.record("f1")
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents, [.impression(postId: "f1", source: "feed", surface: nil)])
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

    // MARK: - Le rail : l'anneau montre UNE story

    private func story(_ id: String, viewed: Bool, expiresIn: TimeInterval = 3_600, now: Date) -> StoryItem {
        var item = StoryItem(id: id, createdAt: now, expiresAt: now.addingTimeInterval(expiresIn))
        item.isViewed = viewed
        return item
    }

    func test_storyRail_ringShowsTheFirstUnseenStory_notTheWholeGroup() {
        let now = Date()
        let group = StoryGroup(id: "u1", username: "ada", avatarColor: "#000000", stories: [
            story("seen", viewed: true, now: now),
            story("next", viewed: false, now: now),
            story("later", viewed: false, now: now),
        ])

        XCTAssertEqual(StoryRailReach.displayedStoryId(of: group, at: now), "next")
    }

    func test_storyRail_allSeen_ringShowsTheFirstActiveStory() {
        let now = Date()
        let group = StoryGroup(id: "u1", username: "ada", avatarColor: "#000000", stories: [
            story("gone", viewed: false, expiresIn: -60, now: now),
            story("first", viewed: true, now: now),
            story("second", viewed: true, now: now),
        ])

        XCTAssertEqual(StoryRailReach.displayedStoryId(of: group, at: now), "first")
    }

    func test_storyRail_onlyExpiredStories_showsNothing() {
        let now = Date()
        let group = StoryGroup(id: "u1", username: "ada", avatarColor: "#000000", stories: [
            story("gone", viewed: false, expiresIn: -60, now: now),
        ])

        XCTAssertNil(StoryRailReach.displayedStoryId(of: group, at: now))
    }

    // MARK: - Une file par compte

    func test_anImpressionSeenByAccountA_neverLeavesUnderAccountB() async {
        let service = MockPostService()
        let account = AccountBox(value: "userA")
        let sut = ImpressionBatcher(
            source: "story", surface: .storyRail, postService: service, flushDelay: 60,
            defaults: defaults, accountId: { account.value }
        )
        sut.record("seenByA")

        account.value = "userB"
        sut.record("seenByB")
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents.map(\.postId), ["seenByB"],
                       "La file de A ne part pas sous le JWT de B.")
    }

    func test_accountAQueue_staysOnItsDisk_andLeavesWhenAReturns() async {
        let service = MockPostService()
        let account = AccountBox(value: "userA")
        let sut = ImpressionBatcher(
            source: "story", surface: .storyRail, postService: service, flushDelay: 60,
            defaults: defaults, accountId: { account.value }
        )
        sut.record("seenByA")
        account.value = "userB"
        await sut.flushNow()
        XCTAssertEqual(service.recordSocialEventsCallCount, 0)

        account.value = "userA"
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEvents.map(\.postId), ["seenByA"])
    }

    func test_persistedQueue_isKeyedByAccount() {
        let sutA = ImpressionBatcher(
            source: "status", surface: .moodAvatar, postService: MockPostService(), flushDelay: 60,
            defaults: defaults, accountId: { "userA" }
        )
        sutA.record("m1")

        let revivedAsB = ImpressionBatcher(
            source: "status", surface: .moodAvatar, postService: MockPostService(), flushDelay: 60,
            defaults: defaults, accountId: { "userB" }
        )
        let revivedAsA = ImpressionBatcher(
            source: "status", surface: .moodAvatar, postService: MockPostService(), flushDelay: 60,
            defaults: defaults, accountId: { "userA" }
        )

        XCTAssertNil(defaults.object(forKey: ImpressionBatcher.storageKey(source: "status", surface: .moodAvatar, accountId: "userB")))
        XCTAssertEqual(ImpressionBatcher.restore(from: defaults, key: ImpressionBatcher.storageKey(source: "status", surface: .moodAvatar, accountId: "userA")).map(\.postId), ["m1"])
        _ = revivedAsB
        _ = revivedAsA
    }

    // MARK: - Une apparition = une impression, un re-rendu = rien

    private var window: UIWindow?

    private func host<V: View>(_ view: V) -> UIHostingController<V> {
        let controller = UIHostingController(rootView: view)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.rootViewController = controller
        window.isHidden = false
        self.window = window
        controller.view.layoutIfNeeded()
        return controller
    }

    private func settle() async {
        for _ in 0..<5 {
            window?.layoutIfNeeded()
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    func test_modifier_countsEachAppearance_butNotARerender() async {
        let recorder = RecordingSpy()
        let controller = host(ImpressionProbe(postId: "p1", label: "a", visible: true, recorder: recorder))
        await settle()
        XCTAssertEqual(recorder.ids, ["p1"], "L'apparition compte.")

        controller.rootView = ImpressionProbe(postId: "p1", label: "b", visible: true, recorder: recorder)
        await settle()
        XCTAssertEqual(recorder.ids, ["p1"], "Un re-rendu n'est pas une apparition.")

        controller.rootView = ImpressionProbe(postId: "p1", label: "b", visible: false, recorder: recorder)
        await settle()
        controller.rootView = ImpressionProbe(postId: "p1", label: "b", visible: true, recorder: recorder)
        await settle()
        XCTAssertEqual(recorder.ids, ["p1", "p1"], "Une réapparition se recompte : aucun dédoublonnage.")
    }

    func test_modifier_newContentInTheSameView_isANewImpression() async {
        let recorder = RecordingSpy()
        let controller = host(ImpressionProbe(postId: "m1", label: "a", visible: true, recorder: recorder))
        await settle()

        controller.rootView = ImpressionProbe(postId: "m2", label: "a", visible: true, recorder: recorder)
        await settle()

        XCTAssertEqual(recorder.ids, ["m1", "m2"])
    }

    func test_modifier_withoutContent_countsNothing() async {
        let recorder = RecordingSpy()
        _ = host(ImpressionProbe(postId: nil, label: "a", visible: true, recorder: recorder))
        await settle()

        XCTAssertTrue(recorder.ids.isEmpty)
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

@MainActor
private final class AccountBox {
    nonisolated deinit {}
    var value: String?
    init(value: String?) { self.value = value }
}

@MainActor
private final class RecordingSpy {
    nonisolated deinit {}
    private(set) var ids: [String] = []
    func record(_ id: String) { ids.append(id) }
}

private struct ImpressionProbe: View {
    let postId: String?
    let label: String
    let visible: Bool
    let recorder: RecordingSpy

    var body: some View {
        VStack {
            Text(label)
            if visible {
                Text("contenu")
                    .countsImpression(of: postId) { recorder.record($0) }
            }
        }
    }
}
