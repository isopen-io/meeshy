//
//  MediaGalleryViewModel.swift
//  Meeshy
//
//  ViewModel for conversation media gallery
//  Handles loading, caching, and organizing attachments by type
//  UPDATED: Uses offset/limit pagination pattern
//

import SwiftUI

// MARK: - Media Item with Message Context

struct MediaItemWithContext: Identifiable, Equatable {
    let id: String
    let attachment: Attachment
    let messageId: String
    let senderId: String?
    let senderName: String?
    let senderAvatar: String?
    let sentAt: Date

    static func == (lhs: MediaItemWithContext, rhs: MediaItemWithContext) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Media Gallery ViewModel

@MainActor
final class MediaGalleryViewModel: ObservableObject {
    let conversationId: String

    // MARK: - Published Properties

    @Published var photos: [MediaItemWithContext] = []
    @Published var videos: [MediaItemWithContext] = []
    @Published var audios: [MediaItemWithContext] = []
    @Published var documents: [MediaItemWithContext] = []
    @Published var links: [LinkItemWithContext] = []

    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: String?

    @Published var hasMorePhotos = true
    @Published var hasMoreVideos = true
    @Published var hasMoreAudios = true
    @Published var hasMoreDocuments = true

    // MARK: - Private Properties (Offset-based Pagination)

    private var photosOffset = 0
    private var videosOffset = 0
    private var audiosOffset = 0
    private var documentsOffset = 0
    private let limit = 30

    // MARK: - Initialization

    init(conversationId: String) {
        self.conversationId = conversationId
    }

    // MARK: - Load All Media

    func loadMedia() async {
        guard !isLoading else { return }

        isLoading = true
        error = nil

        // Reset pagination
        photosOffset = 0
        videosOffset = 0
        audiosOffset = 0
        documentsOffset = 0
        hasMorePhotos = true
        hasMoreVideos = true
        hasMoreAudios = true
        hasMoreDocuments = true

        // Load all types in parallel
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadPhotos(reset: true) }
            group.addTask { await self.loadVideos(reset: true) }
            group.addTask { await self.loadAudios(reset: true) }
            group.addTask { await self.loadDocuments(reset: true) }
            group.addTask { await self.loadLinks() }
        }

        isLoading = false
    }

    // MARK: - Load Photos

    func loadPhotos(reset: Bool = false) async {
        guard hasMorePhotos else { return }

        if reset {
            photos = []
            photosOffset = 0
        }

        do {
            let newItems = try await fetchAttachments(type: .image, offset: photosOffset, limit: limit)

            if newItems.count < limit {
                hasMorePhotos = false
            }

            if reset {
                photos = newItems
            } else {
                photos.append(contentsOf: newItems)
            }
            photosOffset += newItems.count

        } catch {
            self.error = "Erreur lors du chargement des photos"
            print("Failed to load photos: \(error)")
        }
    }

    // MARK: - Load Videos

    func loadVideos(reset: Bool = false) async {
        guard hasMoreVideos else { return }

        if reset {
            videos = []
            videosOffset = 0
        }

        do {
            let newItems = try await fetchAttachments(type: .video, offset: videosOffset, limit: limit)

            if newItems.count < limit {
                hasMoreVideos = false
            }

            if reset {
                videos = newItems
            } else {
                videos.append(contentsOf: newItems)
            }
            videosOffset += newItems.count

        } catch {
            self.error = "Erreur lors du chargement des vidéos"
            print("Failed to load videos: \(error)")
        }
    }

    // MARK: - Load Audios

    func loadAudios(reset: Bool = false) async {
        guard hasMoreAudios else { return }

        if reset {
            audios = []
            audiosOffset = 0
        }

        do {
            let newItems = try await fetchAttachments(type: .audio, offset: audiosOffset, limit: limit)

            if newItems.count < limit {
                hasMoreAudios = false
            }

            if reset {
                audios = newItems
            } else {
                audios.append(contentsOf: newItems)
            }
            audiosOffset += newItems.count

        } catch {
            self.error = "Erreur lors du chargement des audios"
            print("Failed to load audios: \(error)")
        }
    }

    // MARK: - Load Documents

    func loadDocuments(reset: Bool = false) async {
        guard hasMoreDocuments else { return }

        if reset {
            documents = []
            documentsOffset = 0
        }

        do {
            let newItems = try await fetchAttachments(type: .file, offset: documentsOffset, limit: limit)

            if newItems.count < limit {
                hasMoreDocuments = false
            }

            if reset {
                documents = newItems
            } else {
                documents.append(contentsOf: newItems)
            }
            documentsOffset += newItems.count

        } catch {
            self.error = "Erreur lors du chargement des fichiers"
            print("Failed to load documents: \(error)")
        }
    }

    // MARK: - Load Links

    func loadLinks() async {
        // Links are extracted from messages, not a separate API
        // For now, we'll parse links from cached messages
        do {
            let messages = await DataManager.shared.loadMessages(conversationId: conversationId, limit: 500)
            var extractedLinks: [LinkItemWithContext] = []

            for message in messages {
                let urls = extractURLs(from: message.content)
                for url in urls {
                    extractedLinks.append(LinkItemWithContext(
                        id: "\(message.id)-\(url.hashValue)",
                        url: url,
                        messageId: message.id,
                        senderId: message.senderId,
                        senderName: message.sender?.displayName,
                        sentAt: message.createdAt
                    ))
                }
            }

            links = extractedLinks

        } catch {
            print("Failed to load links: \(error)")
        }
    }

    // MARK: - Fetch Attachments

    private func fetchAttachments(type: AttachmentType, offset: Int, limit: Int) async throws -> [MediaItemWithContext] {
        // Load from local cache (messages with attachments)
        // This is more reliable as it doesn't require a separate API endpoint
        return try await fetchFromLocalCache(type: type, offset: offset, limit: limit)
    }

    private func fetchFromLocalCache(type: AttachmentType, offset: Int = 0, limit: Int = 30) async throws -> [MediaItemWithContext] {
        let messages = await DataManager.shared.loadMessages(conversationId: conversationId, limit: 1000)
        var items: [MediaItemWithContext] = []

        for message in messages {
            guard let attachments = message.attachments else { continue }

            for attachment in attachments {
                let attachmentType = attachment.attachmentType

                let matches: Bool
                switch type {
                case .image: matches = attachmentType == .image
                case .video: matches = attachmentType == .video
                case .audio: matches = attachmentType == .audio
                case .file: matches = attachmentType == .document || attachmentType == .file || attachmentType == .code || attachmentType == .text
                case .location: matches = attachmentType == .location
                }

                if matches {
                    items.append(MediaItemWithContext(
                        id: attachment.id,
                        attachment: attachment.toAttachment(),
                        messageId: message.id,
                        senderId: message.senderId,
                        senderName: message.sender?.displayName,
                        senderAvatar: message.sender?.avatar,
                        sentAt: message.createdAt
                    ))
                }
            }
        }

        // Sort by date (newest first) and paginate using offset/limit
        let sorted = items.sorted { $0.sentAt > $1.sentAt }
        let endIndex = min(offset + limit, sorted.count)

        if offset >= sorted.count {
            return []
        }

        return Array(sorted[offset..<endIndex])
    }

    // MARK: - URL Extraction

    private func extractURLs(from text: String) -> [String] {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let matches = detector?.matches(in: text, options: [], range: NSRange(location: 0, length: text.utf16.count))

        return matches?.compactMap { match in
            guard let range = Range(match.range, in: text) else { return nil }
            return String(text[range])
        } ?? []
    }

    // MARK: - Refresh

    func refresh() async {
        await loadMedia()
    }

    // MARK: - Load More

    func loadMorePhotos() async {
        guard !isLoadingMore && hasMorePhotos else { return }
        isLoadingMore = true
        await loadPhotos()
        isLoadingMore = false
    }

    func loadMoreVideos() async {
        guard !isLoadingMore && hasMoreVideos else { return }
        isLoadingMore = true
        await loadVideos()
        isLoadingMore = false
    }

    func loadMoreAudios() async {
        guard !isLoadingMore && hasMoreAudios else { return }
        isLoadingMore = true
        await loadAudios()
        isLoadingMore = false
    }

    func loadMoreDocuments() async {
        guard !isLoadingMore && hasMoreDocuments else { return }
        isLoadingMore = true
        await loadDocuments()
        isLoadingMore = false
    }

    // MARK: - Counts

    var totalCount: Int {
        photos.count + videos.count + audios.count + documents.count + links.count
    }
}

// MARK: - Link Item with Context

struct LinkItemWithContext: Identifiable {
    let id: String
    let url: String
    let messageId: String
    let senderId: String?
    let senderName: String?
    let sentAt: Date
}

// MARK: - MessageAttachment Extension

extension MessageAttachment {
    var attachmentType: AttachmentMediaType {
        AttachmentMediaType.from(mimeType: mimeType, fileName: fileName)
    }

    func toAttachment() -> Attachment {
        Attachment(
            id: id,
            type: attachmentType,
            url: fileUrl ?? "",
            fileName: fileName,
            fileSize: Int64(fileSize),
            mimeType: mimeType,
            thumbnailUrl: thumbnailUrl,
            metadata: buildMetadata(),
            createdAt: createdAt
        )
    }

    private func buildMetadata() -> [String: Any]? {
        var meta: [String: Any] = [:]

        if let duration = duration {
            meta["duration"] = duration
        }
        if let bitrate = bitrate {
            meta["bitrate"] = bitrate
        }
        if let sampleRate = sampleRate {
            meta["sampleRate"] = sampleRate
        }
        if let codec = codec {
            meta["codec"] = codec
        }
        if let channels = channels {
            meta["channels"] = channels
        }

        return meta.isEmpty ? nil : meta
    }
}
