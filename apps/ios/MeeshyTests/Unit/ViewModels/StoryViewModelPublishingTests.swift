import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// `StoryViewModel` — la PUBLICATION : en arrière-plan, en file hors ligne,
/// rejouée au retour du réseau, annulée en attente.
@MainActor
final class StoryViewModelPublishingTests: StoryViewModelTestCase {

    // MARK: - #10331 — annuler l'envoi d'une story en attente

    func test_cancelWaitingPublication_removed_dropsItsOptimisticStoriesFromTheTray() async {
        let item = StoryPublishQueueItem(visibility: "FRIENDS", slidesPayload: Data("[]".utf8), mediaReferences: [])
        let kept = makeStoryItem(id: "s1")
        let pending = makeStoryItem(id: "\(item.tempStoryId)#0")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [kept, pending])]

        await StoryWaitingCancellation.run(item, on: sut) { _ in .removed }

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"], "la story annulée quitte le tray")
    }

    func test_cancelWaitingPublication_inFlight_keepsItsOptimisticStories() async {
        let item = StoryPublishQueueItem(visibility: "FRIENDS", slidesPayload: Data("[]".utf8), mediaReferences: [])
        let pending = makeStoryItem(id: "\(item.tempStoryId)#0")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [pending])]

        await StoryWaitingCancellation.run(item, on: sut) { _ in .inFlight }

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), [pending.id], "elle part : rien ne disparaît")
    }

    // MARK: - #15198 — le lecteur annule une story en attente par la file

    func test_cancelFromViewer_pendingStory_cancelsItsQueueItem_withoutAnyDelete() async {
        let other = StoryPublishQueueItem(visibility: "FRIENDS", slidesPayload: Data("[]".utf8), mediaReferences: [])
        let item = StoryPublishQueueItem(visibility: "FRIENDS", slidesPayload: Data("[]".utf8), mediaReferences: [])
        let pending = makeStoryItem(id: "\(item.tempStoryId)#1")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1"), pending])]
        var cancelled: [String] = []

        let removed = await StoryWaitingCancellation.run(storyId: pending.id, queued: [other, item], on: sut) {
            cancelled.append($0.id)
            return .removed
        }

        XCTAssertTrue(removed)
        XCTAssertEqual(cancelled, [item.id], "la file annule l'item de CETTE story")
        XCTAssertEqual(mockStoryService.deleteCallCount, 0, "aucun DELETE ne porte un id local")
        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"])
    }

    func test_cancelFromViewer_storyNoLongerQueued_callsNothingAndKeepsTheTray() async {
        let pending = makeStoryItem(id: "\(PendingStoryMarker.prefix)\(UUID().uuidString)#0")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [pending])]
        var cancelCalls = 0

        let removed = await StoryWaitingCancellation.run(storyId: pending.id, queued: [], on: sut) { _ in
            cancelCalls += 1
            return .removed
        }

        XCTAssertFalse(removed)
        XCTAssertEqual(cancelCalls, 0)
        XCTAssertEqual(mockStoryService.deleteCallCount, 0)
        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), [pending.id])
    }

    func test_deltaRefresh_purgesStoryReportedDeletedByServer() async {
        let kept = makeStoryItem(id: "s1")
        let deleted = makeStoryItem(id: "s2")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [kept, deleted])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s2"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"])
    }

    func test_deltaRefresh_dropsGroupEmptiedByDeletion() async {
        sut.storyGroups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")]),
            makeStoryGroup(userId: "u2", username: "bob", stories: [makeStoryItem(id: "s2")])
        ]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s1"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.map(\.id), ["u2"])
    }

    func test_deltaRefresh_purgesExpiredStory() async {
        // Le serveur balaie les périmées toutes les heures seulement : le client
        // ne doit pas attendre son passage pour cesser d'afficher une bulle morte.
        let expired = makeStoryItem(id: "old", createdAt: Date().addingTimeInterval(-90_000))
        let fresh = makeStoryItem(id: "new")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [expired, fresh])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse())

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["new"])
    }

    func test_deltaRefresh_healthyTrayIsLeftIntact() async {
        // Garde-fou : la purge ne doit toucher QUE ce qui est mort.
        sut.storyGroups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")]),
            makeStoryGroup(userId: "u2", username: "bob", stories: [makeStoryItem(id: "s2")])
        ]
        mockStoryService.listResult = .success(Self.makeDeltaResponse())

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.flatMap { $0.stories.map(\.id) }.sorted(), ["s1", "s2"])
    }

    func test_deltaRefresh_evictsPurgedStoryFromTheByIdCache() async {
        // Ce cache sert les deep-links AVANT le réseau : y laisser la story
        // purgée la ferait réapparaître au premier tap de notification.
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1"), makeStoryItem(id: "s2")])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s1"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertTrue(mockStoryService.invalidatedPostIds.contains("s1"))
        XCTAssertFalse(mockStoryService.invalidatedPostIds.contains("s2"))
    }

    func test_deltaRefresh_ignoresDeletedIdsAbsentFromTray() async {
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["never-had-it"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"])
    }

    // MARK: - R5 offline replay : pin plan + wiring

    func test_pinTargets_routesMediaByType() {
        let story = makeMediaStoryItem()

        let targets = StoryViewModel.pinTargets(for: story)

        XCTAssertEqual(targets.count, 3)
        XCTAssertEqual(targets.first(where: { $0.urlString == "https://cdn.test/clip.mp4" })?.store, .video)
        XCTAssertEqual(targets.first(where: { $0.urlString == "https://cdn.test/voice.m4a" })?.store, .audio)
        XCTAssertEqual(targets.first(where: { $0.urlString == "https://cdn.test/photo.jpg" })?.store, .images,
                       "Images (and unknown types) route to the images store, mirroring the prefetch path")
    }

    func test_pinTargets_contradictoryDeclaredType_sniffedByExtension() {
        // R7 — un mp4 déclaré image doit être pinné dans le store video
        // (là où prefetch/lecture le rangent réellement).
        let media = [FeedMedia(id: "m-x", type: .image, url: "https://cdn.test/really-a-video.mp4")]
        let story = StoryItem(
            id: "pin-sniff", content: nil, media: media, storyEffects: nil,
            createdAt: Date(), expiresAt: Date().addingTimeInterval(3600), isViewed: false
        )

        let targets = StoryViewModel.pinTargets(for: story)

        XCTAssertEqual(targets.first(where: { $0.urlString.hasSuffix(".mp4") })?.store, .video)
    }

    func test_pinDeadline_usesStoryExpiry() {
        let expiry = Date().addingTimeInterval(1234)
        let story = makeMediaStoryItem(expiresAt: expiry)

        XCTAssertEqual(StoryViewModel.pinDeadline(for: story), expiry,
                       "The pin must not outlive the story")
    }

    func test_markViewed_pinsViewedStoryMediaUntilExpiry() async {
        let unique = UUID().uuidString
        let videoURL = "https://cdn.test/\(unique).mp4"
        let story = makeMediaStoryItem(id: "pin-wiring", videoURL: videoURL,
                                       audioURL: nil, imageURL: nil)
        let group = makeStoryGroup(userId: "u1", stories: [story])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "pin-wiring")

        // The pin runs in a fire-and-forget Task — give it time to land.
        try? await Task.sleep(nanoseconds: 200_000_000)

        let pinned = await CacheCoordinator.shared.video.isPinned(videoURL)
        XCTAssertTrue(pinned, "Viewing a story must pin its media for offline replay until expiry")
    }

    func test_offlineReplay_viewedStory_mediaResolvesFromDiskThroughViewerKeys() async {
        // R5(c) — contrat d'intégration de la relecture offline. L'ÉCRITURE
        // (prefetch/pin) travaille avec la clé BRUTE `FeedMedia.url` ; la
        // LECTURE (StoryViewerView.mediaIndex) reconstruit la clé via
        // `URL(string: raw).absoluteString` puis les layers résolvent en
        // DISK-ONLY (`videoLocalFileURL` / `imageLocalFileURL` /
        // `audioLocalFileURL` — zéro réseau par construction). Toute
        // divergence de chaîne ou de store entre les deux bouts casserait la
        // relecture offline en silence : ce test dérive chaque clé
        // indépendamment et exige le disk-hit + le pin sous la clé VIEWER.
        let unique = UUID().uuidString
        let rawVideo = "https://cdn.test/\(unique)/clip.mp4"
        let rawAudio = "https://cdn.test/\(unique)/voice.m4a"
        let rawImage = "https://cdn.test/\(unique)/photo.jpg"
        let story = makeMediaStoryItem(id: "offline-replay", videoURL: rawVideo,
                                       audioURL: rawAudio, imageURL: rawImage)
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [story])]

        let payload = Data("offline-replay-bytes".utf8)
        await CacheCoordinator.shared.video.save(payload, for: rawVideo)
        await CacheCoordinator.shared.audio.save(payload, for: rawAudio)
        await CacheCoordinator.shared.images.save(payload, for: rawImage)

        sut.markViewed(storyId: "offline-replay")
        try? await Task.sleep(nanoseconds: 200_000_000)

        guard let viewerVideoKey = URL(string: rawVideo)?.absoluteString,
              let viewerAudioKey = URL(string: rawAudio)?.absoluteString,
              let viewerImageKey = URL(string: rawImage)?.absoluteString else {
            return XCTFail("Fixture URLs must parse — the viewer would drop them from mediaIndex")
        }

        XCTAssertNotNil(CacheCoordinator.videoLocalFileURL(for: viewerVideoKey),
                        "Video bg must replay from disk (StoryBackgroundLayer path) without network")
        XCTAssertNotNil(CacheCoordinator.audioLocalFileURL(for: viewerAudioKey),
                        "Audio must replay from disk (ReaderAudioMixer path) without network")
        XCTAssertNotNil(CacheCoordinator.imageLocalFileURL(for: viewerImageKey),
                        "Image bg must replay from disk (loadImage disk-hit) without network")

        let videoPinned = await CacheCoordinator.shared.video.isPinned(viewerVideoKey)
        let audioPinned = await CacheCoordinator.shared.audio.isPinned(viewerAudioKey)
        let imagePinned = await CacheCoordinator.shared.images.isPinned(viewerImageKey)
        XCTAssertTrue(videoPinned, "The viewer's video key must be pinned against eviction")
        XCTAssertTrue(audioPinned, "The viewer's audio key must be pinned against eviction")
        XCTAssertTrue(imagePinned, "The viewer's image key must be pinned against eviction")
    }

    // MARK: - Background Publishing

    func test_publishStoryInBackground_setsActiveUpload() async throws {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertNotNil(sut.activeUpload)
        let id = try XCTUnwrap(sut.activeUpload?.id)
        XCTAssertEqual(sut.uploadProgress.fraction(for: id), 0)
    }

    func test_publishStoryInBackground_closesComposer() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        sut.showStoryComposer = true

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertFalse(sut.showStoryComposer)
    }

    /// C5 — composer une 2e story pendant qu'une monte n'est plus interdit.
    /// L'ancien `test_publishStoryInBackground_blocksSecondPublish` verrouillait
    /// exactement le rejet silencieux que ce lot supprime.
    func test_publishStoryInBackground_secondPublishDuringUpload_isStackedNotDropped() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )
        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertEqual(sut.activeUploads.count, 2, "La 2e publication est empilée, pas rejetée")
        XCTAssertEqual(Set(sut.activeUploads.map(\.id)).count, 2, "Deux entrées distinctes")
    }

    /// Synchrone après les deux taps : l'invariant « une seule monte à la fois »
    /// est pinné par `StoryUploadQueueTests` (qui suspend le 1er upload) ; ici
    /// on ne vérifie que l'état de NAISSANCE des entrées.
    func test_publishStoryInBackground_secondPublish_bothEntriesStartPreparing() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()], slideImages: [:], loadedImages: [:], loadedVideoURLs: [:]
        )
        sut.publishStoryInBackground(
            slides: [StorySlide()], slideImages: [:], loadedImages: [:], loadedVideoURLs: [:]
        )

        // Les deux entrées naissent `.preparing` : leur intent write-ahead
        // n'est pas encore durable, aucune n'est drainable.
        XCTAssertEqual(sut.activeUploads.filter { $0.phase == .preparing }.count, 2)
    }

    func test_cancelUpload_clearsActiveUpload() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        guard let uploadId = sut.activeUpload?.id else {
            XCTFail("publishStoryInBackground doit créer une entrée active")
            return
        }
        sut.cancelUpload(id: uploadId)
        XCTAssertNil(sut.activeUpload)
    }

    // MARK: - Publish Story Tests (Point 84)

    func test_publishStory_multiSlides_callsService() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "multi-slide-story"))

        sut.publishStoryInBackground(
            slides: [StorySlide(), StorySlide(), StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertNotNil(sut.activeUpload, "Should start an upload for multi-slide story")
        XCTAssertFalse(sut.showStoryComposer, "Composer should close when publishing starts")
    }

    // MARK: - executeQueuedPublish() Tests (V3 reconstruction)

    /// Exercises the queue-driven (headless) story upload path. Pure model
    /// + mock-service tests; the TUS network branches in `runStoryUpload`
    /// only fire when slides include local media, so the success-path
    /// tests use text-only slides and validate the post-creation hops.
    func test_executeQueuedPublish_corruptPayload_throwsUnrecoverable() async {
        mockAPI.authToken = "test-token"
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("not valid json".utf8),
            mediaReferences: []
        )

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED — terminal failure, queue should drop the item
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
        XCTAssertEqual(mockPostService.createStoryCallCount, 0)
    }

    func test_executeQueuedPublish_emptySlides_throwsUnrecoverable() async {
        mockAPI.authToken = "test-token"
        let item = try? Self.makeQueueItem(slides: [])
        XCTAssertNotNil(item)

        do {
            _ = try await sut.executeQueuedPublish(item: item!)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
        XCTAssertEqual(mockPostService.createStoryCallCount, 0)
    }

    func test_executeQueuedPublish_missingMediaFile_throwsUnrecoverable() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeTextOnlySlide()
        let bogusRef = StoryMediaReference(
            elementId: "slide-bg-\(slide.id)",
            mediaType: "image",
            localFilePath: "/tmp/this-file-does-not-exist-\(UUID().uuidString).jpg"
        )
        let item = try Self.makeQueueItem(slides: [slide], mediaReferences: [bogusRef])

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
        XCTAssertEqual(mockPostService.createStoryCallCount, 0)
    }

    func test_executeQueuedPublish_unknownMediaType_throwsUnrecoverable() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeTextOnlySlide()
        // Real temp file so the existence check passes — failure should
        // come from the dispatch on `mediaType`, not the missing-file guard.
        let tempPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-\(UUID().uuidString).bin").path
        FileManager.default.createFile(atPath: tempPath, contents: Data())
        defer { try? FileManager.default.removeItem(atPath: tempPath) }

        let strangeRef = StoryMediaReference(
            elementId: "weird",
            mediaType: "hologram",
            localFilePath: tempPath
        )
        let item = try Self.makeQueueItem(slides: [slide], mediaReferences: [strangeRef])

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
    }

    /// P2 — a foreground media object declared in the slide's effects but with
    /// no matching entry in `loadedImages`/`loadedVideoURLs` (composer/state
    /// desync — e.g. the queue replay has no `StoryMediaReference` for it)
    /// used to be silently dropped: neither the `.video` nor `.image` branch
    /// of the upload loop matched, no log fired, and the layer would simply
    /// never render for any viewer. Symmetrical with the audio branch (which
    /// already logs `"clip will be uploaded but unplayable"` on the same kind
    /// of miss): the publish must still succeed, just without that one layer.
    func test_executeQueuedPublish_mediaObjectWithoutLoadedAsset_skipsWithoutThrowing() async throws {
        mockAPI.authToken = "test-token"
        let orphanMedia = StoryMediaObject(
            id: "orphan-1",
            mediaType: "image",
            aspectRatio: 1.0
        )
        let slide = StorySlide(
            id: UUID().uuidString,
            content: "Text with a dangling media ref",
            effects: StoryEffects(mediaObjects: [orphanMedia]),
            duration: 5,
            order: 0
        )
        // No `StoryMediaReference` for "orphan-1" — `loadedImages` stays empty.
        let item = try Self.makeQueueItem(slides: [slide])
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-orphan-media", content: slide.content, authorId: "a1", authorUsername: "alice"
        ))

        let result = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(result, "post-orphan-media",
            "A media object without a loaded asset must be skipped, not crash the whole publish")
        XCTAssertEqual(mockPostService.createStoryCallCount, 1)
    }

    func test_executeQueuedPublish_textOnlySingleSlide_returnsLastPostId() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeTextOnlySlide(content: "First story ever")
        let item = try Self.makeQueueItem(slides: [slide])
        let serverId = "post-server-\(UUID().uuidString)"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: serverId, content: "First story ever",
            authorId: "a1", authorUsername: "alice"
        ))

        let result = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(result, serverId,
            "executeQueuedPublish should return the server-assigned post id")
        XCTAssertEqual(mockPostService.createStoryCallCount, 1)
    }

    func test_executeQueuedPublish_textOnlyMultiSlide_returnsLastPostId() async throws {
        mockAPI.authToken = "test-token"
        let slides = [
            Self.makeTextOnlySlide(content: "Slide 1"),
            Self.makeTextOnlySlide(content: "Slide 2"),
            Self.makeTextOnlySlide(content: "Slide 3")
        ]
        let item = try Self.makeQueueItem(slides: slides)
        // Mock returns the same stub id for every call; we validate the
        // call count, not the id-per-call mapping (mock isn't queue-aware).
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-stub", content: "stub", authorId: "a1", authorUsername: "alice"
        ))

        let result = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(result, "post-stub")
        XCTAssertEqual(mockPostService.createStoryCallCount, 3,
            "createStory should be called once per slide")
    }

    func test_executeQueuedPublish_doesNotMutate_activeUpload() async throws {
        mockAPI.authToken = "test-token"
        XCTAssertNil(sut.activeUpload, "Precondition: no active upload")
        let item = try Self.makeQueueItem(slides: [Self.makeTextOnlySlide()])
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-1", content: "stub", authorId: "a1", authorUsername: "alice"
        ))

        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertNil(sut.activeUpload,
            "Queue path must not touch activeUpload (no banner side-effects)")
    }

    func test_executeQueuedPublish_createStoryFailure_throwsRetryable() async throws {
        mockAPI.authToken = "test-token"
        let item = try Self.makeQueueItem(slides: [Self.makeTextOnlySlide()])
        mockPostService.createStoryResult = .failure(
            APIError.networkError(URLError(.timedOut))
        )

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            XCTFail("Network errors should remain retryable, not unrecoverable")
        } catch {
            // EXPECTED — any non-Unrecoverable error bubbles so the queue
            // schedules a retry per its exponential backoff policy.
        }
    }

    // MARK: - executeQueuedPublish() Cleanup

    func test_executeQueuedPublish_cleansUpMediaReferences_onSuccess() async throws {
        mockAPI.authToken = "test-token"
        // Create a real temp file so loadMediaFromReferences can resolve it,
        // and we can later assert it was removed.
        let tempPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-cleanup-\(UUID().uuidString).bin").path
        FileManager.default.createFile(atPath: tempPath, contents: Data())
        XCTAssertTrue(FileManager.default.fileExists(atPath: tempPath),
            "Precondition: temp file exists")

        // The reference uses "video" so `loadMediaFromReferences` does NOT
        // attempt to decode it as an image (would fail on empty Data). Only
        // the file path is plumbed; runStoryUpload skips video upload when
        // there is no matching mediaObject in the slide effects.
        let ref = StoryMediaReference(
            elementId: "elt-\(UUID().uuidString)",
            mediaType: "video",
            localFilePath: tempPath
        )
        let item = try Self.makeQueueItem(
            slides: [Self.makeTextOnlySlide()],
            mediaReferences: [ref]
        )
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-1", content: "stub", authorId: "a1", authorUsername: "alice"
        ))

        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertFalse(FileManager.default.fileExists(atPath: tempPath),
            "Persisted draft media file should be deleted after successful publish")
    }

    // MARK: - enqueueStoryForOfflinePublish() Tests

    func test_enqueueStoryForOfflinePublish_addsItemToQueue() async throws {
        // Reset the queue so the count assertion is deterministic.
        await StoryPublishQueue.shared.clearAll()
        let initialCount = await StoryPublishQueue.shared.count
        XCTAssertEqual(initialCount, 0, "Precondition: queue is empty")

        let slide = Self.makeTextOnlySlide(content: "Offline story")

        await sut.enqueueStoryForOfflinePublish(
            slides: [slide],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            visibility: "PUBLIC",
            visibilityUserIds: []
        )

        let count = await StoryPublishQueue.shared.count
        XCTAssertEqual(count, 1, "Queue should hold the enqueued item")

        let items = await StoryPublishQueue.shared.pendingItems
        XCTAssertEqual(items.first?.visibility, "PUBLIC")
        XCTAssertNil(items.first?.repostOfId)

        // Cleanup so unrelated tests don't see this item.
        await StoryPublishQueue.shared.clearAll()
    }

    func test_enqueueStoryForOfflinePublish_doesNotMutate_activeUpload() async {
        await StoryPublishQueue.shared.clearAll()
        XCTAssertNil(sut.activeUpload, "Precondition: no active upload")

        await sut.enqueueStoryForOfflinePublish(
            slides: [Self.makeTextOnlySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            visibility: "PUBLIC",
            visibilityUserIds: []
        )

        XCTAssertNil(sut.activeUpload,
            "Offline path must not touch activeUpload (no banner side-effect)")

        await StoryPublishQueue.shared.clearAll()
    }

    // MARK: - F3 — originalLanguage forwarded on the publish entry points (Prisme)

    /// The offline enqueue entry point must STAMP the resolved source language
    /// onto the persisted `StoryPublishQueueItem` so the gateway routes NLLB-200
    /// on flush. Pre-WS5.1 this argument was hardcoded `nil` (Prisme regression):
    /// a non-nil `originalLanguage` here must survive into the queue.
    func test_enqueueStoryForOfflinePublish_forwardsOriginalLanguage() async throws {
        await StoryPublishQueue.shared.clearAll()

        await sut.enqueueStoryForOfflinePublish(
            slides: [Self.makeTextOnlySlide(content: "Hallo")],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            originalLanguage: "de",
            visibility: "PUBLIC",
            visibilityUserIds: []
        )

        let items = await StoryPublishQueue.shared.pendingItems
        XCTAssertEqual(items.first?.originalLanguage, "de",
                       "the resolved source language must be persisted onto the queue item")

        await StoryPublishQueue.shared.clearAll()
    }

    /// The queued-REPLAY entry point (`executeQueuedPublish`) must thread the
    /// item's persisted `originalLanguage` into the `createStory` call. This is
    /// the previously-buggy path (hardcoded nil before WS5.1) and has no other
    /// app-side coverage — a missed argument here would silently drop the source
    /// language on every offline story that flushes after reconnect.
    func test_executeQueuedPublish_forwardsOriginalLanguageToCreateStory() async throws {
        mockAPI.authToken = "test-token"
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode([Self.makeTextOnlySlide(content: "Hej")])
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: payload,
            originalLanguage: "sv"
        )
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-sv", content: "Hej", authorId: "a1", authorUsername: "alice"
        ))

        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(mockPostService.lastCreateStoryOriginalLanguage, "sv",
                       "the queued item's originalLanguage must reach createStory on replay")
    }

    // MARK: - Offline optimistic visibility (P4 — voir ses stories hors-ligne)

    func test_optimisticStoryId_isTempIdScopedAndIndexed() {
        XCTAssertEqual(StoryViewModel.optimisticStoryId(tempStoryId: "pending_abc", slideIndex: 0),
                       "pending_abc#0")
        XCTAssertEqual(StoryViewModel.optimisticStoryId(tempStoryId: "pending_abc", slideIndex: 2),
                       "pending_abc#2")
        // Préfixé par le tempStoryId → retrait par préfixe possible.
        XCTAssertTrue(StoryViewModel.optimisticStoryId(tempStoryId: "pending_abc", slideIndex: 1)
            .hasPrefix("pending_abc#"))
    }

    func test_removeOptimisticStories_removesPendingKeepsPublished() {
        let pending0 = makeStoryItem(id: "pending_x#0")
        let pending1 = makeStoryItem(id: "pending_x#1")
        let published = makeStoryItem(id: "server-real-id")
        sut.storyGroups = [makeStoryGroup(userId: "me", stories: [published, pending0, pending1])]

        sut.removeOptimisticStories(tempStoryId: "pending_x")

        XCTAssertEqual(sut.storyGroups.count, 1)
        XCTAssertEqual(sut.storyGroups[0].stories.map(\.id), ["server-real-id"],
                       "seuls les placeholders pending_x#* sont retirés, la vraie story reste")
    }

    func test_removeOptimisticStories_removesGroupWhenAllPending() {
        let pending0 = makeStoryItem(id: "pending_y#0")
        sut.storyGroups = [makeStoryGroup(userId: "me", stories: [pending0])]

        sut.removeOptimisticStories(tempStoryId: "pending_y")

        XCTAssertTrue(sut.storyGroups.isEmpty,
                      "un groupe ne contenant que des pending devient vide → retiré")
    }

    func test_removeOptimisticStories_unrelatedTempId_isNoOp() {
        let pending0 = makeStoryItem(id: "pending_x#0")
        sut.storyGroups = [makeStoryGroup(userId: "me", stories: [pending0])]

        sut.removeOptimisticStories(tempStoryId: "pending_OTHER")

        XCTAssertEqual(sut.storyGroups[0].stories.map(\.id), ["pending_x#0"],
                       "un tempId sans correspondance ne touche à rien")
    }

    func test_insertOptimisticOfflineStories_insertsUnderCurrentUserAsViewed() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")
        sut.storyGroups = []

        sut.insertOptimisticOfflineStories(
            slides: [Self.makeTextOnlySlide(id: "slide-a", content: "Bonjour"),
                     Self.makeTextOnlySlide(id: "slide-b", content: "Coucou")],
            slideImages: [:],
            loadedImages: [:],
            tempStoryId: "pending_z",
            visibility: "PUBLIC"
        )

        XCTAssertEqual(sut.storyGroups.count, 1, "groupe créé pour l'auteur")
        XCTAssertEqual(sut.storyGroups[0].id, "me-id")
        let ids = sut.storyGroups[0].stories.map(\.id)
        XCTAssertTrue(ids.contains("pending_z#0") && ids.contains("pending_z#1"),
                      "une story optimiste par slide, id préfixé par le tempStoryId")
        XCTAssertTrue(sut.storyGroups[0].stories.allSatisfy { $0.isViewed },
                      "ses propres stories sont marquées vues (pas d'anneau non-lu sur soi-même)")
    }

    func test_insertOptimisticOfflineStories_noCurrentUser_isNoOp() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = nil
        sut.storyGroups = []

        sut.insertOptimisticOfflineStories(
            slides: [Self.makeTextOnlySlide()],
            slideImages: [:], loadedImages: [:],
            tempStoryId: "pending_z", visibility: "PUBLIC"
        )

        XCTAssertTrue(sut.storyGroups.isEmpty, "sans utilisateur courant, aucune insertion")
    }
}
