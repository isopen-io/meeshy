import Foundation
import SwiftUI
import Combine
import MeeshySDK

@MainActor
class StoryViewModel: ObservableObject {
    @Published var storyGroups: [StoryGroup] = []
    @Published var isLoading = false
    @Published var isPublishing = false
    @Published var publishError: String?
    @Published var showStoryComposer = false

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

    // MARK: - Load Stories

    func loadStories() async {
        guard !isLoading else { return }
        isLoading = true

        do {
            let response = try await storyService.list(cursor: nil, limit: 50)

            if response.success {
                storyGroups = response.data.toStoryGroups()
            } else {
                fallbackToSampleData()
            }
        } catch {
            fallbackToSampleData()
        }

        isLoading = false
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
                storyGroups[i] = StoryGroup(
                    id: storyGroups[i].id,
                    username: storyGroups[i].username,
                    avatarColor: storyGroups[i].avatarColor,
                    stories: updated
                )
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

    func hasStories(forUserId userId: String) -> Bool {
        storyGroups.contains { $0.id == userId }
    }

    func hasUnviewedStories(forUserId userId: String) -> Bool {
        storyGroups.first { $0.id == userId }?.hasUnviewed ?? false
    }

    // MARK: - Publish Story

    func publishStory(effects: StoryEffects, content: String?, image: UIImage?) async {
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
                mediaIds: uploadResult.map { [$0.id] }
            )

            // Toujours utiliser post.media (l'API retourne tous les médias associés).
            let apiMedia = (post.media ?? []).map { m in
                FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbnailColor: "4ECDC4",
                          width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
            }
            let media: [FeedMedia]
            if !apiMedia.isEmpty {
                media = apiMedia
            } else if let uploaded = uploadResult {
                media = [FeedMedia(id: uploaded.id, type: .image, url: uploaded.fileUrl,
                                   thumbnailColor: "4ECDC4", width: uploaded.width, height: uploaded.height)]
            } else {
                media = []
            }
            let newItem = StoryItem(id: post.id, content: post.content, media: media,
                                     storyEffects: effects, createdAt: post.createdAt, isViewed: true)

            if let idx = storyGroups.firstIndex(where: { $0.id == post.author.id }) {
                var updated = storyGroups[idx].stories
                updated.append(newItem)
                storyGroups[idx] = StoryGroup(
                    id: storyGroups[idx].id,
                    username: storyGroups[idx].username,
                    avatarColor: storyGroups[idx].avatarColor,
                    avatarURL: storyGroups[idx].avatarURL,
                    stories: updated
                )
            } else {
                let newGroup = StoryGroup(
                    id: post.author.id,
                    username: post.author.name,
                    avatarColor: DynamicColorGenerator.colorForName(post.author.name),
                    avatarURL: post.author.avatar ?? post.author.avatarUrl,
                    stories: [newItem]
                )
                storyGroups.insert(newGroup, at: 0)
            }

            showStoryComposer = false
        } catch {
            publishError = "Failed to publish story"
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
        loadedVideoURLs: [String: URL] = [:]
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

        // DEBUG Bug3: log effects just before sending to server
        if let objects = updatedEffects.mediaObjects, !objects.isEmpty {
            NSLog("[Bug3][publishStorySingle] SENDING mediaObjects=%@", objects.map { "id=\($0.id) x=\($0.x) y=\($0.y) scale=\($0.scale) rotation=\($0.rotation) postMediaId=\($0.postMediaId)" }.joined(separator: " | "))
        }

        let post = try await postService.createStory(
            content: content,
            storyEffects: updatedEffects,
            visibility: "PUBLIC",
            mediaIds: allMediaIds.isEmpty ? nil : allMediaIds
        )

        // Toujours utiliser post.media (l'API retourne tous les médias associés).
        // Fallback local uniquement si l'API ne retourne rien.
        let apiMedia = (post.media ?? []).map { m in
            FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbnailColor: "4ECDC4",
                      width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
        }
        let media: [FeedMedia]
        if !apiMedia.isEmpty {
            media = apiMedia
        } else if let uploaded = uploadResult {
            media = [FeedMedia(id: uploaded.id, type: .image, url: uploaded.fileUrl,
                               thumbnailColor: "4ECDC4", width: uploaded.width, height: uploaded.height)]
        } else {
            media = []
        }
        let newItem = StoryItem(id: post.id, content: post.content, media: media,
                                 storyEffects: updatedEffects, createdAt: post.createdAt, isViewed: true)

        if let idx = storyGroups.firstIndex(where: { $0.id == post.author.id }) {
            var updated = storyGroups[idx].stories
            updated.append(newItem)
            storyGroups[idx] = StoryGroup(
                id: storyGroups[idx].id,
                username: storyGroups[idx].username,
                avatarColor: storyGroups[idx].avatarColor,
                avatarURL: storyGroups[idx].avatarURL,
                stories: updated
            )
        } else {
            storyGroups.insert(StoryGroup(
                id: post.author.id,
                username: post.author.name,
                avatarColor: DynamicColorGenerator.colorForName(post.author.name),
                avatarURL: post.author.avatar ?? post.author.avatarUrl,
                stories: [newItem]
            ), at: 0)
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
                        storyGroups[i] = StoryGroup(
                            id: storyGroups[i].id,
                            username: storyGroups[i].username,
                            avatarColor: storyGroups[i].avatarColor,
                            avatarURL: storyGroups[i].avatarURL,
                            stories: updated
                        )
                    }
                    break
                }
            }
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
                        // Existing author — append stories
                        var updated = self.storyGroups[idx].stories
                        for story in newGroup.stories where !updated.contains(where: { $0.id == story.id }) {
                            updated.append(story)
                        }
                        self.storyGroups[idx] = StoryGroup(
                            id: self.storyGroups[idx].id,
                            username: self.storyGroups[idx].username,
                            avatarColor: self.storyGroups[idx].avatarColor,
                            stories: updated
                        )
                    } else {
                        // New author — insert at beginning
                        self.storyGroups.insert(newGroup, at: 0)
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.storyViewed
            .receive(on: DispatchQueue.main)
            .sink { _ in
                // Story view counts are shown in the story viewer, refresh if needed
                // For now this is a no-op — the seen-by list is fetched on demand
            }
            .store(in: &cancellables)
    }

    // MARK: - Sample Data Fallback

    private func fallbackToSampleData() {
        // No-op: sample data disabled, show empty state instead
    }

    static let sampleGroups: [StoryGroup] = {
        let now = Date()
        return [
            StoryGroup(
                id: "user_me",
                username: "Moi",
                avatarColor: "FF2E63",
                stories: [
                    StoryItem(
                        id: "s1",
                        content: "Premier jour de vacances!",
                        media: [.image(url: "https://picsum.photos/id/1035/1080/1920", color: "FF6B6B")],
                        storyEffects: StoryEffects(textStyle: "bold", textColor: "FFFFFF", textPosition: "center", textSize: 30, textBg: "000000"),
                        createdAt: now.addingTimeInterval(-3600),
                        expiresAt: now.addingTimeInterval(72000),
                        isViewed: true
                    )
                ]
            ),
            StoryGroup(
                id: "user_alice",
                username: "Alice",
                avatarColor: DynamicColorGenerator.colorForName("Alice"),
                stories: [
                    StoryItem(
                        id: "s2",
                        content: nil,
                        media: [.image(url: "https://picsum.photos/id/1015/1080/1920", color: "4ECDC4")],
                        storyEffects: nil,
                        createdAt: now.addingTimeInterval(-7200),
                        expiresAt: now.addingTimeInterval(68400),
                        isViewed: false
                    ),
                    StoryItem(
                        id: "s3",
                        content: "Sunset vibes",
                        media: [.image(url: "https://picsum.photos/id/1040/1080/1920", color: "FF6B6B")],
                        storyEffects: StoryEffects(background: nil, textStyle: "bold", textColor: "FFFFFF", textPosition: "bottom", filter: "warm", stickers: nil),
                        createdAt: now.addingTimeInterval(-3600),
                        expiresAt: now.addingTimeInterval(72000),
                        isViewed: false
                    )
                ]
            ),
            StoryGroup(
                id: "user_bob",
                username: "Bob",
                avatarColor: DynamicColorGenerator.colorForName("Bob"),
                stories: [
                    StoryItem(
                        id: "s4",
                        content: "New project launch!",
                        media: [],
                        storyEffects: StoryEffects(background: "9B59B6", textStyle: "neon", textColor: "FFFFFF", textPosition: "center", filter: nil, stickers: ["🚀"], textBg: "000000"),
                        createdAt: now.addingTimeInterval(-5400),
                        expiresAt: now.addingTimeInterval(70200),
                        isViewed: true
                    )
                ]
            ),
            StoryGroup(
                id: "user_sarah",
                username: "Sarah",
                avatarColor: DynamicColorGenerator.colorForName("Sarah"),
                stories: [
                    StoryItem(
                        id: "s5",
                        content: nil,
                        media: [.image(url: "https://picsum.photos/id/1025/1080/1920", color: "F8B500")],
                        storyEffects: StoryEffects(background: nil, textStyle: nil, textColor: nil, textPosition: nil, filter: "vintage", stickers: nil),
                        createdAt: now.addingTimeInterval(-1800),
                        expiresAt: now.addingTimeInterval(73800),
                        isViewed: false
                    ),
                    StoryItem(
                        id: "s6",
                        content: "Cooking time 🍝",
                        media: [.image(url: "https://picsum.photos/id/292/1080/1920", color: "2ECC71")],
                        storyEffects: StoryEffects(textStyle: "bold", textColor: "FFFFFF", textPosition: "bottom", textBg: "000000"),
                        createdAt: now.addingTimeInterval(-900),
                        expiresAt: now.addingTimeInterval(74700),
                        isViewed: false
                    )
                ]
            ),
            StoryGroup(
                id: "user_emma",
                username: "Emma",
                avatarColor: DynamicColorGenerator.colorForName("Emma"),
                stories: [
                    StoryItem(
                        id: "s7",
                        content: "Morning run done!",
                        media: [],
                        storyEffects: StoryEffects(background: "08D9D6", textStyle: nil, textColor: "0F0C29", textPosition: "top", filter: nil, stickers: ["💪", "🏃‍♀️"]),
                        createdAt: now.addingTimeInterval(-10800),
                        expiresAt: now.addingTimeInterval(64800),
                        isViewed: false
                    ),
                    StoryItem(
                        id: "s8",
                        content: nil,
                        media: [.image(url: "https://picsum.photos/id/1069/1080/1920", color: "E91E63")],
                        storyEffects: nil,
                        createdAt: now.addingTimeInterval(-7200),
                        expiresAt: now.addingTimeInterval(68400),
                        isViewed: false
                    ),
                    StoryItem(
                        id: "s9",
                        content: "Best coffee ever ☕",
                        media: [],
                        storyEffects: StoryEffects(background: "F8B500", textStyle: "handwriting", textColor: "FFFFFF", textPosition: "center", filter: "warm", stickers: nil, textAlign: "right", textSize: 28),
                        createdAt: now.addingTimeInterval(-3600),
                        expiresAt: now.addingTimeInterval(72000),
                        isViewed: false
                    )
                ]
            )
        ]
    }()
}
