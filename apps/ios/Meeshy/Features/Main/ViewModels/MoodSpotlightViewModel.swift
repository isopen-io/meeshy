import Foundation
import MeeshySDK
import os

/// La page plein écran d'une humeur reçue (#10814) : l'humeur, son auteur, et
/// la réponse qu'on lui écrit.
///
/// Cache d'abord : une humeur et un profil déjà en cache se montrent sans
/// attendre, le réseau revalide en silence. La réponse est OPTIMISTE — le champ
/// se vide au départ et retrouve le texte si l'envoi échoue.
@MainActor
final class MoodSpotlightViewModel: ObservableObject {
    nonisolated deinit {}

    enum Content: Equatable {
        case loading
        case mood(StatusEntry)
        case unavailable

        static func == (lhs: Content, rhs: Content) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.unavailable, .unavailable): return true
            case (.mood(let a), .mood(let b)):
                return a.id == b.id && a.content == b.content && a.moodEmoji == b.moodEmoji && a.expiresAt == b.expiresAt
            default: return false
            }
        }
    }

    enum ReplyState: Equatable {
        case idle
        case sending
        case sent
        case failed
    }

    @Published private(set) var content: Content = .loading
    @Published private(set) var author: MeeshyUser?
    @Published var replyText = ""
    @Published private(set) var replyState: ReplyState = .idle

    let statusId: String
    private var viewRecorded = false
    private let source: MoodSpotlightSourcing
    private let sender: MoodReplySending
    private let currentUserId: @MainActor () -> String?
    private let now: @MainActor () -> Date

    init(
        statusId: String,
        source: MoodSpotlightSourcing = MoodSpotlightSource(),
        sender: MoodReplySending = MoodReplySender(),
        currentUserId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        now: @escaping @MainActor () -> Date = { Date() }
    ) {
        self.statusId = statusId
        self.source = source
        self.sender = sender
        self.currentUserId = currentUserId
        self.now = now
    }

    var entry: StatusEntry? {
        if case .mood(let entry) = content { return entry }
        return nil
    }

    /// On ne répond pas à sa propre humeur, ni à une humeur absente.
    var canReply: Bool {
        guard let entry else { return false }
        return entry.userId != currentUserId()
    }

    var canSend: Bool {
        canReply && replyState != .sending && !trimmedReply.isEmpty
    }

    private var trimmedReply: String {
        replyText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func load() async {
        if let cached = await source.cachedEntry(statusId: statusId), isLive(cached) {
            present(cached)
            await loadAuthor(of: cached)
        }
        do {
            guard let fresh = try await source.fetchEntry(statusId: statusId), isLive(fresh) else {
                content = .unavailable
                return
            }
            let authorChanged = entry?.userId != fresh.userId
            present(fresh)
            if authorChanged || author == nil { await loadAuthor(of: fresh) }
        } catch {
            if entry == nil { content = .unavailable }
            Logger.moodSpotlight.error("Mood not refreshed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func sendReply() async {
        guard canSend, let entry else { return }
        let text = trimmedReply
        replyText = ""
        replyState = .sending
        do {
            _ = try await sender.sendReply(text, to: entry)
            replyState = .sent
        } catch {
            if replyText.isEmpty { replyText = text }
            replyState = .failed
            Logger.moodSpotlight.error("Mood reply failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func present(_ entry: StatusEntry) {
        content = .mood(entry)
        guard !viewRecorded, entry.userId != currentUserId() else { return }
        viewRecorded = true
        let source = source
        let statusId = entry.id
        Task { await source.recordView(statusId: statusId) }
    }

    private func isLive(_ entry: StatusEntry) -> Bool {
        guard let expiresAt = entry.expiresAt else { return true }
        return expiresAt > now()
    }

    private func loadAuthor(of entry: StatusEntry) async {
        if author == nil, let cached = await source.cachedAuthor(userId: entry.userId) {
            author = cached
        }
        do {
            author = try await source.fetchAuthor(userId: entry.userId)
        } catch {
            Logger.moodSpotlight.error("Mood author not refreshed: \(error.localizedDescription, privacy: .public)")
        }
    }
}

extension Logger {
    nonisolated static let moodSpotlight = MeeshyLog.logger(.moodSpotlight)
}
