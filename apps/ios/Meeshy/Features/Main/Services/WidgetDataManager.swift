import Foundation
import WidgetKit
import MeeshySDK
import os

// MARK: - Widget-compatible Codable models (mirrors MeeshyWidgets target)

struct WidgetConversation: Codable, Identifiable {
    let id: String
    let contactName: String
    let contactAvatar: String
    let lastMessage: String
    let timestamp: Date
    let isUnread: Bool
    let isPinned: Bool
    let accentColor: String
}

struct WidgetFavoriteContact: Codable, Identifiable {
    let id: String
    let name: String
    let avatar: String
    let status: String
    let accentColor: String
}

/// Snapshot Local-First d'une conversation, miroir-é dans l'App Group keyé par
/// `id`, pour que la NSE (notifications) et les widgets résolvent localement les
/// détails de préférence SANS requête serveur. Source de vérité = les
/// préférences LOCALES (`ConversationUserState`), qui peuvent être en avance sur
/// le backend (pas encore synchronisées). Le contrat JSON est dupliqué côté NSE
/// (`ConversationLocalSnapshot`, SDK-free) — même pattern que `WidgetConversation`.
struct ConversationSnapshotPayload: Codable {
    let id: String
    /// Type brut : direct / group / public / global / broadcast / community / channel.
    let type: String
    /// Nom canonique (titre partagé du groupe).
    let title: String?
    /// Renommage LOCAL de l'utilisateur (prioritaire à l'affichage).
    let customName: String?
    let isPinned: Bool
    let isMuted: Bool
    let isArchived: Bool
    let isLocked: Bool
    /// Emoji favori associé à la conversation (classification utilisateur).
    let favoriteEmoji: String?
    /// Nom d'une catégorie CRÉÉE PAR L'UTILISATEUR (nil pour les catégories
    /// induites/prédéfinies — elles ne s'affichent pas entre parenthèses).
    let categoryName: String?
    let accentColor: String?
    let unreadCount: Int
}

// MARK: - WidgetDataManager

/// Bridges the NotificationCoordinator to the widget shared container + WidgetKit timeline reloader.
///
/// The manager is deliberately passive — it receives pushes from `NotificationCoordinator`
/// (the single source of truth for unread counts) and keeps the App Group store aligned.
/// No direct socket subscription, no direct badge write: this class only knows about widgets.
@MainActor
final class WidgetDataManager: NotificationWidgetSink {
    static let shared = WidgetDataManager()

    private let suiteName: String
    /// Seam de test — en production, les dossiers de staging sont résolus
    /// depuis les helpers des consumers (App Group réel).
    private let stagingDirectoriesOverride: [URL]?
    private let conversationsKey = "recent_conversations"
    private let unreadCountKey = "unread_count"
    private let favoritesKey = "favorite_contacts"
    private let lastUpdatedKey = "widget_last_updated"
    /// Store keyé `[id: ConversationSnapshotPayload]` — résolution Local-First
    /// des détails de conversation pour la NSE + les widgets.
    private let snapshotsKey = "conversation_snapshots"
    /// Environnement API courant, lu par les extensions (NSE + partage).
    private let apiBaseURLKey = "meeshy_api_base_url"
    /// Borne de taille du store keyé (évite un blob App Group illimité).
    private let snapshotsCap = 500

    private lazy var sharedDefaults: UserDefaults? = {
        UserDefaults(suiteName: suiteName)
    }()

    private let encoder: JSONEncoder = {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        return enc
    }()

    private init() {
        self.suiteName = "group.me.meeshy.apps"
        self.stagingDirectoriesOverride = nil
    }

    /// Init de test (fiche appgroup-01) — suite UserDefaults et dossiers de
    /// staging injectés pour vérifier `wipeAll()` sans toucher l'App Group réel.
    init(suiteName: String, stagingDirectories: [URL]) {
        self.suiteName = suiteName
        self.stagingDirectoriesOverride = stagingDirectories
    }

    /// appgroup-01 — wipe de logout (exigence `NotificationWidgetSink`).
    ///
    /// Purge les clés widget de l'App Group ET les dossiers de staging
    /// (partages différés, blobs NSE) : le contenu du compte sortant ne doit
    /// ni rester affiché sur l'écran d'accueil ni être rejoué sous le compte
    /// suivant. Ne touche PAS `meeshy_api_base_url` (environnement, pas une
    /// donnée de compte) ni `meeshy_active_user_id` (effacé par son setter au
    /// logout) ; la base GRDB App Group est purgée par `wireOutboxLogoutHook`.
    func wipeAll() {
        if let defaults = sharedDefaults {
            let accountKeys = [
                conversationsKey, snapshotsKey, favoritesKey, lastUpdatedKey,
                unreadCountKey, WidgetActionFlusher.pendingMarkReadKey,
            ]
            for key in accountKeys {
                defaults.removeObject(forKey: key)
            }
        }
        let stagingDirs = stagingDirectoriesOverride ?? [
            SharePendingSendConsumer.directoryURL(),
            NSEPendingMessageConsumer.directoryURL(),
            NSEPendingPostConsumer.directoryURL(),
        ].compactMap { $0 }
        for dir in stagingDirs {
            do {
                try FileManager.default.removeItem(at: dir)
            } catch let error as CocoaError where error.code == .fileNoSuchFile {
                // Rien à purger — état déjà propre.
                _ = error
            } catch {
                Logger.widgetData.error("wipeAll: staging dir \(dir.lastPathComponent, privacy: .public) not removed: \(error.localizedDescription, privacy: .public)")
            }
        }
        reloadTimelines()
    }

    // MARK: - Environnement API

    /// Miroir de l'environnement API courant dans l'App Group.
    ///
    /// `NSEDataSync.resolveApiBaseURL` documente depuis toujours que « l'app
    /// principale écrit `meeshy_api_base_url` » — sans qu'aucun code ne l'ait
    /// jamais écrite : la NSE retombait donc systématiquement sur la
    /// production. Bénin pour elle (son repli EST la production), mais
    /// l'extension de partage lit la même clé et posterait, en Debug, vers
    /// `gate.meeshy.me` au lieu de `localhost:3000`. Écrire cette clé corrige
    /// les deux extensions d'un coup.
    ///
    /// Les lecteurs valident la valeur contre une allowlist et retombent sur la
    /// production si elle en sort — un environnement inattendu ne peut donc pas
    /// détourner un partage vers un hôte arbitraire.
    func publishAPIBaseURL(_ origin: String = MeeshyConfig.shared.serverOrigin) {
        sharedDefaults?.set(origin, forKey: apiBaseURLKey)
    }

    // MARK: - NotificationWidgetSink

    func publishConversations(_ conversations: [MeeshyConversation]) {
        let widgetConversations = conversations
            .sorted { ($0.userState.isPinned ? 0 : 1, $0.lastMessageAt) < ($1.userState.isPinned ? 0 : 1, $1.lastMessageAt) }
            .reversed()
            // 50 et non 10 : l'extension de partage lit cette MÊME clé pour
            // proposer ses destinations, et 10 conversations font une liste
            // frustrante. Les widgets tranchent au rendu (`.prefix(2)` /
            // `.prefix(5)` dans MeeshyWidgets.swift) et ne présument jamais de
            // la longueur du tableau — le changement leur est transparent.
            .prefix(50)
            .map { conv in
                WidgetConversation(
                    id: conv.id,
                    contactName: conv.displayName,
                    contactAvatar: conv.type == .group ? "person.3.fill" : "person.circle.fill",
                    lastMessage: formatLastMessage(conv),
                    timestamp: conv.lastMessageAt,
                    isUnread: conv.userState.unreadCount > 0,
                    isPinned: conv.userState.isPinned,
                    accentColor: conv.accentColor
                )
            }

        guard let defaults = sharedDefaults,
              let data = encoder.encodeOrLog(Array(widgetConversations), field: "widget conversations", logger: Logger.widgetData) else { return }

        defaults.set(data, forKey: conversationsKey)
        defaults.set(Date().timeIntervalSince1970, forKey: lastUpdatedKey)

        // Store keyé Local-First (toutes conversations, prefs complètes) — la
        // NSE l'interroge par conversationId pour résoudre customName + badges
        // sans requête serveur. La résolution du nom de catégorie UTILISATEUR
        // est async (acteur `UserCategoryStore`) ; le publish keyé attend donc
        // un Task, le store array du widget reste synchrone ci-dessus.
        Task { [conversations] in
            let userCategoryNamesById = await Self.resolveUserCategoryNames()
            self.publishConversationSnapshots(conversations, categoryNamesById: userCategoryNamesById)
        }
    }

    /// `[sectionId: nom]` des catégories CRÉÉES PAR L'UTILISATEUR uniquement
    /// (source `UserCategoryStore`). Les catégories induites/prédéfinies n'y
    /// figurent pas → elles ne s'afficheront pas entre parenthèses.
    private static func resolveUserCategoryNames() async -> [String: String] {
        let categories = await UserCategoryStore.shared.categories()
        return Dictionary(categories.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
    }

    /// Miroir-e le détail keyé des conversations (prefs LOCALES) dans l'App
    /// Group pour la NSE et les widgets. Map depuis `ConversationUserState`
    /// (source de vérité locale, possiblement non encore synchronisée backend).
    func publishConversationSnapshots(
        _ conversations: [MeeshyConversation],
        categoryNamesById: [String: String]
    ) {
        guard let defaults = sharedDefaults else { return }
        let snapshots: [String: ConversationSnapshotPayload] = conversations
            .prefix(snapshotsCap)
            .reduce(into: [:]) { acc, conv in
                let categoryName = conv.userState.sectionId.flatMap { categoryNamesById[$0] }
                acc[conv.id] = ConversationSnapshotPayload(
                    id: conv.id,
                    type: conv.type.rawValue,
                    title: conv.title,
                    customName: conv.userState.customName,
                    isPinned: conv.userState.isPinned,
                    isMuted: conv.userState.isMuted,
                    isArchived: conv.userState.isArchived,
                    isLocked: conv.userState.isLocked,
                    favoriteEmoji: conv.userState.reaction,
                    categoryName: categoryName,
                    accentColor: conv.accentColor,
                    unreadCount: conv.userState.unreadCount
                )
            }
        guard let data = encoder.encodeOrLog(snapshots, field: "widget snapshots", logger: Logger.widgetData) else { return }
        defaults.set(data, forKey: snapshotsKey)
    }

    /// Résolution Local-First **synchrone** de la présentation d'une
    /// conversation (nom renommé + emoji favori) pour les toasts in-app, depuis
    /// le store keyé App Group `conversation_snapshots` que ce manager maintient
    /// déjà (`publishConversationSnapshots`). Réutilise l'infra existante —
    /// aucune nouvelle source de données. Retourne `nil` si la conversation n'a
    /// pas (encore) de snapshot local → le toast retombe sur le titre serveur.
    func conversationToastPresentation(
        forId id: String
    ) -> NotificationToastManager.ConversationPresentation? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: snapshotsKey),
              let snapshots = JSONDecoder().decodeOrLog(
                  [String: ConversationSnapshotPayload].self, from: data,
                  field: "widget snapshots", logger: Logger.widgetData
              ),
              let payload = snapshots[id] else { return nil }

        let custom = payload.customName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let canonical = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = (custom?.isEmpty == false ? custom : canonical) ?? ""
        guard !name.isEmpty else { return nil }

        return NotificationToastManager.ConversationPresentation(
            name: name,
            favoriteEmoji: payload.favoriteEmoji
        )
    }

    func publishFavoriteContacts(_ conversations: [MeeshyConversation]) {
        let favorites = conversations
            .filter { $0.userState.isPinned && $0.type == .direct }
            .prefix(8)
            .map { conv in
                WidgetFavoriteContact(
                    id: conv.id,
                    name: conv.displayName,
                    avatar: "person.circle.fill",
                    status: conv.lastSeenText ?? "Offline",
                    accentColor: conv.accentColor
                )
            }

        guard let defaults = sharedDefaults,
              let data = encoder.encodeOrLog(Array(favorites), field: "widget favorites", logger: Logger.widgetData) else { return }

        defaults.set(data, forKey: favoritesKey)
    }

    func publishUnreadCount(_ count: Int) {
        sharedDefaults?.set(max(count, 0), forKey: unreadCountKey)
    }

    func reloadTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Legacy shim (kept for callers still using the old API)

    func updateConversations(_ conversations: [MeeshyConversation]) {
        publishConversations(conversations)
        publishFavoriteContacts(conversations)
        let totalUnread = conversations.reduce(0) { $0 + $1.userState.unreadCount }
        publishUnreadCount(totalUnread)
        reloadTimelines()
    }

    func updateFavoriteContacts(_ conversations: [MeeshyConversation]) {
        publishFavoriteContacts(conversations)
    }

    func updateUnreadCount(_ count: Int) {
        publishUnreadCount(count)
        reloadTimelines()
    }

    // MARK: - Private

    private func formatLastMessage(_ conv: MeeshyConversation) -> String {
        if let preview = conv.lastMessagePreview, !preview.isEmpty {
            if let sender = conv.lastMessageSenderName, conv.type != .direct {
                return "\(sender): \(preview)"
            }
            return preview
        }
        if conv.lastMessageAttachmentCount > 0 {
            return "[\(conv.lastMessageAttachmentCount) attachment\(conv.lastMessageAttachmentCount > 1 ? "s" : "")]"
        }
        return ""
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let widgetData = Logger(subsystem: "me.meeshy.app", category: "widget-data")
}
