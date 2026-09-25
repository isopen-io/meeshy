import Foundation
import Combine
import MeeshySDK
import os

/// Snapshot of a starred message so we can surface it in the dedicated
/// "Starred Messages" list even after the source bubble is edited, deleted
/// for everyone, or its conversation is archived. Mirrors WhatsApp's
/// Starred Messages screen where each row renders without needing the
/// original conversation to be open or cached.
struct StarredMessageSnapshot: Codable, Identifiable, Equatable, Sendable {
    let id: String              // Server-assigned message id (canonical key)
    let conversationId: String
    let conversationName: String?
    let conversationAccentColor: String?
    let senderUserId: String?
    let senderName: String?
    var contentPreview: String
    let attachmentKind: String?  // "image" / "video" / "audio" / "file" / "location"
    let starredAt: Date
    let sentAt: Date
}

/// Persistent set of messages the user has starred (bookmarked). Local-only
/// (the backend does not yet have a message-level star endpoint), survives
/// kills via UserDefaults, and publishes a Combine stream so the
/// `StarredMessagesView` can react without polling.
@MainActor
final class StarredMessagesStore: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = StarredMessagesStore()

    @Published private(set) var snapshots: [StarredMessageSnapshot] = []

    private let defaults: UserDefaults
    private let storageKey = "meeshy_starred_messages"
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private var cancellables = Set<AnyCancellable>()

    init(userDefaults: UserDefaults = .standard) {
        self.defaults = userDefaults
        self.snapshots = Self.load(from: userDefaults, decoder: decoder)
        wireAuthLogoutHook()
    }

    /// cache-09 (#7146) — pattern calqué sur `ConversationLockManager` : à la
    /// déconnexion, les favoris du compte sortant partent.
    ///
    /// Ce magasin garde `contentPreview` — le TEXTE du message — avec le nom de
    /// la conversation et celui de l'expéditeur, sous une clé `UserDefaults`
    /// commune à tous les comptes. Sans ce câblage, l'écran « Favoris » du
    /// compte B rendait les messages du compte A. `clearAll()` existait bien,
    /// mais son seul appelant est le bouton « tout effacer » de l'écran : une
    /// action volontaire de l'utilisateur, jamais une purge de session.
    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.resetForLogout() }
            .store(in: &cancellables)
    }

    /// Purge inconditionnelle — contrairement à `clearAll()`, ne s'abstient pas
    /// quand la liste en mémoire est vide : le disque peut porter des entrées
    /// qu'aucun chargement n'a encore reprises.
    private func resetForLogout() {
        snapshots.removeAll()
        defaults.removeObject(forKey: storageKey)
    }

    // MARK: - Public API

    func isStarred(messageId: String) -> Bool {
        snapshots.contains { $0.id == messageId }
    }

    /// Toggle and return the resulting state (`true` if starred after the call).
    @discardableResult
    func toggle(_ snapshot: StarredMessageSnapshot) -> Bool {
        if let idx = snapshots.firstIndex(where: { $0.id == snapshot.id }) {
            snapshots.remove(at: idx)
            persist()
            return false
        } else {
            // Insert sorted by `starredAt` desc so the UI doesn't have to
            // re-sort on every publish.
            let idx = snapshots.firstIndex { $0.starredAt < snapshot.starredAt } ?? snapshots.endIndex
            snapshots.insert(snapshot, at: idx)
            persist()
            return true
        }
    }

    func remove(messageId: String) {
        guard let idx = snapshots.firstIndex(where: { $0.id == messageId }) else { return }
        snapshots.remove(at: idx)
        persist()
    }

    /// Keep the starred snapshot's preview in sync after the source message is
    /// edited. The snapshot is a frozen copy (so the Starred list renders
    /// without the conversation being cached), so an edit elsewhere would
    /// otherwise leave the row showing stale content. No-op when the message
    /// isn't starred.
    func updatePreview(messageId: String, contentPreview: String) {
        guard let idx = snapshots.firstIndex(where: { $0.id == messageId }),
              snapshots[idx].contentPreview != contentPreview else { return }
        snapshots[idx].contentPreview = contentPreview
        persist()
    }

    /// #7939 — une étoile posée depuis un AUTRE appareil. Idempotent : un
    /// message déjà étoilé garde son instantané (jamais de bascule, contrairement
    /// à `toggle`), puisque le même `message:starred` revient aussi à l'appareil
    /// qui l'a posé.
    func placeRemote(
        _ source: StarredMessageSource, starredAt: Date,
        conversationName: String?, conversationAccentColor: String?
    ) {
        guard !isStarred(messageId: source.messageId) else { return }
        let preview: String = {
            guard source.contentPreview.isEmpty else { return source.contentPreview }
            guard let kind = source.attachmentKind.flatMap(MediaKindLabel.kind(forAttachmentRawValue:)) else { return "" }
            return MediaKindLabel.summary(kind)
        }()
        toggle(StarredMessageSnapshot(
            id: source.messageId,
            conversationId: source.conversationId,
            conversationName: conversationName,
            conversationAccentColor: conversationAccentColor,
            senderUserId: nil,
            senderName: source.senderName,
            contentPreview: String(preview.prefix(280)),
            attachmentKind: source.attachmentKind,
            starredAt: starredAt,
            sentAt: source.sentAt
        ))
    }

    func snapshot(for messageId: String) -> StarredMessageSnapshot? {
        snapshots.first { $0.id == messageId }
    }

    func removeAll(conversationId: String) {
        let before = snapshots.count
        snapshots.removeAll { $0.conversationId == conversationId }
        if snapshots.count != before { persist() }
    }

    func clearAll() {
        guard !snapshots.isEmpty else { return }
        snapshots.removeAll()
        defaults.removeObject(forKey: storageKey)
    }

    // MARK: - Persistence

    private func persist() {
        guard let data = encoder.encodeOrLog(snapshots, field: "starred messages", logger: Logger.starred) else { return }
        defaults.set(data, forKey: storageKey)
    }

    private static func load(from defaults: UserDefaults, decoder: JSONDecoder) -> [StarredMessageSnapshot] {
        guard let data = defaults.data(forKey: "meeshy_starred_messages") else { return [] }
        return decoder.decodeOrLog([StarredMessageSnapshot].self, from: data, field: "starred messages", logger: Logger.starred) ?? []
    }
}

// MARK: - Relais temps réel (#7939)

extension StarredMessagesStore {
    /// Ce qu'une mutation du relais de conversation FERMÉE fait aux favoris —
    /// le pendant de `ConversationSocketHandler`, qui ne tient que la
    /// conversation ouverte. Une étoile posée d'un autre appareil compose son
    /// instantané depuis GRDB (le message absent du cache n'en compose aucun) ;
    /// un message étoilé modifié met l'aperçu à jour ; supprimé ou désétoilé,
    /// il quitte les favoris.
    nonisolated static func follow(
        _ mutation: RealtimeMessageMutation,
        persistence: MessagePersistenceActor,
        store: StarredMessagesStore? = nil,
        conversationLookup: @escaping @Sendable (String) async -> MeeshyConversation? = { await cachedConversation(id: $0) }
    ) async {
        switch mutation {
        case let .starred(messageId, conversationId, starredAt):
            let languages = await MessagePersistenceActor.readerPrism()
            let source: StarredMessageSource?
            do {
                source = try persistence.starredSource(messageId: messageId, preferredLanguages: languages)
            } catch {
                Logger.starred.error("starredSource failed \(messageId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                return
            }
            guard let source else { return }
            let conversation = await conversationLookup(conversationId)
            await MainActor.run {
                (store ?? .shared).placeRemote(
                    source, starredAt: starredAt,
                    conversationName: conversation?.name, conversationAccentColor: conversation?.accentColor
                )
            }
        case let .unstarred(messageId), let .deleted(messageId, _):
            await MainActor.run { (store ?? .shared).remove(messageId: messageId) }
        case let .edited(messageId, content, _):
            await MainActor.run { (store ?? .shared).updatePreview(messageId: messageId, contentPreview: content) }
        case .callNoticeUpdated, .reactionAdded, .reactionRemoved, .consumed, .viewOnceOpened:
            return
        }
    }

    nonisolated private static func cachedConversation(id: String) async -> MeeshyConversation? {
        await CacheCoordinator.shared.conversations.load(for: "list").snapshot()?.first { $0.id == id }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let starred = Logger(subsystem: "me.meeshy.app", category: "starred-store")
}
