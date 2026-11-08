import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// `StoryViewModel` — suppression et TEMPS RÉEL : événements socket,
/// mises à jour, réactions, reconnexion.
@MainActor
final class StoryViewModelRealtimeTests: StoryViewModelTestCase {

    // MARK: - deleteStory() Tests

    func test_deleteStory_removesStoryFromGroup() async {
        let item1 = makeStoryItem(id: "keep-me")
        let item2 = makeStoryItem(id: "delete-me")
        let group = makeStoryGroup(userId: "u1", stories: [item1, item2])
        sut.storyGroups = [group]

        let result = await sut.deleteStory(storyId: "delete-me")

        XCTAssertTrue(result)
        XCTAssertEqual(sut.storyGroups[0].stories.count, 1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].id, "keep-me")
    }

    func test_deleteStory_removesEmptyGroupAfterLastStoryDeleted() async {
        let item = makeStoryItem(id: "only-story")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        let result = await sut.deleteStory(storyId: "only-story")

        XCTAssertTrue(result)
        XCTAssertTrue(sut.storyGroups.isEmpty, "Empty group should be removed")
    }

    func test_deleteStory_serviceFailure_returnsFalse() async {
        let item = makeStoryItem(id: "fail-delete")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]
        mockStoryService.deleteResult = .failure(APIError.networkError(URLError(.timedOut)))

        let result = await sut.deleteStory(storyId: "fail-delete")

        XCTAssertFalse(result)
        XCTAssertEqual(sut.storyGroups[0].stories.count, 1, "Story should remain on failure")
    }

    // MARK: - #15127 — une story en attente n'a pas d'id serveur

    func test_deleteStory_onPendingStory_sendsNoDelete() async {
        let pendingId = "\(StoryViewModel.pendingStoryIdPrefix)\(UUID().uuidString)#0"
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: pendingId)])]

        let result = await sut.deleteStory(storyId: pendingId)

        XCTAssertFalse(result, "une story en attente s'annule par la file, jamais par un DELETE")
        XCTAssertEqual(mockStoryService.deleteCallCount, 0)
        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), [pendingId])
    }

    func test_applyVisibility_onPendingStory_sendsNoUpdate() async {
        let pendingId = "\(StoryViewModel.pendingStoryIdPrefix)\(UUID().uuidString)#0"
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: pendingId)])]

        let result = await sut.applyVisibility(storyId: pendingId, visibility: "FRIENDS", userIds: [])

        XCTAssertFalse(result)
        XCTAssertEqual(mockPostService.updateCallCount, 0)
    }

    func test_deleteStory_callsServiceDelete() async {
        let item = makeStoryItem(id: "tracked-delete")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        _ = await sut.deleteStory(storyId: "tracked-delete")

        XCTAssertEqual(mockStoryService.deleteCallCount, 1)
        XCTAssertEqual(mockStoryService.lastDeleteStoryId, "tracked-delete")
    }

    /// **Plantage TestFlight build 1890** — « j'ai supprimé une story ça a
    /// planté » : `deleteStory` repris sur un fil coopératif, `purgeDeadStories`
    /// trappait à la vérification d'exécuteur de sa fermeture `.filter`. La
    /// suppression traverse désormais une frontière `@concurrent` : la purge
    /// retombe sur le main quelle que soit la file où le réseau reprend.
    func test_deleteStory_networkResumingOnABackgroundQueue_purgesOnTheMainThread() async {
        let item = makeStoryItem(id: "bg-delete")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "keep"), item])]
        mockStoryService.deleteResumesOnBackgroundQueue = true
        var purgedOnMain: Bool?
        sut.$storyGroups.dropFirst()
            .sink { _ in purgedOnMain = pthread_main_np() != 0 }
            .store(in: &cancellables)

        let result = await sut.deleteStory(storyId: "bg-delete")

        XCTAssertTrue(result)
        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["keep"])
        XCTAssertEqual(purgedOnMain, true, "la purge du tray doit s'exécuter sur le main")
    }

    /// Garde de source : l'appel réseau de `deleteStory` passe par la frontière
    /// `@concurrent` — un appel direct à `storyService.delete` (nonsending) ne
    /// réémet aucun saut vers le MainActor au retour.
    func test_deleteStory_source_goesThroughTheConcurrentBoundary() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.storyViewModelSource())
        let body = try XCTUnwrap(
            source.range(of: "func deleteStory(storyId: String, reason: String? = nil) async -> Bool").map { String(source[$0.lowerBound...].prefix(500)) },
            "deleteStory a disparu de StoryViewModel"
        )
        XCTAssertTrue(body.contains("Self.deleteRemotely(storyId: storyId, reason: reason, with: storyService)"),
                      "deleteStory doit appeler la frontière @concurrent, motif de modération compris (#11151)")
        XCTAssertFalse(body.contains("storyService.delete("), "aucun appel nonsending direct dans deleteStory")
        XCTAssertTrue(
            source.contains("@concurrent\n    nonisolated static func deleteRemotely("),
            "deleteRemotely doit rester @concurrent"
        )
    }

    // MARK: - Socket.IO Tests

    func test_socketStoryCreated_addsToExistingGroup() async {
        let existingItem = makeStoryItem(id: "existing-story")
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let newStoryPost = Self.makeStoryAPIPost(
            id: "socket-story-new",
            content: "New story from socket",
            authorId: "author-1",
            authorUsername: "alice"
        )
        mockSocket.storyCreated.send(newStoryPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 1, "Should still have one group for same author")
        XCTAssertEqual(sut.storyGroups[0].stories.count, 2, "New story should be appended to existing group")
    }

    func test_socketStoryCreated_createsNewGroupForNewAuthor() async {
        // Anchor both timestamps explicitly so the test asserts ordering by
        // the Instagram-style sort (hasUnviewed → latestStory desc), not by
        // the legacy "always insert at 0" rule. Bob posts a story timestamped
        // AFTER alice's existing one — so Bob must land at index 0.
        let existingItem = makeStoryItem(
            id: "existing-story",
            createdAt: Date(timeIntervalSince1970: 1_000_000)
        )
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let newStoryPost = Self.makeStoryAPIPost(
            id: "new-author-story",
            content: "From new author",
            authorId: "author-2",
            authorUsername: "bob",
            createdAt: "2026-12-01T12:00:00.000Z"
        )
        mockSocket.storyCreated.send(newStoryPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2, "New author should create a new group")
        XCTAssertEqual(
            sut.storyGroups[0].id, "author-2",
            "Bob's group sits at index 0 because his latest story (Dec 2026) is more recent than alice's (Jan 1970)"
        )
    }

    func test_socketStoryCreated_deduplicatesExistingStory() async {
        let existingItem = makeStoryItem(id: "dup-story")
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let duplicatePost = Self.makeStoryAPIPost(
            id: "dup-story",
            authorId: "author-1",
            authorUsername: "alice"
        )
        mockSocket.storyCreated.send(duplicatePost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups[0].stories.count, 1, "Duplicate story should not be added")
    }

    // MARK: - socket storyUpdated tests

    func test_socketStoryUpdated_preservesLocalViewedState() async {
        // Local-first : la story s1 a été vue localement (markViewed optimiste,
        // fire-and-forget). Un event story:updated (ex: bump de reactionCount)
        // arrive avec isViewedByMe absent (→ false, serveur pas encore synchronisé).
        // L'anneau « vu » ne doit PAS reverter — viewed est monotone.
        let viewed = makeStoryItem(id: "s1", isViewed: true)
        let group = makeStoryGroup(userId: "u1", username: "alice", stories: [viewed])
        sut.storyGroups = [group]

        sut.subscribeToSocketEvents()

        let event: SocketStoryUpdatedData = JSONStub.decode("""
        {"story":{"id":"s1","type":"STORY","content":"reaction bump","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"u1","username":"alice"}}}
        """)
        mockSocket.storyUpdated.send(event)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(
            sut.storyGroups[0].stories[0].isViewed,
            "story:updated avec isViewedByMe stale ne doit pas reverter l'état vu local (monotone)"
        )
    }

    func test_socketStoryViewed_appliesAuthoritativeViewCount() async {
        // L'event story:viewed porte le viewCount autoritatif. Avant le fix il était
        // ignoré → le compteur de vues (StoryViewerView lit currentStory?.viewCount)
        // restait stale chez l'auteur pendant que des viewers arrivent en temps réel.
        let item = makeStoryItem(id: "v1")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.subscribeToSocketEvents()

        let event: SocketStoryViewedData = JSONStub.decode("""
        {"storyId":"v1","viewerId":"viewer","viewerUsername":"bob","viewCount":9}
        """)
        mockSocket.storyViewed.send(event)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups[0].stories[0].viewCount, 9,
                       "le viewCount realtime autoritatif doit être appliqué au temps réel")
    }

    func test_socketCommentDeleted_appliesAuthoritativeCommentCount() async {
        // comment:deleted porte le commentCount autoritatif (comme comment:added).
        // Avant le fix, le sink faisait `-1` → dérive sur events manqués/hors-ordre +
        // asymétrie avec commentAdded. Ici la story a 5 commentaires, l'event annonce 3
        // (suppression concurrente de 2) → on doit afficher 3, pas 4 (= 5-1).
        let item = StoryItem(id: "c1", commentCount: 5)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.subscribeToSocketEvents()

        let event: SocketCommentDeletedData = JSONStub.decode("""
        {"postId":"c1","commentId":"cm9","commentCount":3}
        """)
        mockSocket.commentDeleted.send(event)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups[0].stories[0].commentCount, 3,
                       "comment:deleted doit appliquer le commentCount autoritatif (pas un -1 qui dérive)")
    }

    // MARK: - didReconnect Tests (rts-02)

    /// Après un flap réseau, des stories ont pu être créées/supprimées pendant
    /// la coupure : le reconnect social doit rattraper le tray par un delta
    /// depuis le curseur max(updatedAt) des stories affichées.
    func test_didReconnect_fetchesStoriesDeltaFromTrayCursor() async {
        let t1 = Date(timeIntervalSinceNow: -600)
        let t2 = Date(timeIntervalSinceNow: -300)
        sut.storyGroups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1", updatedAt: t1)]),
            makeStoryGroup(userId: "u2", stories: [makeStoryItem(id: "s2", updatedAt: t2)]),
        ]
        mockStoryService.listResult = .success(Self.makeDeltaResponse())
        sut.subscribeToSocketEvents()

        mockSocket.didReconnect.send(())
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(mockStoryService.listCallCount, 1,
                       "le reconnect social déclenche un fetch stories")
        XCTAssertEqual(mockStoryService.lastListUpdatedSince, t2,
                       "le curseur delta = max(updatedAt) du tray, calculé au moment de l'événement")
    }

    /// Un fetch déjà en vol ne doit pas être doublé par le reconnect.
    func test_didReconnect_whileLoading_skipsFetch() async {
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1", updatedAt: Date())])]
        sut.isLoading = true
        sut.subscribeToSocketEvents()

        mockSocket.didReconnect.send(())
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(mockStoryService.listCallCount, 0,
                       "un chargement en vol absorbe le rattrapage du reconnect")
    }

    /// Vérifie le CÂBLAGE didReconnect → fetchStoriesFromNetwork : la purge
    /// par tombstones est une logique existante déjà testée par ailleurs.
    func test_didReconnect_deltaWithTombstones_purgesDeletedStories() async {
        let kept = makeStoryItem(id: "s1", updatedAt: Date())
        let deleted = makeStoryItem(id: "s2", updatedAt: Date())
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [kept, deleted])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s2"]))
        sut.subscribeToSocketEvents()

        mockSocket.didReconnect.send(())
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"],
                       "la story tombstonée pendant la coupure sort du tray au reconnect")
    }

    // MARK: - Realtime story reactions (it.23 — story:reacted/unreacted wiring)

    func test_applyStoryReactionDelta_reacted_incrementsCount() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 2
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]

        sut.applyStoryReactionDelta(storyId: "react-me", userId: "other", emoji: "❤️", delta: +1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 3,
                       "story:reacted doit +1 le compteur en temps réel")
    }

    func test_applyStoryReactionDelta_unreacted_decrementsCount() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 2
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]

        sut.applyStoryReactionDelta(storyId: "react-me", userId: "other", emoji: "❤️", delta: -1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 1,
                       "story:unreacted doit -1 le compteur en temps réel")
    }

    func test_applyStoryReactionDelta_clampsAtZero() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 0
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]

        sut.applyStoryReactionDelta(storyId: "react-me", userId: "other", emoji: "❤️", delta: -1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 0,
                       "le compteur ne descend jamais sous 0")
    }

    func test_storyUnreacted_socketEvent_decrementsCount() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 3
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]
        sut.subscribeToSocketEvents()  // câble les sinks (la View l'appelle au onAppear)

        // Vérifie le câblage complet : sink `storyUnreacted` → applyStoryReactionDelta.
        let exp = expectation(description: "story:unreacted applied")
        mockSocket.storyUnreacted.send(
            SocketStoryUnreactedData(storyId: "react-me", userId: "other", emoji: "❤️"))
        DispatchQueue.main.async { exp.fulfill() }  // après le hop receive(on:.main) du sink
        wait(for: [exp], timeout: 1.0)

        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 2,
                       "le sink story:unreacted doit décrémenter via applyStoryReactionDelta")
    }
}
