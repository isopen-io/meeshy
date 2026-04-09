import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

@MainActor
class StoryViewModel: ObservableObject {
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

        enum UploadPhase: Sendable {
            case uploading
            case publishing
            case failed(String)
        }
    }

    // MARK: - Load Stories

    func loadStories() async {
        guard !isLoading else { return }

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
                await CacheCoordinator.shared.stories.save(groups, for: "recent_tray")
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
    /// This runs at low priority to avoid competing with foreground work.
    private func prefetchAllStoryMedia(_ groups: [StoryGroup]) {
        Task(priority: .utility) {
            let imageCache = await CacheCoordinator.shared.images

            // Sliding window: only prefetch first 5 groups (not all 50)
            // StoryViewerView.prefetchCurrentGroup() handles deeper prefetch on open
            let groupsToPreload = groups.prefix(5)
            for (groupIndex, group) in groupsToPreload.enumerated() {
                guard !Task.isCancelled else { return }
                for story in group.stories {
                    // Collect all media URLs from the story
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

                    // Download all media to disk cache + populate UIImage NSCache
                    for urlString in Set(urls) {
                        let mediaType = story.media.first(where: { $0.url == urlString })?.type

                        if mediaType == .video || mediaType == .audio {
                            // Video/Audio: download raw data to disk + preroll player for first 3 groups
                            _ = try? await imageCache.data(for: urlString)
                            if groupIndex < 3, let url = URL(string: urlString) {
                                await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                            }
                        } else {
                            // Image: use image(for:) which downloads AND populates
                            // the static UIImage NSCache — so DiskCacheStore.cachedImage(for:)
                            // returns the image instantly when the viewer renders
                            _ = await imageCache.image(for: urlString)
                        }
                    }
                }
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

    func publishStory(effects: StoryEffects, content: String?, image: UIImage?, originalLanguage: String? = nil) async {
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

                let uploader = TusUploadManager(baseURL: baseURL)
                uploadResult = try await uploader.uploadFile(fileURL: tempURL, mimeType: compressed.mimeType, token: token, uploadContext: "story")
            }

            let post = try await postService.createStory(
                content: content,
                storyEffects: effects,
                visibility: "PUBLIC",
                originalLanguage: originalLanguage,
                mediaIds: uploadResult.map { [$0.id] }
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
        originalLanguage: String? = nil
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
            let compressed = await MediaCompressor.shared.compressImage(image)
            let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try compressed.data.write(to: tempURL)
            defer { try? FileManager.default.removeItem(at: tempURL) }
            uploadResult = try await uploader.uploadFile(
                fileURL: tempURL, mimeType: compressed.mimeType,
                token: token, uploadContext: "story"
            )
        }

        // 2. Upload médias foreground (image/vidéo posés sur le canvas)
        var updatedEffects = effects
        var foregroundMediaIds: [String] = []
        if var mediaObjects = updatedEffects.mediaObjects {
            for i in mediaObjects.indices where mediaObjects[i].postMediaId.isEmpty {
                let obj = mediaObjects[i]
                if obj.mediaType == "video", let videoURL = loadedVideoURLs[obj.id] {
                    let result = try await uploader.uploadFile(
                        fileURL: videoURL, mimeType: "video/mp4",
                        token: token, uploadContext: "story"
                    )
                    mediaObjects[i].postMediaId = result.id
                    foregroundMediaIds.append(result.id)
                } else if obj.mediaType == "image", let uiImage = loadedImages[obj.id] {
                    let compressed = await MediaCompressor.shared.compressImage(uiImage)
                    let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try compressed.data.write(to: tempURL)
                    defer { try? FileManager.default.removeItem(at: tempURL) }
                    let result = try await uploader.uploadFile(
                        fileURL: tempURL, mimeType: compressed.mimeType,
                        token: token, uploadContext: "story"
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
            visibility: "PUBLIC",
            originalLanguage: originalLanguage,
            mediaIds: allMediaIds.isEmpty ? nil : allMediaIds
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
        originalLanguage: String? = nil
    ) {
        guard activeUpload == nil else { return }

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
            originalLanguage: originalLanguage
        )
        activeUpload = upload
        showStoryComposer = false

        launchUploadTask()
    }

    private func launchUploadTask() {
        guard let upload = activeUpload else { return }

        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = api.authToken else {
            activeUpload?.phase = .failed("Authentication required")
            return
        }

        uploadTask = Task {
            let uploader = TusUploadManager(baseURL: baseURL)
            let slideCount = upload.slides.count
            let slideShare = 1.0 / Double(max(1, slideCount))

            do {
                for (slideIdx, slide) in upload.slides.enumerated() {
                    guard !Task.isCancelled else { return }
                    let baseProgress = Double(slideIdx) * slideShare

                    var uploadResult: TusUploadResult? = nil
                    if let bgImage = upload.slideImages[slide.id] {
                        let compressed = await MediaCompressor.shared.compressImage(bgImage)
                        let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                        try compressed.data.write(to: tempURL)
                        defer { try? FileManager.default.removeItem(at: tempURL) }
                        uploadResult = try await uploader.uploadFile(
                            fileURL: tempURL, mimeType: compressed.mimeType,
                            token: token, uploadContext: "story"
                        )
                    }
                    activeUpload?.progress = baseProgress + 0.30 * slideShare

                    var updatedEffects = slide.effects
                    var foregroundMediaIds: [String] = []
                    if var mediaObjects = updatedEffects.mediaObjects {
                        let mediaCount = mediaObjects.filter({ $0.postMediaId.isEmpty }).count
                        var mediaIdx = 0
                        for i in mediaObjects.indices where mediaObjects[i].postMediaId.isEmpty {
                            guard !Task.isCancelled else { return }
                            let obj = mediaObjects[i]
                            if obj.mediaType == "video", let videoURL = upload.loadedVideoURLs[obj.id] {
                                let result = try await uploader.uploadFile(
                                    fileURL: videoURL, mimeType: "video/mp4",
                                    token: token, uploadContext: "story"
                                )
                                mediaObjects[i].postMediaId = result.id
                                foregroundMediaIds.append(result.id)
                            } else if obj.mediaType == "image", let uiImage = upload.loadedImages[obj.id] {
                                let compressed = await MediaCompressor.shared.compressImage(uiImage)
                                let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                                try compressed.data.write(to: tempURL)
                                defer { try? FileManager.default.removeItem(at: tempURL) }
                                let result = try await uploader.uploadFile(
                                    fileURL: tempURL, mimeType: compressed.mimeType,
                                    token: token, uploadContext: "story"
                                )
                                mediaObjects[i].postMediaId = result.id
                                foregroundMediaIds.append(result.id)
                            }
                            mediaIdx += 1
                            let mediaProgress = Double(mediaIdx) / Double(max(1, mediaCount))
                            activeUpload?.progress = baseProgress + (0.30 + mediaProgress * 0.50) * slideShare
                        }
                        updatedEffects.mediaObjects = mediaObjects
                    }

                    if var audioObjects = updatedEffects.audioPlayerObjects {
                        for i in audioObjects.indices where audioObjects[i].postMediaId.isEmpty {
                            guard !Task.isCancelled else { return }
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

                    activeUpload?.phase = .publishing
                    var allMediaIds: [String] = []
                    if let id = uploadResult?.id { allMediaIds.append(id) }
                    allMediaIds.append(contentsOf: foregroundMediaIds)

                    let post = try await postService.createStory(
                        content: slide.content,
                        storyEffects: updatedEffects,
                        visibility: "PUBLIC",
                        originalLanguage: upload.originalLanguage,
                        mediaIds: allMediaIds.isEmpty ? nil : allMediaIds
                    )

                    let media = buildFeedMedia(from: post, fallback: uploadResult)
                    let newItem = StoryItem(
                        id: post.id, content: post.content, media: media,
                        storyEffects: updatedEffects, createdAt: post.createdAt, isViewed: true
                    )
                    insertOrAppendStoryItem(newItem, forAuthor: post.author)
                    activeUpload?.progress = Double(slideIdx + 1) * slideShare
                    activeUpload?.phase = .uploading
                }

                // Upload complete — cleanup temp files now
                cleanupUploadTempFiles(upload)
                activeUpload = nil
                uploadTask = nil
                HapticFeedback.success()
                ToastManager.shared.showSuccess("Story publiee")
            } catch {
                if !Task.isCancelled {
                    activeUpload?.phase = .failed(error.localizedDescription)
                    ToastManager.shared.showError("Echec de la publication de la story")
                    // Don't cleanup temp files on failure — retry may need them
                }
            }
        }
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
            FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbnailColor: "4ECDC4",
                      width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
        }
        if !apiMedia.isEmpty { return apiMedia }
        if let uploaded = uploadResult {
            return [FeedMedia(id: uploaded.id, type: .image, url: uploaded.fileUrl,
                              thumbnailColor: "4ECDC4", width: uploaded.width, height: uploaded.height)]
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
        Task { await CacheCoordinator.shared.stories.save(snapshot, for: "recent_tray") }
    }
}
