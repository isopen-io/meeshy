import Foundation
import Combine
import MeeshySDK
import os

// MARK: - La galerie d'une conversation feuillette TOUS ses médias (#8095)
//
// Directive porteur du 2026-09-26 : « la vue des médias doit charger et
// permettre de naviguer sur TOUS les attachements d'une conversation, même ceux
// qui ne sont pas visibles ou n'ont pas été chargés […] le téléchargement des
// médias doit se faire lorsqu'on ouvre un média ».
//
// Deux choses distinctes, et ce type ne fait que la première : il sait QUELLES
// pièces existent — leurs métadonnées, leur porteur, leur auteur, leur légende.
// Les OCTETS restent l'affaire de la galerie, dont la fenêtre de rendu bornée
// (±1 page en plein format, aperçu thumbHash / vignette ailleurs) ne télécharge
// que ce qu'on regarde. Un index de mille photos ne coûte donc que mille lignes
// de métadonnées — jamais mille téléchargements.

// MARK: - Persistance de l'index

/// Où l'index des porteurs de médias se garde entre deux ouvertures.
protocol ConversationMediaIndexStoring: Sendable {
    func load(conversationId: String) async -> CacheResult<[MeeshyMessage]>
    func save(_ carriers: [MeeshyMessage], conversationId: String) async
    /// La remontée a-t-elle atteint le PREMIER média de la conversation ?
    func isComplete(conversationId: String) async -> Bool
    func markComplete(_ complete: Bool, conversationId: String) async
}

/// L'index persisté dans `CacheCoordinator.conversationMedia` (GRDB, chiffré,
/// purgé avec le compte). L'épuisement se range dans le curseur du store :
/// `hasMore == false` ⇔ plus rien d'ancien à remonter.
struct CachedConversationMediaIndexStore: ConversationMediaIndexStoring {
    func load(conversationId: String) async -> CacheResult<[MeeshyMessage]> {
        await CacheCoordinator.shared.conversationMedia.load(for: conversationId)
    }

    func save(_ carriers: [MeeshyMessage], conversationId: String) async {
        try? await CacheCoordinator.shared.conversationMedia.save(carriers, for: conversationId)
    }

    func isComplete(conversationId: String) async -> Bool {
        await CacheCoordinator.shared.conversationMedia.loadCursor(for: conversationId)?.hasMore == false
    }

    func markComplete(_ complete: Bool, conversationId: String) async {
        await CacheCoordinator.shared.conversationMedia.saveCursor(nextCursor: nil, hasMore: !complete, for: conversationId)
    }
}

// MARK: - Ce que la galerie lit

/// Une photographie de la source, recalculée à chaque changement — la galerie
/// ne lit que des valeurs déjà prêtes, jamais une fusion à refaire par rendu.
struct ConversationMediaSnapshot {
    /// Les pièces feuilletables, dans l'ordre chronologique de leurs porteurs.
    let attachments: [MessageAttachment]
    /// Le message qui porte chaque pièce — celui de la fenêtre quand il y est.
    let carriers: [String: MeeshyMessage]
    /// Les pièces dont le porteur est dans la fenêtre du `ConversationViewModel`.
    let loadedAttachmentIds: Set<String>
    /// Auteur et légende des pièces que SEUL l'index connaît. Celles de la
    /// fenêtre viennent des projections du ViewModel, qui tiennent ses bascules
    /// de langue manuelles.
    let senderInfo: [String: ConversationViewModel.MediaSenderInfo]
    let captions: [String: String]

    static let empty = ConversationMediaSnapshot(
        attachments: [], carriers: [:], loadedAttachmentIds: [], senderInfo: [:], captions: [:]
    )

    func carrier(ofAttachment id: String) -> MeeshyMessage? { carriers[id] }

    func isLoaded(_ attachmentId: String) -> Bool { loadedAttachmentIds.contains(attachmentId) }
}

// MARK: - Le catalogue

@MainActor
protocol ConversationMediaCatalogProviding: AnyObject {
    var snapshot: ConversationMediaSnapshot { get }
    func syncLive(_ messages: [MeeshyMessage], serverId: (String) -> String)
    func open(preferredLanguages: [String])
    func close()
}

@MainActor
final class ConversationMediaCatalog: ObservableObject, ConversationMediaCatalogProviding {

    @Published private(set) var snapshot: ConversationMediaSnapshot = .empty

    private let conversationId: String
    private let messageService: MessageServiceProviding
    private let store: ConversationMediaIndexStoring
    private let currentUserId: () -> String
    private let isHidden: (String) -> Bool
    private let now: () -> Date
    private let pageSize: Int

    private var live: [MeeshyMessage] = []
    private var liveKeys: Set<String> = []
    private var indexed: [String: MeeshyMessage] = [:]
    /// Les traductions des porteurs indexés, prises dans les pages : la légende
    /// d'une pièce que la fenêtre n'a pas chargée descend le Prisme comme les
    /// autres. Mémoire seule — un index relu du disque sert l'original jusqu'à
    /// la prochaine page.
    private var indexedTranslations: [String: [String: String]] = [:]
    private var preferredLanguages: [String] = []
    private var backfill: Task<Void, Never>?
    private var cursor = Cursor.head(before: nil)
    /// La remontée a déjà atteint le premier média de la conversation : la
    /// tête suffit à revalider.
    private var isComplete = false

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "media-index")

    /// Où en est la remontée : la TÊTE (du plus récent jusqu'au premier porteur
    /// déjà connu) puis la QUEUE (depuis le plus ancien connu jusqu'au premier
    /// média de la conversation).
    private enum Cursor {
        case head(before: String?)
        case tail(before: String)
        case done
    }

    init(
        conversationId: String,
        messageService: MessageServiceProviding = MessageService.shared,
        store: ConversationMediaIndexStoring = CachedConversationMediaIndexStore(),
        currentUserId: @escaping () -> String = { AuthManager.shared.currentUser?.id ?? "" },
        isHidden: @escaping (String) -> Bool = { LocallyHiddenMessagesStore.shared.isHidden($0) },
        now: @escaping () -> Date = Date.init,
        pageSize: Int = 50
    ) {
        self.conversationId = conversationId
        self.messageService = messageService
        self.store = store
        self.currentUserId = currentUserId
        self.isHidden = isHidden
        self.now = now
        self.pageSize = pageSize
    }

    // MARK: - La fenêtre

    /// La fenêtre de messages du ViewModel — elle GAGNE sur l'index : ses
    /// messages sont plus frais (réactions, légendes, suppressions). `serverId`
    /// relie une ligne optimiste à son identifiant serveur, pour qu'une photo
    /// qu'on vient d'envoyer ne se feuillette pas deux fois.
    func syncLive(_ messages: [MeeshyMessage], serverId: (String) -> String) {
        live = messages
        liveKeys = messages.reduce(into: Set<String>()) { keys, message in
            keys.insert(message.id)
            keys.insert(serverId(message.id))
            if let clientId = message.clientMessageId { keys.insert(clientId) }
        }
        publish()
    }

    // MARK: - Cycle de vie

    /// La galerie s'ouvre : l'index persisté se peint aussitôt, puis la
    /// remontée part en arrière-plan. Chaque page ne retient le catalogue que le
    /// temps d'elle-même — le quitter l'arrête à la page suivante.
    func open(preferredLanguages: [String]) {
        backfill?.cancel()
        self.preferredLanguages = preferredLanguages
        backfill = Task { [weak self] in
            guard await self?.serveCache() == true else { return }
            while !Task.isCancelled {
                guard let more = await self?.fetchNextPage(), more else { return }
            }
        }
    }

    /// La galerie se ferme : la remontée s'arrête et le catalogue lâche tout
    /// ce qu'il tenait. L'index reste sur disque, d'où la prochaine ouverture
    /// le repeint aussitôt — rien ne reste en mémoire pour un écran quitté.
    func close() {
        backfill?.cancel()
        backfill = nil
        live = []
        liveKeys = []
        indexed = [:]
        indexedTranslations = [:]
        cursor = .done
        snapshot = .empty
    }

    /// Le chemin ATTENDU de `open` — cache, puis remontée jusqu'à épuisement.
    func load(preferredLanguages: [String]) async {
        self.preferredLanguages = preferredLanguages
        guard await serveCache() else { return }
        while !Task.isCancelled, await fetchNextPage() {}
    }

    // MARK: - Cache d'abord

    /// Peint l'index persisté, puis dit s'il reste à revalider : un index FRAIS
    /// et COMPLET se sert tel quel, sans réseau.
    private func serveCache() async -> Bool {
        let cached = await store.load(conversationId: conversationId)
        let complete = await store.isComplete(conversationId: conversationId)
        guard !Task.isCancelled else { return false }
        switch cached {
        case .fresh(let carriers, _):
            ingest(carriers)
            if complete { return false }
        case .stale(let carriers, _):
            ingest(carriers)
        case .expired, .empty:
            break
        }
        isComplete = complete
        cursor = .head(before: nil)
        return !Task.isCancelled
    }

    // MARK: - Réseau ensuite

    /// Une page de plus. Rend `false` quand il n'y a plus rien à demander — ou
    /// que le serveur ne suit pas : un 400 `INVALID_VIEW` (passerelle antérieure
    /// à la vue) ou une coupure réseau laissent l'index tel quel, sans erreur
    /// visible. La galerie a déjà la fenêtre et le cache.
    private func fetchNextPage() async -> Bool {
        let before: String?
        switch cursor {
        case .head(let cursorId): before = cursorId
        case .tail(let cursorId): before = cursorId
        case .done: return false
        }
        let knownBefore = Set(indexed.keys)
        let response: MessagesAPIResponse
        do {
            response = try await messageService.listMedia(
                conversationId: conversationId, before: before,
                limit: pageSize, languages: preferredLanguages
            )
        } catch {
            Self.logger.info("media index: remontée suspendue (\(String(describing: error), privacy: .public))")
            cursor = .done
            return false
        }
        guard !Task.isCancelled else { return false }

        let carriers = response.data.map { api in
            api.toMessage(currentUserId: currentUserId(), preferredLanguages: preferredLanguages)
        }
        rememberTranslations(of: response.data)
        ingest(carriers)
        await store.save(sortedIndex(), conversationId: conversationId)

        let hasMore = response.cursorPagination?.hasMore
            ?? response.pagination?.hasMore
            ?? (response.data.count >= pageSize)
        guard hasMore, let oldest = response.cursorPagination?.nextCursor ?? carriers.last?.id else {
            cursor = .done
            isComplete = true
            await store.markComplete(true, conversationId: conversationId)
            return !Task.isCancelled
        }
        cursor = nextCursor(after: cursor, oldestOfPage: oldest,
                            metKnown: carriers.contains { knownBefore.contains($0.id) },
                            broughtNothing: carriers.allSatisfy { knownBefore.contains($0.id) })
        return !Task.isCancelled
    }

    /// La TÊTE descend jusqu'au premier porteur déjà connu ; à partir de là,
    /// l'index est continu jusqu'à son plus ancien — la QUEUE reprend donc
    /// derrière lui, sauf si la remontée avait déjà atteint le premier média.
    /// Une page qui n'apporte rien arrête tout : un serveur qui rendrait la
    /// même page en boucle ne fait pas tourner la remontée.
    private func nextCursor(after current: Cursor, oldestOfPage: String,
                            metKnown: Bool, broughtNothing: Bool) -> Cursor {
        switch current {
        case .head where !metKnown:
            return .head(before: oldestOfPage)
        case .head:
            guard !isComplete, let tailStart = oldestIndexedId() else { return .done }
            return .tail(before: tailStart)
        case .tail where !broughtNothing:
            return .tail(before: oldestOfPage)
        case .tail, .done:
            return .done
        }
    }

    // MARK: - Fusion

    private func ingest(_ carriers: [MeeshyMessage]) {
        for carrier in carriers { indexed[carrier.id] = carrier }
        publish()
    }

    private func rememberTranslations(of messages: [APIMessage]) {
        for message in messages {
            guard let translations = message.translations, !translations.isEmpty else { continue }
            indexedTranslations[message.id] = translations.reduce(into: [String: String]()) { map, translation in
                map[translation.targetLanguage] = translation.translatedContent
            }
        }
    }

    private func sortedIndex() -> [MeeshyMessage] {
        indexed.values.sorted(by: Self.chronological)
    }

    private func oldestIndexedId() -> String? {
        indexed.values.min(by: Self.chronological)?.id
    }

    private static func chronological(_ lhs: MeeshyMessage, _ rhs: MeeshyMessage) -> Bool {
        lhs.createdAt == rhs.createdAt ? lhs.id < rhs.id : lhs.createdAt < rhs.createdAt
    }

    private func publish() {
        let instant = now()
        let indexedOnly = indexed.values.filter { carrier in
            !liveKeys.contains(carrier.id) && !(carrier.clientMessageId.map(liveKeys.contains) ?? false)
        }
        let admitted = (live + indexedOnly)
            .filter { ConversationMediaRules.admits($0, now: instant, isHidden: isHidden) }
            .sorted(by: Self.chronological)
        let liveIds = Set(live.map(\.id))

        var attachments: [MessageAttachment] = []
        var carriers: [String: MeeshyMessage] = [:]
        var loaded: Set<String> = []
        var senderInfo: [String: ConversationViewModel.MediaSenderInfo] = [:]
        var captions: [String: String] = [:]
        for carrier in admitted {
            let isLive = liveIds.contains(carrier.id)
            let pieces = carrier.attachments.filter { ConversationMediaRules.isVisual($0) && carriers[$0.id] == nil }
            guard !pieces.isEmpty else { continue }
            attachments.append(contentsOf: pieces)
            pieces.forEach { carriers[$0.id] = carrier }
            if isLive {
                pieces.forEach { loaded.insert($0.id) }
                continue
            }
            let info = ConversationMediaRules.senderInfo(of: carrier)
            pieces.forEach { senderInfo[$0.id] = info }
            captions.merge(ConversationMediaRules.captions(of: carrier, servedText: servedText(of: carrier))) { _, latest in latest }
        }
        snapshot = ConversationMediaSnapshot(
            attachments: attachments, carriers: carriers, loadedAttachmentIds: loaded,
            senderInfo: senderInfo, captions: captions
        )
    }

    private func servedText(of carrier: MeeshyMessage) -> String {
        guard let translations = indexedTranslations[carrier.id] else { return carrier.content }
        return PrismTranslationResolver.resolve(
            originalLanguage: carrier.originalLanguage,
            translations: translations,
            preferredLanguages: preferredLanguages
        )?.text ?? carrier.content
    }
}
