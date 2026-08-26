import Foundation
import WidgetKit
import UIKit
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
    /// État de présence sous forme de JETON STABLE (`PresenceState.rawValue` :
    /// `online` / `away` / `idle` / `offline`), jamais un libellé humain.
    ///
    /// Le champ s'appelait `status` et transportait `lastSeenText` — du
    /// FRANÇAIS codé en dur (« En ligne », « Vu il y a 3min ») — pendant que
    /// le widget, seul lecteur, décidait d'allumer sa pastille verte sur
    /// `status == "Online"`. La comparaison ne pouvait donc jamais être vraie :
    /// la pastille de présence du widget Favoris était inatteignable, et un
    /// utilisateur anglophone lisait du français par-dessus le marché.
    ///
    /// Un libellé est une SORTIE ; ce qui franchit un processus doit être une
    /// donnée. Le widget mappe le jeton sur la règle 1/3/5 (`CLAUDE.md` §
    /// User Presence) au moment du rendu, dans sa propre langue.
    let presence: String
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = WidgetDataManager()

    /// Toute écriture App Group passe par ici.
    ///
    /// `UserDefaults.set` sur une suite App Group n'écrit PAS en mémoire : il
    /// fait un aller-retour **XPC SYNCHRONE** vers `cfprefsd`
    /// (`CFPrefsPlistSource` → `xpc_connection_send_message_with_reply_sync` →
    /// `mach_msg2_trap`). Si la suspension de l'app tombe pendant cet
    /// aller-retour, le process détient un verrou de préférences au moment où
    /// RunningBoard le suspend, et le système le tue avec **0xDEAD10CC**
    /// (`RUNNINGBOARD 3735883980`) — 5 rapports `.ips` device entre le
    /// 2026-07-31 et le 2026-08-17, dont `Meeshy-2026-08-17-074340` qui montre
    /// la pile exacte : `ConversationListViewModel.syncBadgeOnUnreadChange`
    /// (sink Combine `.debounce(200 ms)`) → `NotificationCoordinator
    /// .registerConversations` → `WidgetDataManager.publishConversations` →
    /// `NSUserDefaults setObject:forKey:` → XPC bloquant.
    ///
    /// Le debounce est précisément ce qui rend l'accident probable : il replante
    /// une écriture jusqu'à 200 ms APRÈS la dernière mutation de la liste,
    /// donc potentiellement dans la fenêtre de suspension ouverte par un
    /// passage en arrière-plan.
    ///
    /// L'assertion de tâche d'arrière-plan demande au système de différer la
    /// suspension jusqu'à `endBackgroundTask` — c'est le remède canonique
    /// d'Apple pour 0xDEAD10CC. Elle est prise et rendue de façon strictement
    /// synchrone autour de l'écriture, donc son budget est de l'ordre de la
    /// milliseconde et elle ne retarde jamais réellement la suspension.
    /// Même parapluie que `BackgroundTransitionCoordinator`.
    private func writingToSharedContainer(_ body: () -> Void) {
        let taskId = UIApplication.shared.beginBackgroundTask(withName: "meeshy.widget.publish")
        defer {
            if taskId != .invalid { UIApplication.shared.endBackgroundTask(taskId) }
        }
        body()
    }

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

    /// B1 (Prisme Linguistique) — prisme du lecteur, relu à CHAQUE publication.
    ///
    /// Le widget affiche l'aperçu du dernier message : il doit le montrer dans
    /// la langue du lecteur, comme la liste in-app, et non dans celle de
    /// l'expéditeur. `AuthManager.shared` est un singleton `@MainActor` — la
    /// fermeture est un seam de test, pas une indirection de confort : le
    /// bundle de tests publie dans une suite jetable sans compte connecté.
    private let preferredContentLanguagesProvider: @MainActor () -> [String]

    /// Même autorité de présence que la liste de conversations
    /// (`ConversationListView` → `PresenceManager.presenceState(for:)`), et
    /// pour la même raison que le prisme ci-dessus : ce que le widget affiche
    /// doit être ce que l'app affiche.
    ///
    /// Repli sur `conv.lastSeenPresence` quand le manager ne suit pas ce
    /// pair — un contact épinglé jamais croisé depuis le lancement n'est pas
    /// « hors ligne », il est simplement inconnu du temps réel, et son
    /// horodatage REST reste la meilleure donnée disponible.
    private let presenceStateProvider: @MainActor (String) -> PresenceState?

    private init() {
        self.suiteName = "group.me.meeshy.apps"
        self.stagingDirectoriesOverride = nil
        self.preferredContentLanguagesProvider = {
            AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        }
        self.presenceStateProvider = { PresenceManager.shared.knownPresenceState(for: $0) }
    }

    /// Init de test (fiche appgroup-01) — suite UserDefaults et dossiers de
    /// staging injectés pour vérifier `wipeAll()` sans toucher l'App Group réel.
    init(
        suiteName: String,
        stagingDirectories: [URL],
        preferredContentLanguages: @escaping @MainActor () -> [String] = {
            AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        },
        presenceState: @escaping @MainActor (String) -> PresenceState? = {
            PresenceManager.shared.knownPresenceState(for: $0)
        }
    ) {
        self.preferredContentLanguagesProvider = preferredContentLanguages
        self.presenceStateProvider = presenceState
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
            SharePendingSendConsumer.mediaDirectoryURL(),
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
        writingToSharedContainer { sharedDefaults?.set(origin, forKey: apiBaseURLKey) }
    }

    // MARK: - NotificationWidgetSink

    func publishConversations(_ conversations: [MeeshyConversation]) {
        // Résolu UNE fois par publication : le prisme est une propriété du
        // lecteur, pas de la conversation, et le relire par ligne ferait 50
        // reconstructions de tableau pour un résultat identique.
        let preferredLanguages = preferredContentLanguagesProvider()
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
                    lastMessage: formatLastMessage(conv, preferredLanguages: preferredLanguages),
                    timestamp: conv.lastMessageAt,
                    isUnread: conv.userState.unreadCount > 0,
                    isPinned: conv.userState.isPinned,
                    accentColor: conv.accentColor
                )
            }

        guard let defaults = sharedDefaults,
              let data = encoder.encodeOrLog(Array(widgetConversations), field: "widget conversations", logger: Logger.widgetData) else { return }

        writingToSharedContainer {
            defaults.set(data, forKey: conversationsKey)
            defaults.set(Date().timeIntervalSince1970, forKey: lastUpdatedKey)
        }

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
        writingToSharedContainer { defaults.set(data, forKey: snapshotsKey) }
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

    /// Publie les contacts épinglés (conversations DIRECTES uniquement,
    /// plafonné à 8) dans le container `group.me.meeshy.apps` sous la clé
    /// `favorite_contacts`.
    ///
    /// C'est LA SOURCE DE VÉRITÉ que `MeeshyAppIntents.ContactQuery`
    /// (`entities(for:)` + `suggestedEntities()`) lit pour ré-hydrater les
    /// raccourcis Siri enregistrés, et que le widget Favoris affiche. Ne
    /// JAMAIS changer `favoritesKey` ni le format JSON (`WidgetFavoriteContact`
    /// ↔ `ContactData`) sans mettre à jour `MeeshyAppIntents.swift` — un
    /// désaccord rend tout raccourci silencieusement orphelin (liste vide,
    /// pas d'erreur). Gardes : `DeepLinkSurfaceRoutingGuardTests` +
    /// `WidgetDataManagerTests.test_publishFavoriteContacts_*`.
    ///
    /// - Parameter conversations: Conversations candidates (le filtre
    ///   épinglé + directe et le cap à 8 sont appliqués ici)
    func publishFavoriteContacts(_ conversations: [MeeshyConversation]) {
        let favorites = conversations
            .filter { $0.userState.isPinned && $0.type == .direct }
            .prefix(8)
            .map { conv in
                WidgetFavoriteContact(
                    id: conv.id,
                    name: conv.displayName,
                    avatar: "person.circle.fill",
                    presence: resolvePresence(conv).rawValue,
                    accentColor: conv.accentColor
                )
            }

        guard let defaults = sharedDefaults,
              let data = encoder.encodeOrLog(Array(favorites), field: "widget favorites", logger: Logger.widgetData) else { return }

        writingToSharedContainer { defaults.set(data, forKey: favoritesKey) }
    }

    func publishUnreadCount(_ count: Int) {
        writingToSharedContainer { sharedDefaults?.set(max(count, 0), forKey: unreadCountKey) }
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

    /// Présence d'un pair, temps réel d'abord, horodatage REST ensuite.
    ///
    /// L'ordre compte : `PresenceManager` intègre `presence:snapshot`,
    /// `user:status` et la preuve d'activité `typing:start`, donc il sait des
    /// choses que `lastSeenAt` — figé à la dernière réponse REST — ignore.
    private func resolvePresence(_ conv: MeeshyConversation) -> PresenceState {
        if let userId = conv.participantUserId,
           let live = presenceStateProvider(userId) {
            return live
        }
        return conv.lastSeenPresence ?? .offline
    }

    /// B1 (Prisme Linguistique) — l'aperçu publié dans l'App Group passe par
    /// `resolvedLastMessagePreview`, comme la ligne de liste in-app.
    ///
    /// Ce texte quitte l'app : il s'affiche sur l'écran d'accueil, hors de
    /// portée de toute résolution ultérieure. Le publier brut montrait le
    /// dernier message dans la langue de l'EXPÉDITEUR pendant que la même
    /// conversation, ouverte dans l'app, affichait sa traduction.
    private func formatLastMessage(
        _ conv: MeeshyConversation,
        preferredLanguages: [String]
    ) -> String {
        if let preview = conv.resolvedLastMessagePreview(preferredLanguages: preferredLanguages),
           !preview.isEmpty {
            if let sender = conv.lastMessageSenderName, conv.type != .direct {
                return "\(sender): \(preview)"
            }
            return preview
        }
        if conv.lastMessageAttachmentCount > 0 {
            // Composé DANS l'app, donc localisable ici : la cible widget n'a
            // pas de catalogue pour les sept langues, celle-ci l'a. Le pluriel
            // passe par le catalogue (`.xcstrings` porte les variations) et
            // non par un `count > 1 ? "s" : ""` — qui ne vaut que pour
            // l'anglais et se trompe déjà en français pour zéro.
            return String(
                localized: "widget.lastMessage.attachments",
                defaultValue: "[\(conv.lastMessageAttachmentCount) attachments]"
            )
        }
        return ""
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let widgetData = Logger(subsystem: "me.meeshy.app", category: "widget-data")
}
