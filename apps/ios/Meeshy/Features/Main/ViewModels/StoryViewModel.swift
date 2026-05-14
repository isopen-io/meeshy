import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

@MainActor
class StoryViewModel: ObservableObject, StoryPublishExecutor {
    @Published var storyGroups: [StoryGroup] = []
    @Published var isLoading = false
    @Published var isPublishing = false
    @Published var publishError: String?
    @Published var showStoryComposer = false
    @Published var activeUpload: StoryUploadState?
    private var uploadTask: Task<Void, Never>?

    private let storyService: StoryServiceProviding
    private let postService: PostServiceProviding
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let api: APIClientProviding

    init(
        storyService: StoryServiceProviding = StoryService.shared,
        postService: PostServiceProviding = PostService.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared
    ) {
        self.storyService = storyService
        self.postService = postService
        self.socialSocket = socialSocket
        self.api = api
        observeReconnectionForRetry()
    }

    // MARK: - StoryPublishExecutor conformance (Pilier 22 V3)

    /// Reconstructs an upload from a queue item and runs it to completion.
    /// Called by `StoryPublishService` when the queue dequeues an item
    /// (offline → online transition, app cold start with pending items, ...).
    ///
    /// Decodes the queued payload, materializes the local media files, and
    /// drives the shared `runStoryUpload` pipeline to completion. Headless:
    /// no UI mutations on `activeUpload` so the queue path can run from
    /// cold start without ghost banners. Returns the server-assigned post
    /// id of the LAST published slide (the one the queue uses to reconcile
    /// the optimistic `pending_<uuid>` row).
    ///
    /// Error contract :
    /// - `StoryPublishUnrecoverableError` for terminal failures (corrupt
    ///   payload, missing/corrupt media, empty slides, server 4xx) so the
    ///   queue drops the item instead of looping.
    /// - any other `Error` (network, 5xx, TUS resume failure) → retryable.
    func executeQueuedPublish(item: StoryPublishQueueItem) async throws -> String {
        Logger.media.info(
            "executeQueuedPublish start tempId=\(item.tempStoryId, privacy: .public)"
        )

        let slides: [StorySlide]
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            slides = try decoder.decode([StorySlide].self, from: item.slidesPayload)
        } catch {
            throw StoryPublishUnrecoverableError("Invalid slidesPayload: \(error.localizedDescription)")
        }
        guard !slides.isEmpty else {
            throw StoryPublishUnrecoverableError("Empty slides")
        }

        let media = try loadMediaFromReferences(item.mediaReferences)

        let user = AuthManager.shared.currentUser
        let upload = StoryUploadState(
            id: item.tempStoryId,
            thumbnailImage: media.slideImages.values.first?
                .preparingThumbnail(of: CGSize(width: 100, height: 178)) ?? UIImage(),
            progress: 0,
            phase: .uploading,
            authorId: user?.id ?? "",
            authorName: user?.displayName ?? user?.username ?? "",
            authorAvatar: user?.avatar,
            slides: slides,
            slideImages: media.slideImages,
            loadedImages: media.loadedImages,
            loadedVideoURLs: media.loadedVideoURLs,
            loadedAudioURLs: media.loadedAudioURLs,
            originalLanguage: nil,
            visibility: item.visibility
        )

        let ids = try await runStoryUpload(
            upload,
            onProgress: { _ in },
            onPhase: { _ in },
            onPublishedSlide: { _ in }
        )

        cleanupUploadTempFiles(upload)

        // Best-effort cleanup of the persisted draft media now that the
        // server holds the canonical posts.
        for ref in item.mediaReferences {
            try? FileManager.default.removeItem(atPath: ref.localFilePath)
        }
        
        // Also remove the containing directory if it was an offline queue folder
        if let firstPath = item.mediaReferences.first?.localFilePath {
            let dirPath = (firstPath as NSString).deletingLastPathComponent
            if dirPath.hasSuffix(item.tempStoryId) {
                try? FileManager.default.removeItem(atPath: dirPath)
            }
        }

        guard let last = ids.last else {
            throw StoryPublishUnrecoverableError("Upload returned no post ids")
        }
        Logger.media.info(
            "executeQueuedPublish done tempId=\(item.tempStoryId, privacy: .public) → \(last, privacy: .public)"
        )
        return last
    }

    // MARK: - Auto-retry on reconnect (SOTA audit Pilier 22, scope A)

    /// When the message socket reconnects after a drop, automatically retry
    /// any active upload that failed mid-flight. Manual retry via the upload
    /// banner remains available; this just removes the friction of having
    /// to tap retry yourself when the network comes back.
    ///
    /// Note: this only handles uploads still in `activeUpload` (process is
    /// alive). Cross-restart resume is the StoryPublishQueue scope (V2).
    private func observeReconnectionForRetry() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                Task { @MainActor in
                    // Wait a bit so the connection stabilizes and any in-flight
                    // request has a chance to complete first.
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    if case .failed = self.activeUpload?.phase {
                        self.retryUpload()
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Background Upload State

    struct StoryUploadState: Identifiable {
        let id: String
        let thumbnailImage: UIImage
        var progress: Double
        var phase: UploadPhase

        let authorId: String
        let authorName: String
        let authorAvatar: String?

        let slides: [StorySlide]
        let slideImages: [String: UIImage]
        let loadedImages: [String: UIImage]
        let loadedVideoURLs: [String: URL]
        let loadedAudioURLs: [String: URL]
        let originalLanguage: String?
        let visibility: String
        /// IDs of slide-Posts already created server-side. Tracked so that:
        /// (a) `retryUpload()` skips them (otherwise a partial-failure retry creates
        ///     duplicate slides — what was previously committed plus the same again),
        /// (b) `cancelUpload()` can DELETE them (otherwise a 5-slide story that
        ///     fails at slide 3 leaves slides 1-2 visible to friends as orphans).
        var publishedPostIds: [String] = []

        enum UploadPhase: Sendable {
            case uploading
            case publishing
            case failed(String)
        }
    }

    // MARK: - Load Stories

    func loadStories(forceNetwork: Bool = false) async {
        guard !isLoading else { return }

        if forceNetwork {
            isLoading = true
            await fetchStoriesFromNetwork()
            isLoading = false
            return
        }

        let cached = await CacheCoordinator.shared.stories.load(for: "recent_tray")
        switch cached {
        case .fresh(let data, _):
            storyGroups = data
            prefetchAllStoryMedia(data)
            return
        case .stale(let data, _):
            storyGroups = data
            prefetchAllStoryMedia(data)
            Task { [weak self] in await self?.fetchStoriesFromNetwork() }
            return
        case .expired, .empty:
            break
        }

        isLoading = true
        await fetchStoriesFromNetwork()
        isLoading = false
    }

    private func fetchStoriesFromNetwork() async {
        do {
            let response = try await storyService.list(cursor: nil, limit: 50)

            if response.success {
                var groups = response.data.toStoryGroups()

                // Preserve locally-viewed state for stories the API hasn't synced yet
                let locallyViewed = buildLocallyViewedSet()
                if !locallyViewed.isEmpty {
                    groups = groups.map { group in
                        let merged = group.stories.map { story in
                            guard !story.isViewed, locallyViewed.contains(story.id) else { return story }
                            var copy = story; copy.isViewed = true; return copy
                        }
                        return group.with(stories: merged)
                    }
                }

                storyGroups = groups
                try? await CacheCoordinator.shared.stories.save(groups, for: "recent_tray")
                prefetchAllStoryMedia(groups)
            }
        } catch {
            Logger.messages.error("[StoryVM] Failed to load stories: \(error.localizedDescription)")
        }
    }

    private func buildLocallyViewedSet() -> Set<String> {
        var ids = Set<String>()
        for group in storyGroups {
            for story in group.stories where story.isViewed {
                ids.insert(story.id)
            }
        }
        return ids
    }

    // MARK: - Background Prefetch (triggered on story load)

    /// Prefetch all media for all story groups in the background.
    /// Downloads images to disk cache and prerolls video players for the first 3 groups.
    /// First slide of each group is prefetched at high priority for instant display.
    private func prefetchAllStoryMedia(_ groups: [StoryGroup]) {
        // High priority: prefetch first unviewed slide of each group (what the user taps first)
        let groupsToPreload = Array(groups.prefix(5))
        Task(priority: .userInitiated) {
            let imageCache = await CacheCoordinator.shared.images
            await withTaskGroup(of: Void.self) { taskGroup in
                for group in groupsToPreload {
                    guard let targetStory = group.stories.first(where: { !$0.isViewed }) ?? group.stories.first else { continue }
                    taskGroup.addTask {
                        await Self.prefetchStoryMedia(targetStory, imageCache: imageCache, prerollPlayer: true)
                    }
                }
            }
        }

        // Utility priority: prefetch images/video data (disk cache) for up to 3 upcoming slides per group.
        // DO NOT preroll AVPlayer here; let `StoryReaderPrefetcher` handle N+1 JIT warming to save memory.
        Task(priority: .utility) {
            let imageCache = await CacheCoordinator.shared.images
            for group in groupsToPreload {
                guard !Task.isCancelled else { return }
                let firstUnviewedIndex = group.stories.firstIndex(where: { !$0.isViewed }) ?? 0
                let slidesToPrefetch = Array(group.stories.dropFirst(firstUnviewedIndex + 1).prefix(3))
                
                for story in slidesToPrefetch {
                    guard !Task.isCancelled else { return }
                    await Self.prefetchStoryMedia(story, imageCache: imageCache, prerollPlayer: false)
                }
            }
        }
    }

    /// Prefetch all media URLs for a single story into disk + memory cache.
    private static func prefetchStoryMedia(_ story: StoryItem, imageCache: DiskCacheStore, prerollPlayer: Bool) async {
        var urls: [String] = story.media.compactMap(\.url)

        if let mediaObjs = story.storyEffects?.mediaObjects {
            for obj in mediaObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let audioObjs = story.storyEffects?.audioPlayerObjects {
            for obj in audioObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let bgAudioId = story.storyEffects?.backgroundAudioId {
            if let urlStr = story.media.first(where: { $0.id == bgAudioId })?.url {
                urls.append(urlStr)
            }
        }

        for urlString in Set(urls) {
            let mediaType = story.media.first(where: { $0.url == urlString })?.type

            if mediaType == .video || mediaType == .audio {
                _ = try? await imageCache.data(for: urlString)
                if prerollPlayer, let url = URL(string: urlString) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                }
            } else {
                _ = await imageCache.image(for: urlString)
            }
        }
    }

    // MARK: - Mark Story as Viewed

    func markViewed(storyId: String) {
        // Fire & forget
        Task {
            do {
                try await storyService.markViewed(storyId: storyId)
            } catch {
                // Silent failure
            }
        }

        // Update local state
        for i in storyGroups.indices {
            if let j = storyGroups[i].stories.firstIndex(where: { $0.id == storyId }) {
                var updated = storyGroups[i].stories
                updated[j] = StoryItem(
                    id: updated[j].id,
                    content: updated[j].content,
                    media: updated[j].media,
                    storyEffects: updated[j].storyEffects,
                    createdAt: updated[j].createdAt,
                    expiresAt: updated[j].expiresAt,
                    isViewed: true
                )
                storyGroups[i] = storyGroups[i].with(stories: updated)
                persistStoryCache()
                return
            }
        }
    }

    // MARK: - Lookup Methods

    func storyGroupForUser(userId: String) -> StoryGroup? {
        storyGroups.first { $0.id == userId }
    }

    func groupIndex(forUserId userId: String) -> Int? {
        storyGroups.firstIndex { $0.id == userId }
    }

    func groupIndex(forStoryId storyId: String) -> Int? {
        storyGroups.firstIndex { group in
            group.stories.contains { $0.id == storyId }
        }
    }

    func hasStories(forUserId userId: String) -> Bool {
        storyGroups.contains { $0.id == userId }
    }

    func hasUnviewedStories(forUserId userId: String) -> Bool {
        storyGroups.first { $0.id == userId }?.hasUnviewed ?? false
    }

    // MARK: - Publish Story

    func publishStory(effects: StoryEffects, content: String?, image: UIImage?, originalLanguage: String? = nil, visibility: String = "PUBLIC") async {
        guard !isPublishing else { return }
        isPublishing = true
        publishError = nil

        do {
            var uploadResult: TusUploadResult? = nil

            if let image {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = api.authToken else {
                    publishError = "Authentication required"
                    isPublishing = false
                    return
                }

                let compressed = await MediaCompressor.shared.compressImage(image)
                let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                try compressed.data.write(to: tempURL)
                defer { try? FileManager.default.removeItem(at: tempURL) }

                let thumbHash = image.toThumbHash()
                let uploader = TusUploadManager(baseURL: baseURL)
                uploadResult = try await uploader.uploadFile(fileURL: tempURL, mimeType: compressed.mimeType, token: token, uploadContext: "story", thumbHash: thumbHash)
            }

            let post = try await postService.createStory(
                content: content,
                storyEffects: effects,
                visibility: visibility,
                originalLanguage: originalLanguage,
                mediaIds: uploadResult.map { [$0.id] },
                repostOfId: nil
            )

            let media = buildFeedMedia(from: post, fallback: uploadResult)
            let newItem = StoryItem(id: post.id, content: post.content, media: media,
                                     storyEffects: effects, createdAt: post.createdAt, isViewed: true)
            insertOrAppendStoryItem(newItem, forAuthor: post.author)
            showStoryComposer = false
            ToastManager.shared.showSuccess("Story publiee")
        } catch {
            publishError = "Failed to publish story"
            ToastManager.shared.showError("Echec de la publication de la story")
        }

        isPublishing = false
    }
    // MARK: - Publish Single Story (throws)

    @MainActor
    func publishStorySingle(
        effects: StoryEffects,
        content: String?,
        image: UIImage?,
        loadedImages: [String: UIImage] = [:],
        loadedVideoURLs: [String: URL] = [:],
        originalLanguage: String? = nil,
        visibility: String = "PUBLIC"
    ) async throws {
        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = api.authToken else {
            throw URLError(.userAuthenticationRequired)
        }
        let uploader = TusUploadManager(baseURL: baseURL)

        // 1. Upload background thumbnail (image de fond du slide)
        var uploadResult: TusUploadResult? = nil
        if let image {
            let thumbHash = image.toThumbHash()
            let compressed = await MediaCompressor.shared.compressImage(image)
            let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try compressed.data.write(to: tempURL)
            defer { try? FileManager.default.removeItem(at: tempURL) }
            uploadResult = try await uploader.uploadFile(
                fileURL: tempURL, mimeType: compressed.mimeType,
                token: token, uploadContext: "story", thumbHash: thumbHash
            )
        }

        // 2. Upload médias foreground (image/vidéo posés sur le canvas)
        var updatedEffects = effects
        var foregroundMediaIds: [String] = []
        if var mediaObjects = updatedEffects.mediaObjects {
            for i in mediaObjects.indices where mediaObjects[i].postMediaId.isEmpty {
                let obj = mediaObjects[i]
                if obj.kind == .video, let videoURL = loadedVideoURLs[obj.id] {
                    let result = try await uploader.uploadFile(
                        fileURL: videoURL, mimeType: "video/mp4",
                        token: token, uploadContext: "story"
                    )
                    mediaObjects[i].postMediaId = result.id
                    foregroundMediaIds.append(result.id)
                } else if obj.kind == .image, let uiImage = loadedImages[obj.id] {
                    let fgThumbHash = uiImage.toThumbHash()
                    let compressed = await MediaCompressor.shared.compressImage(uiImage)
                    let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try compressed.data.write(to: tempURL)
                    defer { try? FileManager.default.removeItem(at: tempURL) }
                    let result = try await uploader.uploadFile(
                        fileURL: tempURL, mimeType: compressed.mimeType,
                        token: token, uploadContext: "story", thumbHash: fgThumbHash
                    )
                    mediaObjects[i].postMediaId = result.id
                    foregroundMediaIds.append(result.id)
                }
            }
            updatedEffects.mediaObjects = mediaObjects
        }

        // 3. Composer la liste complète des mediaIds (thumbnail + foreground)
        var allMediaIds: [String] = []
        if let id = uploadResult?.id { allMediaIds.append(id) }
        allMediaIds.append(contentsOf: foregroundMediaIds)

        let post = try await postService.createStory(
            content: content,
            storyEffects: updatedEffects,
            visibility: visibility,
            originalLanguage: originalLanguage,
            mediaIds: allMediaIds.isEmpty ? nil : allMediaIds,
            repostOfId: nil
        )

        let media = buildFeedMedia(from: post, fallback: uploadResult)
        let newItem = StoryItem(id: post.id, content: post.content, media: media,
                                 storyEffects: updatedEffects, createdAt: post.createdAt, isViewed: true)
        insertOrAppendStoryItem(newItem, forAuthor: post.author)
    }

    // MARK: - Background Publishing

    func publishStoryInBackground(
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL] = [:],
        originalLanguage: String? = nil,
        visibility: String = "PUBLIC"
    ) {
        guard activeUpload == nil else { return }

        // Offline-first: route through StoryPublishQueue instead of TUS so
        // the publish survives a cold start and reconnect. The queue handler
        // (registered via StoryPublishService.setExecutor in RootView)
        // replays via executeQueuedPublish on reconnect, reusing the same
        // runStoryUpload pipeline as the online path.
        if NetworkMonitor.shared.isOffline {
            Task { [weak self] in
                await self?.enqueueStoryForOfflinePublish(
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    visibility: visibility
                )
            }
            showStoryComposer = false
            return
        }

        let user = AuthManager.shared.currentUser
        let thumbnail = slideImages.values.first?.preparingThumbnail(of: CGSize(width: 100, height: 178))
            ?? UIImage()

        let upload = StoryUploadState(
            id: UUID().uuidString,
            thumbnailImage: thumbnail,
            progress: 0,
            phase: .uploading,
            authorId: user?.id ?? "",
            authorName: user?.displayName ?? user?.username ?? "",
            authorAvatar: user?.avatar,
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs,
            originalLanguage: originalLanguage,
            visibility: visibility
        )
        activeUpload = upload
        showStoryComposer = false

        launchUploadTask()
    }

    /// Persists the in-memory composer state to disk and enqueues the
    /// publish into `StoryPublishQueue` so it can be replayed when network
    /// returns or on the next cold start. Called by `publishStoryInBackground`
    /// when `NetworkMonitor.shared.isOffline` is true.
    ///
    /// The slide background images are re-keyed to the
    /// `"slide-bg-{slide.id}"` convention expected by `loadMediaFromReferences`
    /// so the executor (commit d3a57947) reconstructs them correctly on
    /// replay. Foreground media (effect images / videos / audio) keep their
    /// `elementId` as-is.
    ///
    /// `internal` access (not `private`) so unit tests can exercise the
    /// enqueue branch without having to mutate `NetworkMonitor.shared`
    /// (whose `isOffline` setter is `private(set)`).
    func enqueueStoryForOfflinePublish(
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        visibility: String
    ) async {
        // 1. Re-key slide backgrounds.
        let bgImages = Dictionary(
            uniqueKeysWithValues: slideImages.map { (slideId, img) in
                ("slide-bg-\(slideId)", img)
            }
        )
        // Foreground images merged with backgrounds; collisions go to the
        // foreground value (extremely unlikely — slide ids and effect ids
        // are both UUIDs).
        let allImages = bgImages.merging(loadedImages) { _, fg in fg }

        // 2. Persist media on disk in a dedicated offline queue directory per story.
        // This avoids `StoryDraftStore.saveMedia` which clears the directory, allowing
        // multiple stories to be queued without data loss.
        let fm = FileManager.default
        let docDir = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let tempStoryId = "pending_\(UUID().uuidString)"
        let offlineDir = docDir.appendingPathComponent("meeshy_offline_queue").appendingPathComponent(tempStoryId)
        try? fm.createDirectory(at: offlineDir, withIntermediateDirectories: true)
        
        var mediaReferences: [StoryMediaReference] = []

        for (id, image) in allImages {
            let fileName = "\(id).jpg"
            let dest = offlineDir.appendingPathComponent(fileName)
            if let data = image.jpegData(compressionQuality: 0.85) {
                try? data.write(to: dest)
                mediaReferences.append(StoryMediaReference(elementId: id, mediaType: "image", localFilePath: dest.path))
            }
        }

        for (id, url) in loadedVideoURLs {
            let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = offlineDir.appendingPathComponent(fileName)
            try? fm.copyItem(at: url, to: dest)
            mediaReferences.append(StoryMediaReference(elementId: id, mediaType: "video", localFilePath: dest.path))
        }

        for (id, url) in loadedAudioURLs {
            let ext = url.pathExtension.isEmpty ? "m4a" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = offlineDir.appendingPathComponent(fileName)
            try? fm.copyItem(at: url, to: dest)
            mediaReferences.append(StoryMediaReference(elementId: id, mediaType: "audio", localFilePath: dest.path))
        }

        // 3. Encode the slides payload. The custom encoder excludes
        //    `mediaData`, which is exactly why `mediaReferences` carries
        //    the disk paths separately.
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let payload = try? encoder.encode(slides) else {
            ToastManager.shared.showError(String(
                localized: "story.publish.queue.encodeError",
                defaultValue: "Impossible d'enregistrer la story pour publication différée"
            ))
            return
        }

        // 4. Enqueue. The queue persists to disk synchronously so a crash
        //    immediately after this call still preserves the item.
        let item = StoryPublishQueueItem(
            visibility: visibility,
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: mediaReferences,
            tempStoryId: tempStoryId
        )
        _ = await StoryPublishQueue.shared.enqueue(item)

        // 5. User feedback. The PendingStoryBanner mounted in RootView
        //    reflects the new pending count via StoryPublishService.
        HapticFeedback.success()
        ToastManager.shared.showSuccess(String(
            localized: "story.publish.queue.enqueued",
            defaultValue: "Story enregistrée — publication au retour en ligne"
        ))
    }

    private func launchUploadTask() {
        guard let upload = activeUpload else { return }

        uploadTask = Task { [weak self] in
            guard let self else { return }
            do {
                _ = try await self.runStoryUpload(
                    upload,
                    onProgress: { [weak self] progress in
                        self?.activeUpload?.progress = progress
                    },
                    onPhase: { [weak self] phase in
                        self?.activeUpload?.phase = phase
                    },
                    onPublishedSlide: { [weak self] published in
                        self?.activeUpload?.publishedPostIds.append(published.post.id)
                        self?.insertOrAppendStoryItem(
                            published.item, forAuthor: published.post.author
                        )
                    }
                )

                // Upload complete — cleanup temp files now
                self.cleanupUploadTempFiles(upload)
                self.activeUpload = nil
                self.uploadTask = nil
                HapticFeedback.success()
                ToastManager.shared.showSuccess("Story publiee")
            } catch {
                if !Task.isCancelled {
                    self.activeUpload?.phase = .failed(error.localizedDescription)
                    ToastManager.shared.showError("Echec de la publication de la story")
                    // Don't cleanup temp files on failure — retry may need them
                }
            }
        }
    }

    // MARK: - Shared Upload Pipeline (UI-driven + queue-driven)

    /// Lightweight handle for a slide that just landed server-side, surfaced
    /// to callers of `runStoryUpload` so the UI path can prepend it to the
    /// story tray and the queue path can ignore it.
    fileprivate struct PublishedSlide {
        let post: APIPost
        let item: StoryItem
    }

    /// Headless story upload pipeline shared by:
    ///   1. `launchUploadTask` (composer flow) — wraps progress/phase/published
    ///       callbacks to drive the `activeUpload` banner and tray prepend.
    ///   2. `executeQueuedPublish` (queue flow) — passes no-op callbacks since
    ///       there is no banner to update on cold-start replay.
    ///
    /// Stories publish RAW (assets + JSON effects) so the Prisme Linguistique
    /// can retranslate text/audio per viewer. The MP4 export pipeline is a
    /// separate author-only feature (see `StoryExportShareViewModel`) and
    /// must never be wired here — refer to
    /// `docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md`.
    ///
    /// Authentication is checked here (not in callers) because it can change
    /// between an enqueue and a replay; the queue path needs the same gate.
    /// Returns `[String]` of the post ids created in this invocation (excluding
    /// any slides skipped via `upload.publishedPostIds`).
    private func runStoryUpload(
        _ upload: StoryUploadState,
        onProgress: @escaping (Double) -> Void,
        onPhase: @escaping (StoryUploadState.UploadPhase) -> Void,
        onPublishedSlide: @escaping (PublishedSlide) -> Void
    ) async throws -> [String] {
        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = api.authToken else {
            throw URLError(.userAuthenticationRequired)
        }
        let uploader = TusUploadManager(baseURL: baseURL)
        let slideCount = upload.slides.count
        let slideShare = 1.0 / Double(max(1, slideCount))
        // On retry, skip slides whose Posts already exist server-side. Without
        // this, a partial-failure retry recreated the early slides and the
        // user ended up with duplicates (e.g., slide 0 published twice).
        let alreadyPublishedCount = upload.publishedPostIds.count
        var newPostIds: [String] = []

        for (slideIdx, slide) in upload.slides.enumerated() {
            guard !Task.isCancelled else { return newPostIds }
            if slideIdx < alreadyPublishedCount {
                // Already committed during a previous attempt.
                onProgress(Double(slideIdx + 1) * slideShare)
                continue
            }
            let baseProgress = Double(slideIdx) * slideShare

            // RAW publish path : background image (if any) + foreground assets
            // (image/video/audio) are uploaded individually. The StoryEffects
            // JSON encodes text, keyframes, transitions, filters and opening.
            // Viewers re-render locally per their preferred language (Prisme
            // Linguistique). MP4 baking is reserved for the author-only export
            // flow (`StoryExportShareViewModel`).

            var uploadResult: TusUploadResult? = nil
            if let bgImage = upload.slideImages[slide.id] {
                let thumbHash = bgImage.toThumbHash()
                let compressed = await MediaCompressor.shared.compressImage(bgImage)
                let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                try compressed.data.write(to: tempURL)
                defer { try? FileManager.default.removeItem(at: tempURL) }
                uploadResult = try await uploader.uploadFile(
                    fileURL: tempURL, mimeType: compressed.mimeType,
                    token: token, uploadContext: "story", thumbHash: thumbHash
                )
                onProgress(baseProgress + 0.30 * slideShare)
            } else {
                onProgress(baseProgress + 0.30 * slideShare)
            }

            var updatedEffects = slide.effects
            var foregroundMediaIds: [String] = []
            if var mediaObjects = updatedEffects.mediaObjects {
                let mediaCount = mediaObjects.filter({ $0.postMediaId.isEmpty }).count
                var mediaIdx = 0
                for i in mediaObjects.indices where mediaObjects[i].postMediaId.isEmpty {
                    guard !Task.isCancelled else { return newPostIds }
                    let obj = mediaObjects[i]
                    if obj.kind == .video, let videoURL = upload.loadedVideoURLs[obj.id] {
                        let result = try await uploader.uploadFile(
                            fileURL: videoURL, mimeType: "video/mp4",
                            token: token, uploadContext: "story"
                        )
                        mediaObjects[i].postMediaId = result.id
                        foregroundMediaIds.append(result.id)
                    } else if obj.kind == .image, let uiImage = upload.loadedImages[obj.id] {
                        let fgThumbHash = uiImage.toThumbHash()
                        let compressed = await MediaCompressor.shared.compressImage(uiImage)
                        let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                        try compressed.data.write(to: tempURL)
                        defer { try? FileManager.default.removeItem(at: tempURL) }
                        let result = try await uploader.uploadFile(
                            fileURL: tempURL, mimeType: compressed.mimeType,
                            token: token, uploadContext: "story", thumbHash: fgThumbHash
                        )
                        mediaObjects[i].postMediaId = result.id
                        foregroundMediaIds.append(result.id)
                    }
                    mediaIdx += 1
                    let mediaProgress = Double(mediaIdx) / Double(max(1, mediaCount))
                    onProgress(baseProgress + (0.30 + mediaProgress * 0.50) * slideShare)
                }
                updatedEffects.mediaObjects = mediaObjects
            }

            if var audioObjects = updatedEffects.audioPlayerObjects {
                for i in audioObjects.indices where audioObjects[i].postMediaId.isEmpty {
                    guard !Task.isCancelled else { return newPostIds }
                    let obj = audioObjects[i]
                    if let audioURL = upload.loadedAudioURLs[obj.id] ?? upload.loadedVideoURLs[obj.id] {
                        let result = try await uploader.uploadFile(
                            fileURL: audioURL, mimeType: "audio/mp4",
                            token: token, uploadContext: "story"
                        )
                        audioObjects[i].postMediaId = result.id
                        foregroundMediaIds.append(result.id)
                    }
                }
                updatedEffects.audioPlayerObjects = audioObjects
            }

            onPhase(.publishing)
            var allMediaIds: [String] = []
            if let id = uploadResult?.id { allMediaIds.append(id) }
            allMediaIds.append(contentsOf: foregroundMediaIds)

            let post = try await postService.createStory(
                content: slide.content,
                storyEffects: updatedEffects,
                visibility: upload.visibility,
                originalLanguage: upload.originalLanguage,
                mediaIds: allMediaIds.isEmpty ? nil : allMediaIds,
                repostOfId: nil
            )

            newPostIds.append(post.id)
            let media = buildFeedMedia(from: post, fallback: uploadResult)
            let newItem = StoryItem(
                id: post.id, content: post.content, media: media,
                storyEffects: updatedEffects, createdAt: post.createdAt, isViewed: true
            )
            onPublishedSlide(PublishedSlide(post: post, item: newItem))
            onProgress(Double(slideIdx + 1) * slideShare)
            onPhase(.uploading)
        }

        return newPostIds
    }

    /// Hydrates the in-memory dictionaries that `runStoryUpload` consumes
    /// from a flat `[StoryMediaReference]` list. The queue stores absolute
    /// disk paths because the in-memory `UIImage` / `URL` graph is not
    /// `Codable`; this helper does the inverse mapping at replay time.
    ///
    /// Convention : a reference whose `elementId` starts with `"slide-bg-"`
    /// is a slide background image (keyed by the trailing `slide.id`);
    /// any other id is treated as a canvas effect (image / video / audio)
    /// keyed by `elementId` directly. Missing or undecodable files raise
    /// `StoryPublishUnrecoverableError` so the queue drops the item rather
    /// than looping forever.
    private struct LoadedMedia {
        let slideImages: [String: UIImage]
        let loadedImages: [String: UIImage]
        let loadedVideoURLs: [String: URL]
        let loadedAudioURLs: [String: URL]
    }

    private func loadMediaFromReferences(_ refs: [StoryMediaReference]) throws -> LoadedMedia {
        var slideImages: [String: UIImage] = [:]
        var loadedImages: [String: UIImage] = [:]
        var loadedVideoURLs: [String: URL] = [:]
        var loadedAudioURLs: [String: URL] = [:]

        let slideBgPrefix = "slide-bg-"

        for ref in refs {
            guard FileManager.default.fileExists(atPath: ref.localFilePath) else {
                throw StoryPublishUnrecoverableError(
                    "Missing local media at \(ref.localFilePath)"
                )
            }
            let url = URL(fileURLWithPath: ref.localFilePath)
            let isSlideBackground = ref.elementId.hasPrefix(slideBgPrefix)

            switch ref.mediaType {
            case "image":
                guard let image = UIImage(contentsOfFile: ref.localFilePath) else {
                    throw StoryPublishUnrecoverableError(
                        "Could not decode image at \(ref.localFilePath)"
                    )
                }
                if isSlideBackground {
                    let slideId = String(ref.elementId.dropFirst(slideBgPrefix.count))
                    slideImages[slideId] = image
                } else {
                    loadedImages[ref.elementId] = image
                }
            case "video":
                loadedVideoURLs[ref.elementId] = url
            case "audio":
                loadedAudioURLs[ref.elementId] = url
            default:
                throw StoryPublishUnrecoverableError(
                    "Unknown mediaType '\(ref.mediaType)' for elementId \(ref.elementId)"
                )
            }
        }

        return LoadedMedia(
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs
        )
    }

    func retryUpload() {
        guard case .failed = activeUpload?.phase else { return }
        activeUpload?.progress = 0
        activeUpload?.phase = .uploading
        launchUploadTask()
    }

    func cancelUpload() {
        if let upload = activeUpload {
            cleanupUploadTempFiles(upload)
            // Delete any slides that were committed before the user cancelled —
            // otherwise a 5-slide story cancelled at slide 3 leaves slides 1-2
            // visible to friends as orphan stories that don't fit any slideshow.
            // Fire-and-forget on a detached task; don't block the cancel UX.
            let orphans = upload.publishedPostIds
            if !orphans.isEmpty {
                Task.detached { [storyService = self.storyService] in
                    for postId in orphans {
                        try? await storyService.delete(storyId: postId)
                    }
                }
            }
        }
        uploadTask?.cancel()
        uploadTask = nil
        activeUpload = nil
    }

    /// Cleanup temp video/audio files after upload completes.
    private func cleanupUploadTempFiles(_ upload: StoryUploadState) {
        for (_, url) in upload.loadedVideoURLs {
            try? FileManager.default.removeItem(at: url)
        }
        for (_, url) in upload.loadedAudioURLs {
            try? FileManager.default.removeItem(at: url)
        }
    }

    // MARK: - Delete Story

    func deleteStory(storyId: String) async -> Bool {
        do {
            try await storyService.delete(storyId: storyId)

            // Remove from local state
            for i in storyGroups.indices {
                if let j = storyGroups[i].stories.firstIndex(where: { $0.id == storyId }) {
                    var updated = storyGroups[i].stories
                    updated.remove(at: j)
                    if updated.isEmpty {
                        storyGroups.remove(at: i)
                    } else {
                        storyGroups[i] = storyGroups[i].with(stories: updated)
                    }
                    break
                }
            }
            persistStoryCache()
            return true
        } catch {
            return false
        }
    }
    // MARK: - Socket.IO Real-Time Updates

    func subscribeToSocketEvents() {
        socialSocket.storyCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                // Convert to StoryItem and insert into the right group
                let groups = [apiPost].toStoryGroups()
                for newGroup in groups {
                    if let idx = self.storyGroups.firstIndex(where: { $0.id == newGroup.id }) {
                        var updated = self.storyGroups[idx].stories
                        for story in newGroup.stories where !updated.contains(where: { $0.id == story.id }) {
                            updated.append(story)
                        }
                        self.storyGroups[idx] = self.storyGroups[idx].with(stories: updated)
                    } else {
                        // New author — insert at beginning
                        self.storyGroups.insert(newGroup, at: 0)
                    }
                }
                self.persistStoryCache()
            }
            .store(in: &cancellables)

        socialSocket.storyViewed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] viewedData in
                guard let self else { return }
                for i in self.storyGroups.indices {
                    if let j = self.storyGroups[i].stories.firstIndex(where: { $0.id == viewedData.storyId }) {
                        var updatedStories = self.storyGroups[i].stories
                        updatedStories[j].isViewed = true
                        self.storyGroups[i] = self.storyGroups[i].with(stories: updatedStories)
                        self.persistStoryCache()
                        return
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Helpers

    private func buildFeedMedia(from post: APIPost, fallback uploadResult: TusUploadResult?) -> [FeedMedia] {
        let apiMedia = (post.media ?? []).map { m in
            FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbHash: m.thumbHash,
                      thumbnailColor: "4ECDC4", width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
        }
        if !apiMedia.isEmpty { return apiMedia }
        if let uploaded = uploadResult {
            return [FeedMedia(id: uploaded.id, type: .image, url: uploaded.fileUrl,
                              thumbHash: uploaded.thumbHash, thumbnailColor: "4ECDC4",
                              width: uploaded.width, height: uploaded.height)]
        }
        return []
    }

    private func insertOrAppendStoryItem(_ item: StoryItem, forAuthor author: APIAuthor) {
        if let idx = storyGroups.firstIndex(where: { $0.id == author.id }) {
            var updated = storyGroups[idx].stories
            updated.append(item)
            storyGroups[idx] = storyGroups[idx].with(stories: updated)
        } else {
            storyGroups.insert(StoryGroup(
                id: author.id,
                username: author.name,
                avatarColor: DynamicColorGenerator.colorForName(author.name),
                avatarURL: author.avatar,
                stories: [item]
            ), at: 0)
        }
        persistStoryCache()
    }

    private func persistStoryCache() {
        let snapshot = storyGroups
        Task { try? await CacheCoordinator.shared.stories.save(snapshot, for: "recent_tray") }
    }
}
