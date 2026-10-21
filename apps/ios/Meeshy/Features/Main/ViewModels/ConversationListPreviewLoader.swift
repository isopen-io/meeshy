import Foundation
import os
import MeeshySDK

/// Ce que l'aperçu lit du cache local : les messages GRDB d'une conversation
/// et les traductions déjà connues de ces messages. Couture de test du
/// chargeur, qui ne touche jamais `CacheCoordinator` en direct.
@MainActor
protocol ConversationPreviewCacheProviding {
    func messages(for conversationId: String) async -> CacheResult<[Message]>
    func translations(for messageIds: [String]) async -> [String: [MessageTranslation]]
}

struct LiveConversationPreviewCache: ConversationPreviewCacheProviding {
    func messages(for conversationId: String) async -> CacheResult<[Message]> {
        await CacheCoordinator.shared.messages.load(for: conversationId)
    }

    func translations(for messageIds: [String]) async -> [String: [MessageTranslation]] {
        let cached = await CacheCoordinator.shared.cachedTranslations(for: messageIds)
        return cached.mapValues { MessageTranslationMerge.translations(from: $0) }
    }
}

/// Les trois états que l'aperçu sait DIRE : il charge, il montre, il n'a rien.
enum ConversationPreviewPhase: Equatable {
    case loading
    case loaded
    case empty
}

/// Les derniers messages servis, leurs traductions, et celle que le Prisme du
/// lecteur élit pour chacun (`servedTranslation`, `nil` ⇒ l'original).
struct ConversationPreviewSnapshot {
    let messages: [Message]
    let translations: [String: [MessageTranslation]]
    let served: [String: MessageTranslation]

    func servedTranslation(for messageId: String) -> MessageTranslation? {
        served[messageId]
    }

    func servedLanguage(for messageId: String) -> String? {
        served[messageId]?.targetLanguage
    }

    func servedText(for message: Message) -> String {
        served[message.id]?.translatedContent ?? message.content
    }
}

/// L'empreinte d'un aperçu : assez pour qu'un message MODIFIÉ, supprimé ou
/// servi dans une autre langue ré-évalue la rangée, quand le nombre de
/// messages, seul comparé jusque-là, ne bouge pas.
struct ConversationPreviewFingerprint: Equatable {
    struct Entry: Equatable {
        let id: String
        let updatedAt: Date
        let editedAt: Date?
        let deletedAt: Date?
        let servedLanguage: String?
    }

    let phase: ConversationPreviewPhase
    let entries: [Entry]

    init(state: ConversationListPreviewLoader.PreviewState) {
        phase = state.phase
        entries = state.snapshot.map { snapshot in
            snapshot.messages.map { message in
                Entry(
                    id: message.id,
                    updatedAt: message.updatedAt,
                    editedAt: message.editedAt,
                    deletedAt: message.deletedAt,
                    servedLanguage: snapshot.servedLanguage(for: message.id)
                )
            }
        } ?? []
    }
}

/// Les cinq derniers messages d'une conversation, lus pour l'aperçu d'appui
/// long — cache GRDB d'abord, réseau ensuite (#11212).
///
/// PUBLIÉ, mais seule la sous-vue FEUILLE de l'aperçu l'observe : la liste le
/// tient par référence sans s'y abonner (un `ObservableObject` imbriqué ne
/// remonte rien à son hôte), donc un aperçu qui se charge ne ré-évalue aucune
/// rangée.
@MainActor
final class ConversationListPreviewLoader: ObservableObject {
    nonisolated deinit {}

    enum PreviewState {
        case loading
        case loaded(ConversationPreviewSnapshot)
        case empty

        var phase: ConversationPreviewPhase {
            switch self {
            case .loading: return .loading
            case .loaded: return .loaded
            case .empty: return .empty
            }
        }

        var snapshot: ConversationPreviewSnapshot? {
            guard case .loaded(let snapshot) = self else { return nil }
            return snapshot
        }

        var messages: [Message] { snapshot?.messages ?? [] }
    }

    /// Pourquoi on charge, et donc jusqu'où on va.
    enum LoadIntent {
        /// Rangée visible : le cache seul, jamais le réseau — l'aperçu natif
        /// est déjà prêt quand l'appui long le présente.
        case prefetch
        /// Une fois par conversation : cache, puis réseau si le cache manque
        /// ou a vieilli (SWR). Déjà servi ⇒ rien.
        case ensure
        /// L'aperçu s'ouvre : ce qui est servi reste à l'écran et le réseau
        /// revalide EN SILENCE, à chaque ouverture — un message modifié
        /// apparaît à la réouverture.
        case open

        /// Jusqu'où le chargement va : un chargement en vol qui va au moins
        /// aussi loin sert celui qui l'attend.
        fileprivate var reach: Int {
            switch self {
            case .prefetch: return 0
            case .ensure: return 1
            case .open: return 2
            }
        }
    }

    static let previewLimit = 5

    @Published private(set) var states: [String: PreviewState] = [:]
    /// Le chargement en vol, par conversation. Une OUVERTURE qui le trouve
    /// l'attend puis revalide : un préchargement en cours ne la fait jamais
    /// tomber (l'aperçu ouvert garderait sinon ce que le cache avait).
    private var inFlight: [String: InFlight] = [:]

    private struct InFlight {
        let token: UUID
        let intent: LoadIntent
        let task: Task<Void, Never>
    }
    private let messageService: MessageServiceProviding
    private let cache: ConversationPreviewCacheProviding
    private let readerPrism: () -> [String]

    init(
        messageService: MessageServiceProviding,
        cache: ConversationPreviewCacheProviding = LiveConversationPreviewCache(),
        readerPrism: @escaping () -> [String] = { ReaderPrism.resolve(for: AuthManager.shared.currentUser) }
    ) {
        self.messageService = messageService
        self.cache = cache
        self.readerPrism = readerPrism
    }

    /// Une conversation jamais chargée se lit `.loading` : l'aperçu n'affirme
    /// jamais « Aucun message » avant de l'avoir constaté.
    func state(for conversationId: String) -> PreviewState {
        states[conversationId] ?? .loading
    }

    func fingerprint(for conversationId: String) -> ConversationPreviewFingerprint {
        ConversationPreviewFingerprint(state: state(for: conversationId))
    }

    /// Projection héritée (menu < iOS 26, témoins du VM) : les messages servis.
    var messages: [String: [Message]] {
        states.compactMapValues { $0.snapshot?.messages }
    }

    func load(
        for conversationId: String,
        intent: LoadIntent,
        currentUserId: @escaping @MainActor @Sendable () -> String = { "" }
    ) async {
        while let running = inFlight[conversationId] {
            await running.task.value
            guard running.intent.reach < intent.reach else { return }
        }
        guard !isSettled(conversationId, for: intent) else { return }
        let token = UUID()
        let task = Task { [weak self] in
            guard let self else { return }
            await self.perform(conversationId, intent: intent, currentUserId: currentUserId)
        }
        inFlight[conversationId] = InFlight(token: token, intent: intent, task: task)
        await task.value
        if inFlight[conversationId]?.token == token { inFlight[conversationId] = nil }
    }

    private func perform(
        _ conversationId: String,
        intent: LoadIntent,
        currentUserId: @escaping @MainActor @Sendable () -> String
    ) async {
        let cached = await cache.messages(for: conversationId)
        let fromCache = Self.cachedMessages(in: cached)
        if let fromCache {
            let translations = await cache.translations(for: fromCache.map(\.id))
            publish(fromCache, translations: translations, for: conversationId)
        }
        guard Self.needsNetwork(intent: intent, cached: cached) else { return }
        if states[conversationId] == nil { states[conversationId] = .loading }
        await refresh(conversationId, currentUserId: currentUserId)
    }

    // MARK: - Lois pures

    /// L'aperçu tel que le lecteur le lit : un message chiffré non déchiffré
    /// n'emporte que son drapeau (jamais le cryptogramme comme texte, ni ses
    /// traductions), et chaque message sert la traduction que `ReaderPrism`
    /// élit — `nil` ⇒ l'original, jamais `translations.first`.
    static func snapshot(
        messages: [Message],
        translations: [String: [MessageTranslation]],
        prism: [String]
    ) -> ConversationPreviewSnapshot {
        let sealed = messages.map { Self.sealedForPreview($0) }
        let encryptedIds = Set(sealed.filter { $0.isEncrypted }.map(\.id))
        let readable = translations.filter { !encryptedIds.contains($0.key) }
        let served = sealed.reduce(into: [String: MessageTranslation]()) { served, message in
            guard let candidates = readable[message.id],
                  let elected = Self.servedTranslation(of: message, among: candidates, prism: prism) else { return }
            served[message.id] = elected
        }
        return ConversationPreviewSnapshot(messages: sealed, translations: readable, served: served)
    }

    private static func sealedForPreview(_ message: Message) -> Message {
        guard message.isEncrypted else { return message }
        var sealed = message
        sealed.content = ""
        return sealed
    }

    private static func servedTranslation(
        of message: Message, among candidates: [MessageTranslation], prism: [String]
    ) -> MessageTranslation? {
        PrismTranslationResolver.resolve(
            originalLanguage: message.originalLanguage,
            candidates: candidates.map { PrismCandidate(language: $0.targetLanguage, value: $0) },
            preferredLanguages: prism,
            isServable: { !$0.translatedContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )?.value
    }

    private static func cachedMessages(in result: CacheResult<[Message]>) -> [Message]? {
        switch result {
        case .fresh(let data, _), .stale(let data, _):
            return data.isEmpty ? nil : Array(data.suffix(previewLimit))
        case .expired, .empty:
            return nil
        }
    }

    private static func needsNetwork(intent: LoadIntent, cached: CacheResult<[Message]>) -> Bool {
        switch (intent, cached) {
        case (.prefetch, _): return false
        case (.open, _): return true
        case (.ensure, .fresh(let data, _)): return data.isEmpty
        case (.ensure, .stale), (.ensure, .expired), (.ensure, .empty): return true
        }
    }

    // MARK: - État

    private func isSettled(_ conversationId: String, for intent: LoadIntent) -> Bool {
        guard intent != .open, let state = states[conversationId] else { return false }
        return state.phase != .loading
    }

    private func publish(_ messages: [Message], translations: [String: [MessageTranslation]], for conversationId: String) {
        let snapshot = Self.snapshot(messages: messages, translations: translations, prism: readerPrism())
        states[conversationId] = messages.isEmpty ? .empty : .loaded(snapshot)
    }

    private func refresh(_ conversationId: String, currentUserId: @MainActor @Sendable () -> String) async {
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: Self.previewLimit,
                includeReplies: false, includeTranslations: true
            )
            let userId = currentUserId()
            let username = AuthManager.shared.currentUser?.username
            let prism = readerPrism()
            let ordered = Array(response.data.reversed())
            let messages = ordered.map {
                $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: prism)
            }
            let translations = ordered.reduce(into: [String: [MessageTranslation]]()) { map, api in
                let readable = (api.translations ?? []).filter { $0.isEncrypted != true }
                guard !readable.isEmpty else { return }
                map[api.id] = MessageTranslationMerge.translations(from: readable, originalLanguage: api.originalLanguage)
            }
            publish(messages, translations: translations, for: conversationId)
        } catch {
            Logger.messages.warning("[ConversationList] previewMessages fetch failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            guard states[conversationId]?.phase == .loading else { return }
            states[conversationId] = .empty
        }
    }
}
