import AVFoundation
import Foundation
import MeeshySDK
import os

private extension Logger {
    nonisolated static let talkieCopy = MeeshyLog.logger(.audioRecorder)
}

/// Ce qui fait partir la COPIE VOCALE d'un talkie qui n'a pas pu passer (#17141, précision du porteur) :
/// la voix captée devient un message vocal dans la conversation la plus RÉCENTE avec ce destinataire.
@MainActor
protocol TalkieVoiceCopying: AnyObject {
    /// `frames` : les trames AAC ADTS captées, dans l'ordre. `false` : rien n'est parti.
    @discardableResult
    func send(_ frames: [Data], toUserId: String) async -> Bool
}

/// Une conversation où la copie peut partir : ce qu'il faut savoir pour choisir, rien de plus.
nonisolated struct TalkieCopyCandidate: Equatable, Sendable {
    let id: String
    let type: String
    let encryptionMode: String?
    let isMember: Bool?
    let isActive: Bool?
    let isAnnouncementChannel: Bool?
    let writeRestricted: Bool
    let rankAt: Date?

    init(
        id: String, type: String, encryptionMode: String? = nil, isMember: Bool? = nil, isActive: Bool? = nil,
        isAnnouncementChannel: Bool? = nil, writeRestricted: Bool = false, rankAt: Date?
    ) {
        self.id = id
        self.type = type
        self.encryptionMode = encryptionMode
        self.isMember = isMember
        self.isActive = isActive
        self.isAnnouncementChannel = isAnnouncementChannel
        self.writeRestricted = writeRestricted
        self.rankAt = rankAt
    }

    init(_ served: APIConversation) {
        self.init(
            id: served.id,
            type: served.type,
            encryptionMode: served.encryptionMode,
            isMember: served.isMember,
            isActive: served.isActive,
            isAnnouncementChannel: served.isAnnouncementChannel,
            writeRestricted: served.viewerWriteRestriction != nil,
            rankAt: served.listRankAt ?? served.lastMessageAt ?? served.updatedAt
        )
    }

    /// Un vocal en clair est refusé dans une conversation chiffrée (fail-closed) : elle n'est jamais choisie, pas plus
    /// qu'un salon public, une chaîne d'annonces ou une conversation où je n'écris pas.
    var mayCarryTheCopy: Bool {
        encryptionMode != "e2ee"
            && !["global", "public"].contains(type)
            && isMember != false
            && isActive != false
            && isAnnouncementChannel != true
            && !writeRestricted
    }
}

nonisolated enum TalkieCopyDestination {
    /// La conversation partagée la plus récente qui peut porter la copie ; `nil` : il faudra ouvrir le direct.
    static func pick(among candidates: [TalkieCopyCandidate]) -> String? {
        candidates
            .filter(\.mayCarryTheCopy)
            .max { ($0.rankAt ?? .distantPast) < ($1.rankAt ?? .distantPast) }?
            .id
    }
}

/// La copie vocale sur le disque : les trames ADTS décodées puis réécrites en AAC dans un conteneur `.m4a`, le format
/// des vocaux de Meeshy.
nonisolated enum TalkieVoiceCopyFile {
    static func write(_ frames: [Data], to url: URL) -> TimeInterval? {
        let decoder = TalkieAdtsStreamDecoder()
        let buffers = frames.compactMap(decoder.pcm)
        guard let first = buffers.first else { return nil }
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: first.format.sampleRate,
            AVNumberOfChannelsKey: first.format.channelCount,
        ]
        do {
            let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: first.format.commonFormat, interleaved: first.format.isInterleaved)
            try buffers.filter { $0.format == first.format }.forEach(file.write(from:))
        } catch {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        let frameCount = buffers.reduce(0) { $0 + Double($1.frameLength) }
        return frameCount / first.format.sampleRate
    }
}

/// Le câblage de la copie : écrire le fichier, choisir la conversation, la confier à la file d'envoi durable.
@MainActor
final class TalkieVoiceCopySender: TalkieVoiceCopying {
    typealias SharedConversations = @MainActor (String) async throws -> [TalkieCopyCandidate]
    typealias DirectOpener = @MainActor (String) async throws -> String
    typealias Enqueuer = @MainActor (URL, String) async throws -> Void

    private let shared: SharedConversations
    private let openDirect: DirectOpener
    private let enqueue: Enqueuer
    private let writeFile: ([Data], URL) -> TimeInterval?
    private let directory: URL

    nonisolated deinit {}

    init(
        shared: @escaping SharedConversations = TalkieVoiceCopySender.liveShared,
        openDirect: @escaping DirectOpener = TalkieVoiceCopySender.liveOpenDirect,
        enqueue: @escaping Enqueuer = TalkieVoiceCopySender.liveEnqueue,
        writeFile: @escaping ([Data], URL) -> TimeInterval? = TalkieVoiceCopyFile.write,
        directory: URL = FileManager.default.temporaryDirectory
    ) {
        self.shared = shared
        self.openDirect = openDirect
        self.enqueue = enqueue
        self.writeFile = writeFile
        self.directory = directory
    }

    @discardableResult
    func send(_ frames: [Data], toUserId: String) async -> Bool {
        let url = directory.appendingPathComponent("talkie-copy-\(UUID().uuidString).m4a")
        guard !frames.isEmpty, writeFile(frames, url) != nil else { return false }
        do {
            let conversationId = try await destination(for: toUserId)
            try await enqueue(url, conversationId)
            Logger.talkieCopy.info("talkie · copie vocale confiée à la file d'envoi")
            return true
        } catch {
            try? FileManager.default.removeItem(at: url)
            Logger.talkieCopy.error("talkie · copie vocale non partie : \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func destination(for userId: String) async throws -> String {
        let candidates = (try? await shared(userId)) ?? []
        if let picked = TalkieCopyDestination.pick(among: candidates) { return picked }
        return try await openDirect(userId)
    }
}

extension TalkieVoiceCopySender {
    static func liveShared(_ userId: String) async throws -> [TalkieCopyCandidate] {
        try await ConversationService.shared.listSharedWith(userId: userId).map(TalkieCopyCandidate.init)
    }

    static func liveOpenDirect(_ userId: String) async throws -> String {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        return try await ConversationCreator().createDirectConversation(with: userId, currentUserId: currentUserId).id
    }

    static func liveEnqueue(_ url: URL, _ conversationId: String) async throws {
        _ = try await OfflineQueue.shared.enqueueMedia(
            sourceMediaURLs: [url],
            kinds: [AttachmentKind.audio.rawValue],
            conversationId: conversationId,
            content: nil,
            clientMessageId: UUID().uuidString,
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            copyAttachmentsFromClientMessageId: nil,
            deletesSourceFiles: true,
            createdAt: Date()
        )
    }
}
