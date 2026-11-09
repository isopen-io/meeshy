import AVFoundation
import Combine
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
    /// `conversationId` : celle que la passerelle a choisie pour le repli ; `nil`, le client choisit.
    @discardableResult
    func send(_ frames: [Data], toUserId: String, conversationId: String?) async -> Bool
    /// Une copie confiée à la file d'envoi que celle-ci a fini par abandonner : l'émetteur doit le voir (#17255).
    var failures: AnyPublisher<Void, Never> { get }
}

extension TalkieVoiceCopying {
    var failures: AnyPublisher<Void, Never> { Empty().eraseToAnyPublisher() }

    @discardableResult
    func send(_ frames: [Data], toUserId: String) async -> Bool {
        await send(frames, toUserId: toUserId, conversationId: nil)
    }
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
///
/// Le fichier est FERMÉ avant de rendre la main, et la durée rendue est celle qu'on relit sur le disque (#17255) : la
/// passerelle a reçu une copie de 820 octets lue « 128 ms » pendant que l'iPhone en affichait 7 s — la file d'envoi
/// copiait un `.m4a` dont les derniers paquets et l'atome `moov` n'étaient pas encore écrits. La fermeture d'un
/// `AVAudioFile` attend sa désallocation (avant iOS 18), qu'une référence autoreleasée peut repousser au-delà du retour.
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
        let written: Bool = autoreleasepool {
            do {
                let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: first.format.commonFormat, interleaved: first.format.isInterleaved)
                try buffers.filter { $0.format == first.format }.forEach(file.write(from:))
                if #available(iOS 18.0, *) { file.close() }
                return true
            } catch {
                return false
            }
        }
        guard written, let duration = recordedDuration(of: url) else {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return duration
    }

    private static func recordedDuration(of url: URL) -> TimeInterval? {
        autoreleasepool {
            guard let file = try? AVAudioFile(forReading: url), file.length > 0 else { return nil }
            return Double(file.length) / file.fileFormat.sampleRate
        }
    }
}

/// Le câblage de la copie : écrire le fichier, choisir la conversation, la confier à la file d'envoi durable.
///
/// La file rejoue un message sous son `clientMessageId`, que la passerelle exige au format `cid_<uuid v4>` : un autre
/// format était refusé à la validation du `message:send-with-attachments`, et la file retéléversait la voix à chaque
/// essai sans jamais créer le message (#17255). Le cid vient donc de `ClientMessageId`, et l'abandon d'une copie par la
/// file remonte en `failures`.
@MainActor
final class TalkieVoiceCopySender: TalkieVoiceCopying {
    typealias SharedConversations = @MainActor (String) async throws -> [TalkieCopyCandidate]
    typealias DirectOpener = @MainActor (String) async throws -> String
    /// Le fichier, la conversation, et le `clientMessageId` sous lequel la file enverra le message.
    typealias Enqueuer = @MainActor (URL, String, String) async throws -> Void

    private let shared: SharedConversations
    private let openDirect: DirectOpener
    private let enqueue: Enqueuer
    private let writeFile: ([Data], URL) -> TimeInterval?
    private let directory: URL
    private let newClientMessageId: () -> String
    private let failed = PassthroughSubject<Void, Never>()
    /// Les copies confiées à la file et pas encore tranchées : seul leur abandon se dit.
    private var queued: Set<String> = []
    private var exhaustion: AnyCancellable?

    nonisolated deinit {}

    init(
        shared: @escaping SharedConversations = TalkieVoiceCopySender.liveShared,
        openDirect: @escaping DirectOpener = TalkieVoiceCopySender.liveOpenDirect,
        enqueue: @escaping Enqueuer = TalkieVoiceCopySender.liveEnqueue,
        writeFile: @escaping ([Data], URL) -> TimeInterval? = TalkieVoiceCopyFile.write,
        directory: URL = FileManager.default.temporaryDirectory,
        exhausted: AnyPublisher<String, Never> = TalkieVoiceCopySender.liveExhausted,
        newClientMessageId: @escaping () -> String = ClientMessageId.generate
    ) {
        self.shared = shared
        self.openDirect = openDirect
        self.enqueue = enqueue
        self.writeFile = writeFile
        self.directory = directory
        self.newClientMessageId = newClientMessageId
        exhaustion = exhausted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] clientMessageId in
                MainActor.assumeIsolated { self?.abandoned(clientMessageId) }
            }
    }

    var failures: AnyPublisher<Void, Never> { failed.eraseToAnyPublisher() }

    @discardableResult
    func send(_ frames: [Data], toUserId: String, conversationId named: String?) async -> Bool {
        let url = directory.appendingPathComponent("talkie-copy-\(UUID().uuidString).m4a")
        guard !frames.isEmpty, writeFile(frames, url) != nil else { return false }
        let clientMessageId = newClientMessageId()
        do {
            let conversationId = if let named { named } else { try await destination(for: toUserId) }
            queued.insert(clientMessageId)
            try await enqueue(url, conversationId, clientMessageId)
            Logger.talkieCopy.info("talkie · copie vocale confiée à la file d'envoi")
            return true
        } catch {
            queued.remove(clientMessageId)
            try? FileManager.default.removeItem(at: url)
            Logger.talkieCopy.error("talkie · copie vocale non partie : \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func abandoned(_ clientMessageId: String) {
        guard queued.remove(clientMessageId) != nil else { return }
        Logger.talkieCopy.error("talkie · copie vocale abandonnée par la file d'envoi")
        failed.send(())
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

    static var liveExhausted: AnyPublisher<String, Never> {
        OfflineQueue.shared.retryExhausted.publisher.map(\.clientMessageId).eraseToAnyPublisher()
    }

    static func liveEnqueue(_ url: URL, _ conversationId: String, _ clientMessageId: String) async throws {
        _ = try await OfflineQueue.shared.enqueueMedia(
            sourceMediaURLs: [url],
            kinds: [AttachmentKind.audio.rawValue],
            conversationId: conversationId,
            content: nil,
            clientMessageId: clientMessageId,
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
