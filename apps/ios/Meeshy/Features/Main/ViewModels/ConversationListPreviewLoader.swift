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

/// Les quatre états que l'aperçu sait DIRE : il charge, il montre, il n'a
/// rien (CONSTATÉ par le serveur), ou il n'a rien pu lire — un échec réseau
/// sur une ligne froide ne prouve pas qu'une conversation est vide.
enum ConversationPreviewPhase: Equatable {
    case loading
    case loaded
    case empty
    case unavailable
    /// La conversation est verrouillée par PIN : aucun message ne se lit.
    case sealed
}

/// Les derniers messages servis, leurs traductions, et celle que le Prisme du
/// lecteur élit pour chacun (`servedTranslation`, `nil` ⇒ l'original).
struct ConversationPreviewSnapshot {
    let messages: [Message]
    let translations: [String: [MessageTranslation]]
    let served: [String: MessageTranslation]
    /// Les messages arrivés EN CLAIR dans une conversation chiffrée
    /// (`EndToEndPlaintextLaw`, #11380) : marqués, et sans traduction.
    var unencrypted: Set<String> = []

    func isUnencrypted(_ messageId: String) -> Bool {
        unencrypted.contains(messageId)
    }

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
        let isUnencrypted: Bool
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
                    servedLanguage: snapshot.servedLanguage(for: message.id),
                    isUnencrypted: snapshot.isUnencrypted(message.id)
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
        case unavailable
        case sealed

        var phase: ConversationPreviewPhase {
            switch self {
            case .loading: return .loading
            case .loaded: return .loaded
            case .empty: return .empty
            case .unavailable: return .unavailable
            case .sealed: return .sealed
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

    /// D'où vient ce qui est servi. Le réseau ne recule jamais devant le
    /// cache (le chargeur n'écrit pas dans `CacheCoordinator.messages`, qui
    /// garde donc une version plus ancienne), et seul un cache FRAIS ou le
    /// réseau dispensent `.ensure` de revalider.
    private enum Provenance {
        case staleCache
        case freshCache
        case network
    }

    @Published private(set) var states: [String: PreviewState] = [:]
    /// Le chargement en vol, par conversation. Une OUVERTURE qui le trouve
    /// l'attend puis revalide : un préchargement en cours ne la fait jamais
    /// tomber (l'aperçu ouvert garderait sinon ce que le cache avait).
    private var inFlight: [String: InFlight] = [:]
    private var provenance: [String: Provenance] = [:]
    /// Le régime de chiffrement de chaque conversation chargée — celui que la
    /// liste sert, fusionné avec celui que l'appareil retient : la loi du clair
    /// (#11380) le lit à chaque publication.
    private var regimes: [String: EndToEndRegime] = [:]
    private let regimeMemory: any EndToEndRegimeMemoryProviding

    private struct InFlight {
        let token: UUID
        let intent: LoadIntent
        let task: Task<Void, Never>
    }
    private let messageService: MessageServiceProviding
    private let cache: ConversationPreviewCacheProviding
    private let readerPrism: () -> [String]
    private let isLocked: @MainActor (String) -> Bool

    init(
        messageService: MessageServiceProviding,
        cache: ConversationPreviewCacheProviding = LiveConversationPreviewCache(),
        readerPrism: @escaping () -> [String] = { ReaderPrism.resolve(for: AuthManager.shared.currentUser) },
        isLocked: @escaping @MainActor (String) -> Bool = { ConversationLockManager.shared.hidesContent(of: $0) },
        regimeMemory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory.shared
    ) {
        self.messageService = messageService
        self.regimeMemory = regimeMemory
        self.cache = cache
        self.readerPrism = readerPrism
        self.isLocked = isLocked
    }

    /// Une conversation jamais chargée se lit `.loading` : l'aperçu n'affirme
    /// jamais « Aucun message » avant de l'avoir constaté.
    /// Une conversation verrouillée se lit `.sealed`, quoi que le chargeur ait
    /// déjà servi : le verrou posé APRÈS un chargement ne laisse rien lisible.
    func state(for conversationId: String) -> PreviewState {
        guard !isLocked(conversationId) else { return .sealed }
        return states[conversationId] ?? .loading
    }

    func fingerprint(for conversationId: String) -> ConversationPreviewFingerprint {
        ConversationPreviewFingerprint(state: state(for: conversationId))
    }

    /// Projection héritée (menu < iOS 26, témoins du VM) : les messages servis.
    var messages: [String: [Message]] {
        states.filter { !isLocked($0.key) }.compactMapValues { $0.snapshot?.messages }
    }

    func load(
        for conversationId: String,
        intent: LoadIntent,
        regime: EndToEndRegime = .serverReadable,
        currentUserId: @escaping @MainActor @Sendable () -> String = { "" }
    ) async {
        regimes[conversationId] = regimeMemory.resolve(conversationId: conversationId, served: regime)
        guard !isLocked(conversationId) else {
            states[conversationId] = nil
            provenance[conversationId] = nil
            return
        }
        while let running = inFlight[conversationId] {
            await running.task.value
            guard running.intent.reach < intent.reach else { return }
        }
        guard !isSettled(conversationId, for: intent) else { return }
        let token = UUID()
        // Le chargement se RETIRE lui-même du registre avant de rendre la
        // main : celui qui l'attendait relit donc un registre déjà à jour,
        // quel que soit l'ordre dans lequel les deux continuations reprennent.
        let task = Task { [weak self] in
            guard let self else { return }
            await self.perform(conversationId, intent: intent, currentUserId: currentUserId)
            if self.inFlight[conversationId]?.token == token { self.inFlight[conversationId] = nil }
        }
        inFlight[conversationId] = InFlight(token: token, intent: intent, task: task)
        await task.value
    }

    private func perform(
        _ conversationId: String,
        intent: LoadIntent,
        currentUserId: @escaping @MainActor @Sendable () -> String
    ) async {
        let cached = await cache.messages(for: conversationId)
        // Verrouillée PENDANT la lecture du cache (#11387) : rien de lu ne se
        // publie, et le réseau ne revalide pas.
        guard !isLocked(conversationId) else { return }
        let fromCache = Self.cachedMessages(in: cached)
        if let fromCache, provenance[conversationId] != .network {
            let translations = await cache.translations(for: fromCache.map(\.id))
            publish(fromCache, translations: translations, for: conversationId)
            provenance[conversationId] = Self.isFresh(cached) ? .freshCache : .staleCache
        }
        guard Self.needsNetwork(intent: intent, cached: cached) else { return }
        if states[conversationId]?.snapshot == nil, states[conversationId]?.phase != .empty {
            states[conversationId] = .loading
        }
        await refresh(conversationId, plaintextSources: fromCache ?? [], currentUserId: currentUserId)
    }

    // MARK: - Lois pures

    /// Un message chiffré se lit en clair dans l'aperçu si sa PROVENANCE
    /// couvre le texte qu'il porte (#11382) : c'est cet appareil qui l'a
    /// déchiffré, et personne ne l'a réécrit depuis — le moteur de
    /// synchronisation peut réécrire le cache depuis le REST (le
    /// cryptogramme), et le serveur forger un texte qui n'en a pas la forme.
    /// Jamais deviné à la forme du texte. Un message qui se DÉCLARE en clair
    /// (`isEncrypted == false`) dans une conversation chiffrée est jugé par
    /// `EndToEndPlaintextLaw` (#11380), la loi que le fil lit aussi : signalé,
    /// pas scellé, tant que #11404 n'a pas mesuré les envois en clair légitimes.
    static func isReadableOnDevice(_ message: Message) -> Bool {
        message.isEncrypted && message.isContentDecryptedOnDevice
    }

    /// L'aperçu tel que le lecteur le lit : un message chiffré que sa
    /// provenance ne prouve pas déchiffré sur l'appareil n'emporte que son
    /// drapeau (jamais le cryptogramme comme texte), aucun message chiffré
    /// n'emporte de traduction, aucun message de l'ère chiffrée d'une
    /// conversation non plus — le serveur ne le lit pas, donc il ne le traduit
    /// pas (#11380) —, et chaque message sert la
    /// traduction que `ReaderPrism` élit — `nil` ⇒ l'original, jamais
    /// `translations.first`.
    static func snapshot(
        messages: [Message],
        translations: [String: [MessageTranslation]],
        prism: [String],
        regime: EndToEndRegime = .serverReadable
    ) -> ConversationPreviewSnapshot {
        let sealed = messages.map { Self.isReadableOnDevice($0) ? $0 : Self.sealedForPreview($0) }
        let unencrypted = Set(sealed.filter { EndToEndPlaintextLaw.standing(of: $0, in: regime).isUnencrypted }.map(\.id))
        let wireWithheld = Set(sealed.filter { !regime.admitsWireTranslations(forMessageCreatedAt: $0.createdAt) }.map(\.id))
        let withheldIds = Set(sealed.filter { $0.isEncrypted || Self.holdsBurnOnRead($0) }.map(\.id))
            .union(unencrypted)
            .union(wireWithheld)
        let readable = translations.filter { !withheldIds.contains($0.key) }
        let served = sealed.reduce(into: [String: MessageTranslation]()) { served, message in
            guard let candidates = readable[message.id],
                  let elected = Self.servedTranslation(of: message, among: candidates, prism: prism) else { return }
            served[message.id] = elected
        }
        return ConversationPreviewSnapshot(messages: sealed, translations: readable, served: served, unencrypted: unencrypted)
    }

    /// **Une flamme « après lecture » reçue ne se lit pas dans la liste.** La
    /// liste n'est pas une lecture : l'ouvrir au fil la consomme, l'aperçu la
    /// livrerait répétable, sans jamais déclencher la combustion (même loi que
    /// l'appui long d'un message, qui ne montre ni ne consomme ce qui brûle).
    /// Les vues uniques, les supprimés et les échus se disent d'eux-mêmes dans
    /// la bulle (`BubbleContent.Kind`) ; la flamme à durée se lit comme le fil.
    static func holdsBurnOnRead(_ message: Message) -> Bool {
        !message.isMe && message.exitOffer.nature == .afterReadFlame
    }

    private static func sealedForPreview(_ message: Message) -> Message {
        guard message.isEncrypted || holdsBurnOnRead(message) else { return message }
        var sealed = message
        sealed.content = ""
        if holdsBurnOnRead(message) { sealed.attachments = [] }
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

    private static func isFresh(_ result: CacheResult<[Message]>) -> Bool {
        guard case .fresh = result else { return false }
        return true
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

    /// `.prefetch` s'arrête dès que quelque chose est servi ; `.ensure`, dès
    /// que ce qui est servi est À JOUR (cache frais ou réseau) — un cache
    /// périmé servi par un préchargement se revalide encore.
    private func isSettled(_ conversationId: String, for intent: LoadIntent) -> Bool {
        switch intent {
        case .open: return false
        case .prefetch: return provenance[conversationId] != nil
        case .ensure: return provenance[conversationId].map { $0 != .staleCache } ?? false
        }
    }

    private func publish(
        _ messages: [Message],
        translations: [String: [MessageTranslation]],
        for conversationId: String
    ) {
        guard !isLocked(conversationId) else { return }
        let snapshot = Self.snapshot(
            messages: messages, translations: translations, prism: readerPrism(),
            regime: regimes[conversationId] ?? regimeMemory.resolve(conversationId: conversationId, served: .serverReadable)
        )
        states[conversationId] = messages.isEmpty ? .empty : .loaded(snapshot)
    }

    /// Les messages chiffrés dont l'appareil a DÉJÀ le clair : le REST ne
    /// rend que leur cryptogramme, et le revalider ne doit pas effacer ce que
    /// le lecteur lisait. Le clair est celui d'une VERSION — d'où le message
    /// entier, pas son seul texte.
    private func plaintextOnDevice(_ conversationId: String, sources: [Message]) -> [String: Message] {
        let served = states[conversationId]?.snapshot?.messages ?? []
        return (sources + served)
            .filter { !$0.content.isEmpty && Self.isReadableOnDevice($0) }
            .reduce(into: [String: Message]()) { known, message in known[message.id] = message }
    }

    /// Le clair connu ne recouvre le cryptogramme REST que pour la MÊME
    /// version du message : modifié (nouveau cryptogramme) ou supprimé depuis
    /// le déchiffrement, il reste scellé. Fail-closed.
    static func isSameVersion(_ known: Message, as rest: Message) -> Bool {
        guard known.deletedAt == nil, rest.deletedAt == nil else { return false }
        return isSameInstant(known.editedAt, rest.editedAt)
    }

    private static func isSameInstant(_ lhs: Date?, _ rhs: Date?) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil): return true
        case let (lhs?, rhs?): return abs(lhs.timeIntervalSince(rhs)) < 0.001
        default: return false
        }
    }

    private func refresh(
        _ conversationId: String,
        plaintextSources: [Message],
        currentUserId: @MainActor @Sendable () -> String
    ) async {
        let onDevice = plaintextOnDevice(conversationId, sources: plaintextSources)
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: Self.previewLimit,
                includeReplies: false, includeTranslations: true
            )
            guard !isLocked(conversationId) else { return }
            let userId = currentUserId()
            let username = AuthManager.shared.currentUser?.username
            let prism = readerPrism()
            let ordered = Array(response.data.reversed())
            let decoded = ordered.map { api -> Message in
                var message = api.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: prism)
                message.editedAt = api.editedAt
                return message
            }
            // Le clair connu recouvre le cryptogramme AVEC sa provenance : la
            // revalidation suivante le reconnaît encore.
            let messages = decoded.map { message -> Message in
                guard message.isEncrypted, let known = onDevice[message.id], Self.isSameVersion(known, as: message) else {
                    return message
                }
                var clear = message
                clear.carryDecryptedContent(from: known)
                return clear
            }
            let translations = ordered.reduce(into: [String: [MessageTranslation]]()) { map, api in
                let readable = (api.translations ?? []).filter { $0.isEncrypted != true }
                guard !readable.isEmpty else { return }
                map[api.id] = MessageTranslationMerge.translations(from: readable, originalLanguage: api.originalLanguage)
            }
            publish(messages, translations: translations, for: conversationId)
            provenance[conversationId] = .network
        } catch {
            Logger.messages.warning("[ConversationList] previewMessages fetch failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            guard states[conversationId]?.phase == .loading else { return }
            states[conversationId] = .unavailable
        }
    }
}
