import Foundation
import Combine
import os

private let logger = MeeshyLog.logger(.notifications, subsystem: .sdk)

/// High-level orchestrator for in-app notifications.
///
/// Responsibilities split (read carefully before touching):
/// - **Toast / transient UI**: `currentToast` + dismiss timer — owned by this class.
/// - **Active conversation tracking**: suppresses self-authored toasts.
/// - **Unread count**: DELEGATED to `NotificationCoordinator`. Callers read
///   `unreadCount` here for API continuity, but the value is mirrored from the
///   coordinator — every mutation goes through the coordinator first.
///
/// The coordinator is the single source of truth for the notification bell, the
/// system badge and the widget data store. This class must not write directly to
/// `UIApplication.setBadgeCount` or to the App Group defaults.
@MainActor
public final class NotificationToastManager: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = NotificationToastManager()

    /// Mirrors `NotificationCoordinator.inAppNotificationUnread`. Kept as a
    /// `@Published` convenience so legacy SwiftUI views that observe
    /// `NotificationToastManager.shared` continue to refresh without changes.
    @Published public internal(set) var unreadCount: Int = 0

    @Published public internal(set) var currentToast: SocketNotificationEvent?

    /// **Ce que la bannière courante AFFICHE, résolu UNE fois à la pose**
    /// (#7167).
    ///
    /// `resolvedBannerPresentation` descend jusqu'au fournisseur de
    /// présentation de conversation, qui lit le groupe App Group et décode
    /// le dictionnaire ENTIER des instantanés pour en tirer une entrée — une
    /// I/O et un décodage JSON synchrones, sur le fil principal. La vue les
    /// payait à CHAQUE évaluation de son corps, donc pendant son animation
    /// d'entrée et de sortie, et le coût croît avec le nombre de
    /// conversations : le défaut s'aggrave avec l'usage, donc il ne se voit
    /// pas sur un compte de test.
    ///
    /// **Volontairement PAS `@Published`** : elle est écrite AVANT
    /// `currentToast`, dont la publication suffit à la faire relire. Deux
    /// `@Published` écrits ensemble produiraient deux tours de rendu pour un
    /// seul événement — ce que ce lot cherche précisément à supprimer.
    public private(set) var currentToastPresentation: NotificationBannerPresentation?

    /// Délibérément PAS `@Published` — aucune vue ne les observe.
    ///
    /// Ce sont des gardes de suppression, lues SYNCHRONIQUEMENT au moment de
    /// décider si une notification doit se signaler (`handleNewNotification`),
    /// et une fois par `FeedCommentsSheet` à l'ouverture. Personne n'en dérive
    /// d'affichage.
    ///
    /// Publiées, elles coûtaient très cher : `RootView` et `iPadRootView`
    /// observent ce singleton en `@ObservedObject`, donc CHAQUE ouverture ou
    /// fermeture de conversation, et chaque slide de story (`onPostOpened` est
    /// ré-annoncé à chaque révélation), ré-évaluait la racine entière. Cette
    /// ré-évaluation reconstruit un `ConversationViewModel` jetable — donc un
    /// `ConversationSocketHandler` jetable — dont la boucle create/destroy est
    /// documentée en tête de `ConversationSocketHandler.swift` (pic CPU, storm
    /// 429 sur `/read`) et n'était jusqu'ici que CONTENUE par des gardes
    /// idempotents, jamais tarie à la source.
    ///
    /// Même raisonnement, et même formulation, que
    /// `ConversationStateStore.messages`. Ne pas les republier sans montrer
    /// d'abord une vue qui les LIT.
    public internal(set) var activeConversationId: String?
    public var activePostId: String?

    /// **Les conversations OUVERTES, et pas seulement la dernière** — iPad
    /// multi-fenêtre. Une conversation détachée dans sa propre fenêtre laisse
    /// celle de la fenêtre principale à l'écran : `activeConversationId` n'en
    /// nomme qu'une (la plus récente), si bien que les messages de l'autre
    /// remontaient en toast par-dessus le fil qu'on lisait, et que fermer la
    /// fenêtre détachée remettait l'app « nulle part » alors qu'une
    /// conversation restait affichée.
    ///
    /// Pile ordonnée (la plus récente en dernier) avec un compte par
    /// conversation : la même conversation peut être ouverte dans deux
    /// fenêtres, et seule la fermeture de la DERNIÈRE la retire. Alimentée
    /// exclusivement par les écrans réellement activés
    /// (`ConversationSocketHandler.activate()` / son `deinit`), une ouverture
    /// pour une fermeture — c'est ce qui rend le compte juste.
    var openConversationStack: [String] = []
    var openConversationCounts: [String: Int] = [:]

    /// Vrai tant qu'au moins un écran affiche cette conversation, dans
    /// n'importe quelle fenêtre.
    public func isConversationOpen(_ conversationId: String) -> Bool {
        openConversationCounts[conversationId, default: 0] > 0
    }

    public var openConversationIds: Set<String> { Set(openConversationStack) }

    /// Témoins uniquement : le singleton survit d'un test à l'autre.
    func forgetOpenConversations() {
        openConversationStack.removeAll()
        openConversationCounts.removeAll()
        activeConversationId = nil
        MessageSocketManager.shared.activeConversationId = nil
        MessageSocketManager.shared.openConversationIds = []
    }

    public let newNotificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let notificationMarkedRead = PassthroughSubject<String, Never>()
    public let notificationWasDeleted = PassthroughSubject<String, Never>()

    /// Émis quand toutes les notifications d'une conversation viennent d'être
    /// marquées lues (ouverture de la conversation). Permet à la liste in-app
    /// de mettre à jour ses lignes immédiatement, avant le refresh serveur.
    public let conversationNotificationsRead = PassthroughSubject<String, Never>()

    /// Pendant du précédent pour un post — story, statut, post de feed.
    /// Émis à l'ouverture du contenu (`onPostOpened`).
    public let postNotificationsRead = PassthroughSubject<String, Never>()

    /// Émis quand une CATÉGORIE entière vient d'être consommée par un écran
    /// dédié (demandes d'ajout).
    public let typeNotificationsRead = PassthroughSubject<[String], Never>()

    /// Émis quand la boîte ENTIÈRE vient d'être marquée lue — le geste local
    /// « Tout lire » comme le prédicat de masse reçu d'un autre appareil
    /// (#7000).
    ///
    /// Ce canal MANQUAIT : `republishRead(.all)` faisait `break`, au motif
    /// qu'aucun subject ne correspondait et qu'en créer un exigeait son
    /// abonné. C'était vrai, et c'était le travail à faire : une cloche déjà
    /// montée gardait ses lignes non lues pendant que le cache, lui, était
    /// patché — deux vérités à l'écran jusqu'au prochain chargement.
    public let allNotificationsRead = PassthroughSubject<Void, Never>()

    /// Le marquage optimiste d'UNE ligne vient d'être ANNULÉ : le serveur a
    /// refusé. Les vues montées doivent repeindre la ligne en non lue — le
    /// cache durable, lui, est rendu par `applyUnreadToCache`.
    public let notificationReadRolledBack = PassthroughSubject<String, Never>()

    /// Joueur d'haptique injecté par la cible app (le SDK core n'importe pas
    /// UIKit) — même pattern que `conversationPresentationProvider`. Appelé à l'apparition
    /// d'un toast, UNIQUEMENT si la préférence « Vibrations »
    /// (`vibrationEnabled`) est active : c'est le consommateur réel de ce
    /// toggle côté in-app.
    public var hapticPlayer: (@MainActor () -> Void)?

    /// Retrait des bannières DÉJÀ LIVRÉES du fil qu'on vient de consommer
    /// (#6999), injecté par la cible app — même motif que `hapticPlayer` : la
    /// couture `DeliveredBannerCenter` et le budget d'arrière-plan qui
    /// l'entoure vivent dans `NotificationActionHandler`, pas ici.
    ///
    /// Sans ce relais, ouvrir une conversation depuis la liste in-app laissait
    /// ses bannières dans le centre de notifications : l'app savait le contenu
    /// consommé partout SAUF là où l'utilisateur allait le relire.
    ///
    /// `nil` en test et dans toute cible qui ne l'a pas câblé — la
    /// consommation reste correcte, seule la pièce système manque.
    public var deliveredBannerPurger: (@MainActor (NotificationRef) -> Void)?

    /// Présentation Local-First (nom renommé + emoji favori) d'une conversation
    /// pour les toasts in-app. Le SDK ne peut pas lire le snapshot local des
    /// conversations de l'app, donc la cible app injecte une closure de pull —
    /// même pattern que `hapticPlayer`. Retourne `nil` → on retombe sur
    /// le titre serveur (`event.conversationGroupName`).
    public var conversationPresentationProvider: (@MainActor (_ conversationId: String) -> ConversationPresentation?)?

    /// Pièces de présentation d'une conversation, résolues par l'app et
    /// consommées par le toast. `name` = `customName ?? title` (renommage
    /// local), `favoriteEmoji` = classification favorite. Local-First : l'app
    /// les lit depuis ses préférences locales (possiblement non encore
    /// synchronisées backend).
    public struct ConversationPresentation: Sendable {
        public let name: String
        public let favoriteEmoji: String?

        public init(name: String, favoriteEmoji: String?) {
            self.name = name
            self.favoriteEmoji = favoriteEmoji
        }

        /// `<favori> <nom>` (favori en tête), ou `<nom>` sans favori — même
        /// ordre que les notifications push (favori d'abord).
        public var composedSubtitle: String {
            guard let fav = favoriteEmoji?.trimmingCharacters(in: .whitespaces),
                  !fav.isEmpty else { return name }
            return "\(fav) \(name)"
        }
    }

    /// Le nom du groupe tel que l'APPAREIL le connaît — renommage local + emoji
    /// favori quand l'app en a un, nom canonique du serveur sinon, `nil` pour un
    /// message direct ou tout ce qui n'est pas un message de conversation.
    ///
    /// C'est la seule pièce de la bannière que le serveur ne peut pas composer :
    /// il ignore les renommages locaux, qui ne sont pas forcément synchronisés.
    @MainActor
    public func resolvedConversationGroupName(for event: SocketNotificationEvent) -> String? {
        let base = event.conversationGroupName
        guard base != nil,
              let conversationId = event.conversationId,
              let presentation = conversationPresentationProvider?(conversationId) else {
            return base
        }
        return presentation.composedSubtitle
    }

    /// La bannière in-app complète — ce qu'elle DIT, avec le nom LOCAL du groupe
    /// injecté. Site unique : la vue ne recompose rien.
    @MainActor
    public func resolvedBannerPresentation(
        for event: SocketNotificationEvent
    ) -> NotificationBannerPresentation {
        event.bannerPresentation(groupName: resolvedConversationGroupName(for: event))
    }

    var cancellables = Set<AnyCancellable>()
    private var toastDismissTask: Task<Void, Never>?
    private static let toastDuration: Duration = .seconds(7)

    // Dedup set: évite d'afficher 2x la même notification (APN foreground + socket simultanés)
    var recentNotificationIds = Set<String>()

    // Coalescing du compteur non-lu : `refreshUnreadCount` a 8 appelants (boot app,
    // login, RootView, iPadRootView, NotificationListView…) qui se déclenchent quasi
    // simultanément au démarrage → ~11 `GET /notifications/unread-count` en rafale.
    // On partage la Task en vol et on limite à 1 refresh par `unreadRefreshMinInterval`.
    private var unreadRefreshTask: Task<Void, Never>?
    private var lastUnreadRefreshAt: Date?
    private static let unreadRefreshMinInterval: TimeInterval = 1.5

    // Coalescing du mark-read par conversation : même protection que pour le
    // compteur non-lu. Un cycle open→close→open rapproché (re-render parent,
    // navigation aller-retour) ne doit produire qu'UN seul
    // `POST /notifications/conversation/:id/read` — sans ce gate, chaque
    // passage du guard `activeConversationId` émet un POST, et la rafale
    // sature le rate-limiter gateway (storm 429 observé sur device, chaque
    // requête retentée 3× amplifiant la saturation). Les notifications qui
    // arrivent pendant que la conversation est OUVERTE sont déjà marquées
    // unitairement par `handleNewNotification`, donc sauter un POST redondant
    // dans la fenêtre de cooldown n'introduit pas de dérive durable.
    var conversationReadTasks: [String: Task<Void, Never>] = [:]
    var lastConversationReadAt: [String: Date] = [:]
    static let conversationReadMinInterval: TimeInterval = 5

    // Même protection anti-rafale pour les posts / stories : le viewer de story
    // ré-annonce la story courante à chaque révélation de slide et à chaque
    // retour d'interlude.
    var postReadTasks: [String: Task<Void, Never>] = [:]
    var lastPostReadAt: [String: Date] = [:]

    /// Les lectures dont CET appareil est l'auteur — voir
    /// `NotificationSelfReadLedger`. `internal` : les chemins de consommation
    /// vivent dans `NotificationConsumption.swift`, et une extension ne peut
    /// pas porter de propriété stockée.
    var selfReadLedger = NotificationSelfReadLedger()

    private init() {
        subscribeToCoordinator()
        subscribeToSocketEvents()
    }

    // MARK: - Public API

    public func refreshUnreadCount() async {
        // Coalesce les appelants concurrents : si un refresh est déjà en vol, on
        // l'attend au lieu d'émettre un second GET. Si un refresh vient d'aboutir
        // (< unreadRefreshMinInterval), on no-op — la valeur autoritative arrive
        // aussi via le socket `notification:counts`, donc sauter un GET redondant
        // n'introduit pas de dérive durable.
        if let task = unreadRefreshTask {
            await task.value
            return
        }
        if let last = lastUnreadRefreshAt,
           Date().timeIntervalSince(last) < Self.unreadRefreshMinInterval {
            return
        }

        let task = Task { [weak self] in
            do {
                let count = try await NotificationService.shared.unreadCount()
                NotificationCoordinator.shared.setInAppNotificationUnread(count)
            } catch {
                logger.error("Failed to refresh unread count: \(error.localizedDescription)")
            }
            self?.lastUnreadRefreshAt = Date()
            self?.unreadRefreshTask = nil
        }
        unreadRefreshTask = task
        await task.value
    }


    public func dismissToast() {
        toastDismissTask?.cancel()
        toastDismissTask = nil
        currentToastPresentation = nil
        currentToast = nil
    }

    public func reset() {
        dismissToast()
        activeConversationId = nil
        openConversationStack.removeAll()
        openConversationCounts.removeAll()
        activePostId = nil
        conversationReadTasks.values.forEach { $0.cancel() }
        conversationReadTasks = [:]
        lastConversationReadAt = [:]
        postReadTasks.values.forEach { $0.cancel() }
        postReadTasks = [:]
        lastPostReadAt = [:]
        // Un compte ne lègue pas ses lectures au suivant : un id réclamé ici
        // ferait ignorer, sous le compte entrant, un écho qui lui appartient.
        selfReadLedger.removeAll()
        // Unread count cleared by NotificationCoordinator.reset() — do not
        // duplicate that write here or both paths will race.
    }

    // MARK: - Toast

    #if DEBUG
    /// Recette DEBUG (#8723) : pose une bannière depuis une fixture, sans
    /// socket ni envoi. Absent d'un build Release.
    public func presentPreviewToast(_ event: SocketNotificationEvent) {
        showToast(event)
    }
    #endif

    func showToast(_ event: SocketNotificationEvent) {
        if UserPreferencesManager.shared.notification.vibrationEnabled {
            hapticPlayer?()
        }
        toastDismissTask?.cancel()
        // Résolue AVANT la publication de `currentToast` : l'observateur qui
        // se réveille lit les deux dans le même tour.
        currentToastPresentation = resolvedBannerPresentation(for: event)
        currentToast = event

        toastDismissTask = Task {
            guard await cancellableSleep(for: Self.toastDuration) else { return }
            currentToastPresentation = nil
            currentToast = nil
        }
    }
}