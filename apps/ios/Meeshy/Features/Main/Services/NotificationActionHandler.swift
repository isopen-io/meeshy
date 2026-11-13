import UIKit
import Combine
@preconcurrency import UserNotifications
import MeeshySDK
import os

private nonisolated let logger = MeeshyLog.logger(.push)

// MARK: - NotificationActionHandler


/// R1/R2 — the injectable handler behind
/// `AppDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)`.
///
/// Fixes the three background cold-launch defects of the previous inline
/// implementation:
///  1. the delegate used to call `completionHandler()` synchronously while the
///     work ran in a detached `Task` — iOS could suspend the process
///     mid-flight. The delegate now awaits `handle()` (which wraps itself in a
///     `beginBackgroundTask`) and calls the completion at the END.
///  2. `APIClient.shared.authToken` was never populated on a background
///     cold-launch (only the splash flow does), so every send died as a
///     silent 401. The handler pushes `AuthManager`'s lazy keychain-backed
///     token to the API client before any network call.
///  3. the quick reply was a bare `try?` REST call — a network failure lost
///     the text. It is now durable: optimistic `MessageRecord` + outbox
///     `.sendMessage` row FIRST, then the REST attempt; the gateway dedups by
///     `clientMessageId` so the outbox flusher can safely retry.
@MainActor
final class NotificationActionHandler: NotificationActionHandling {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = NotificationActionHandler()

    let messageService: MessageServiceProviding
    let conversationService: ConversationServiceProviding
    private let postService: PostServiceProviding
    /// Le seul chemin réseau d'un commentaire (#9743) — il lie la requête au
    /// compte de l'auteur.
    let commentPublisher: CommentPublisher
    /// Une réponse rapide à un commentaire n'a pu ni partir ni rejoindre la
    /// file : l'utilisateur, hors de l'app, l'apprend par une notification.
    let notifyUnsentComment: @MainActor () -> Void
    let friendService: FriendServiceProviding
    let replyQueue: NotificationReplyQueueing
    private let injectedPersistence: OptimisticMessagePersisting?
    private let injectedPrepareReplyQueue: (@MainActor () async -> Void)?
    private let backgroundTasks: BackgroundTaskScheduling
    let authTokenProvider: @MainActor () -> String?
    private let applyAuthToken: @MainActor (String?) -> Void
    let currentUserId: @MainActor () -> String?
    let preferredLanguage: @MainActor () -> String?
    let isRegisteredUser: @MainActor () -> Bool
    let openNotification: @MainActor ([AnyHashable: Any]) -> Void
    private let dialCallBack: @MainActor (CallBackRequest) -> Void
    let localMarkRead: @MainActor (String) -> Void
    /// #12655 — la conversation PEUT-elle être verrouillée par PIN sur cet
    /// appareil ? Oui tant que la liste des verrous n'est pas lue (fail-closed).
    private let conversationLocks: any ConversationLockProbing
    /// #12655 — une réponse refusée sous PIN le dit, hors de l'app.
    private let notifyRefusedReply: @MainActor (String?) -> Void
    private let stopBring: @MainActor (String) async -> Void
    /// L'unique consommation du SDK, injectée pour que les tests l'observent :
    /// `NotificationToastManager` est un singleton `@MainActor` sans couture de
    /// service, et un témoin ne peut pas mesurer un aller-retour REST réel.
    private let consume: @MainActor (NotificationRef) async -> Void
    let removeDeliveredForConversation: @MainActor (String) -> Void
    let removeDeliveredForPost: @MainActor (String) -> Void
    let removeDeliveredForNotificationIds: @MainActor ([String]) async -> Void
    /// #8858 — les trois gestes du DÉTAIL d'un message : Plans, Contacts, et
    /// le parcours de lien de conversation (Anonyme / Mon compte, #8726).
    private let openExternalURL: @MainActor (URL) -> Void
    private let openDeepLink: @MainActor (URL) -> Void
    private let presentNewContact: @MainActor (NotificationContactCard) -> Void
    /// La loi du fil appliquée à la conversation de la réponse (#12641, #12985).
    let destinationGuard: EndToEndDestinationGuard
    /// Le refus d'une réponse vers une conversation chiffrée se DIT (audit M4),
    /// et sa bannière ouvre la conversation.
    let notifyRefusedEndToEndReply: @MainActor (String, EndToEndSendRefusal) -> Void
    /// Le coffre libsignal, seul lieu du clair d'une réponse chiffrée (#13067).
    let endToEnd: any EndToEndMessagingProviding
    /// #14667, #14673 — les réponses dont le régime attend d'être relu.
    private let repliesAwaitingRegime: any NotificationRepliesAwaitingRegimeStoring
    private let awaitingReplyRules: NotificationReplyRegimeWait.Rules
    var revocationSubscription: AnyCancellable?
    /// #7453 — l'abonnement au retour au premier plan, qui rejoue le balayage
    /// des bannières éphémères échues. Un nouvel appel REMPLACE l'abonnement :
    /// la racine SwiftUI peut rejouer son câblage sans balayer deux fois.
    var foregroundSweepSubscription: AnyCancellable?

    /// Resolved lazily so tests never touch `DependencyContainer.shared`
    /// (which opens the on-disk GRDB pool).
    var messagePersistence: OptimisticMessagePersisting {
        injectedPersistence ?? DependencyContainer.shared.messagePersistence
    }

    /// R2/R4 — the outbox pool is normally wired by the SwiftUI root-view
    /// `.task` (`MeeshyApp`), a flow that never runs on a background
    /// cold-launch — the very scenario notification actions target. Without
    /// this, `enqueue` throws `.poolNotConfigured` and the "durable outbox"
    /// guarantee is silently inoperative: the reply survives only as a
    /// `.failed` bubble and the comment text is lost if REST also fails.
    /// `OfflineQueue.configure` is idempotent for the same shared pool, so
    /// wiring it again on a warm launch is harmless. Resolved lazily like
    /// `messagePersistence` so tests never touch `DependencyContainer.shared`.
    var prepareReplyQueue: @MainActor () async -> Void {
        injectedPrepareReplyQueue ?? {
            await OfflineQueue.shared.configure(pool: DependencyContainer.shared.database.pool)
        }
    }

    init(
        messageService: MessageServiceProviding = MessageService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        postService: PostServiceProviding = PostService.shared,
        commentPublisher: CommentPublisher = .live,
        notifyUnsentComment: @escaping @MainActor () -> Void = { NotificationReplyFailure.post() },
        friendService: FriendServiceProviding = FriendService.shared,
        replyQueue: NotificationReplyQueueing = OfflineQueue.shared,
        messagePersistence: OptimisticMessagePersisting? = nil,
        backgroundTasks: BackgroundTaskScheduling = UIApplicationBackgroundTaskScheduler(),
        authTokenProvider: @escaping @MainActor () -> String? = { AuthManager.shared.authToken },
        applyAuthToken: @escaping @MainActor (String?) -> Void = { APIClient.shared.authToken = $0 },
        currentUserId: @escaping @MainActor () -> String? = {
            AuthManager.shared.currentUser?.id ?? AuthManager.shared.persistedActiveUserId
        },
        preferredLanguage: @escaping @MainActor () -> String? = {
            // Défaut de COMPOSITION (langue proposée, repli « fr ») — pas une lecture (#11875).
            AuthManager.shared.currentUser?.preferredContentLanguages.first
        },
        isRegisteredUser: @escaping @MainActor () -> Bool = {
            guard let user = AuthManager.shared.currentUser else { return false }
            return user.isAnonymous != true
        },
        openNotification: @escaping @MainActor ([AnyHashable: Any]) -> Void = {
            // iPad, fenêtre détachée devant : la cible s'ouvre dans la fenêtre principale — qui revient d'abord.
            MainWindowRegistry.shared.bringPrimaryForwardIfHidden()
            PushNotificationManager.shared.handleNotification(userInfo: $0)
        },
        dialCallBack: @escaping @MainActor (CallBackRequest) -> Void = { request in
            CallBackDialer.shared.dial(request)
        },
        localMarkRead: @escaping @MainActor (String) -> Void = { conversationId in
            // Les trois surfaces du compteur, en un seul point d'écriture.
            ConversationReadSignal.markReadLocally(conversationId)
            // Notifications de la cloche (portée conversation) : serveur +
            // cache + publishers, sans déclarer la conversation active
            // (l'app peut être en arrière-plan, rien n'est ouvert). Hors du
            // signal ci-dessus, qui ne porte QUE le compteur de non-lu : une
            // ouverture d'écran passe, elle, par `onConversationOpened`.
            NotificationToastManager.shared.onConversationMarkedRead(conversationId)
        },
        consume: @escaping @MainActor (NotificationRef) async -> Void = { ref in
            await NotificationToastManager.shared.consume(ref)
        },
        // #6999 — par le FIL, pas par la seule clé de charge : le
        // `threadIdentifier` est ce qu'iOS a REGROUPÉ, et une bannière peut y
        // être rangée sans que sa charge porte `conversationId` / `postId`.
        removeDeliveredForConversation: @escaping @MainActor (String) -> Void = { conversationId in
            NotificationActionHandler.removeDeliveredBanners(forThreadOf: .conversation(id: conversationId))
        },
        removeDeliveredForPost: @escaping @MainActor (String) -> Void = { postId in
            NotificationActionHandler.removeDeliveredBanners(forThreadOf: .post(id: postId))
        },
        removeDeliveredForNotificationIds: @escaping @MainActor ([String]) async -> Void = { ids in
            let revocation = NotificationRevocationPayload(notificationIds: ids, conversationIds: [])
            await NotificationActionHandler.removeDeliveredNotificationsAwaiting(
                matching: { revocation.covers($0) }
            )
        },
        prepareReplyQueue: (@MainActor () async -> Void)? = nil,
        openExternalURL: @escaping @MainActor (URL) -> Void = { UIApplication.shared.open($0) },
        openDeepLink: @escaping @MainActor (URL) -> Void = { _ = DeepLinkRouter.shared.handle(url: $0) },
        presentNewContact: @escaping @MainActor (NotificationContactCard) -> Void = {
            NotificationContactPresenter.present($0)
        },
        conversationLocks: any ConversationLockProbing = ConversationLockManager.shared,
        notifyRefusedReply: @escaping @MainActor (String?) -> Void = {
            NotificationReplyFailure.postRefusedUnderConversationPin(conversationId: $0)
        },
        destinationGuard: EndToEndDestinationGuard = EndToEndDestinationGuard(),
        notifyRefusedEndToEndReply: @escaping @MainActor (String, EndToEndSendRefusal) -> Void = {
            NotificationReplyFailure.postEndToEndReplyRefused(conversationId: $0, refusal: $1)
        },
        endToEnd: any EndToEndMessagingProviding = EndToEndMessagingRuntime.shared,
        repliesAwaitingRegime: any NotificationRepliesAwaitingRegimeStoring = NotificationRepliesAwaitingRegime.shared,
        awaitingReplyRules: NotificationReplyRegimeWait.Rules = .live,
        stopBring: @escaping @MainActor (String) async -> Void = { await BringCenter.shared.stopAndWait(bringId: $0) }
    ) {
        self.stopBring = stopBring
        self.repliesAwaitingRegime = repliesAwaitingRegime
        self.awaitingReplyRules = awaitingReplyRules
        self.destinationGuard = destinationGuard
        self.notifyRefusedEndToEndReply = notifyRefusedEndToEndReply
        self.endToEnd = endToEnd
        self.messageService = messageService
        self.conversationService = conversationService
        self.postService = postService
        self.commentPublisher = commentPublisher
        self.notifyUnsentComment = notifyUnsentComment
        self.friendService = friendService
        self.replyQueue = replyQueue
        self.injectedPersistence = messagePersistence
        self.injectedPrepareReplyQueue = prepareReplyQueue
        self.backgroundTasks = backgroundTasks
        self.authTokenProvider = authTokenProvider
        self.applyAuthToken = applyAuthToken
        self.currentUserId = currentUserId
        self.preferredLanguage = preferredLanguage
        self.isRegisteredUser = isRegisteredUser
        self.openNotification = openNotification
        self.dialCallBack = dialCallBack
        self.localMarkRead = localMarkRead
        self.consume = consume
        self.removeDeliveredForConversation = removeDeliveredForConversation
        self.removeDeliveredForPost = removeDeliveredForPost
        self.removeDeliveredForNotificationIds = removeDeliveredForNotificationIds
        self.openExternalURL = openExternalURL
        self.openDeepLink = openDeepLink
        self.presentNewContact = presentNewContact
        self.conversationLocks = conversationLocks
        self.notifyRefusedReply = notifyRefusedReply
    }

    // MARK: - Entry point

    func handle(
        actionIdentifier: String,
        userInfo: [AnyHashable: Any],
        replyText: String?
    ) async {
        let taskLease = BackgroundTaskLease(
            scheduler: backgroundTasks,
            name: "meeshy.notification-action"
        )
        defer { taskLease.end() }

        // Background cold-launch never runs `checkExistingSession`, so
        // `APIClient.shared.authToken` is nil even though the Keychain has a
        // valid JWT. `AuthManager.authToken` reads the Keychain lazily —
        // push it to the API client before ANY network call.
        applyAuthToken(authTokenProvider())

        let payload = NotificationPayload(userInfo: userInfo)
        guard !refusesUnderConversationPin(actionIdentifier, payload: payload, userInfo: userInfo) else { return }

        switch actionIdentifier {
        case UNNotificationDefaultActionIdentifier:
            // #6999 — OUVRIR, c'est CONSOMMER ; la navigation d'ABORD, la consommation attend le `markAsRead` REST.
            openNotification(userInfo)
            await consumeTapped(payload)

        case UNNotificationDismissActionIdentifier:
            break

        case MeeshyNotificationAction.markRead.rawValue:
            await handleMarkRead(payload)

        case MeeshyNotificationAction.reply.rawValue:
            await handleReply(payload, userInfo: userInfo, replyText: replyText)

        case MeeshyNotificationAction.comment.rawValue:
            await handleComment(payload, userInfo: userInfo, replyText: replyText)

        case MeeshyNotificationAction.accept.rawValue:
            await handleFriendResponse(payload, userInfo: userInfo, accepted: true)

        case MeeshyNotificationAction.decline.rawValue:
            await handleFriendResponse(payload, userInfo: userInfo, accepted: false)

        case MeeshyNotificationAction.callback.rawValue:
            await consumeTapped(payload)
            guard let request = CallBackRequest(notification: payload) else {
                openNotification(userInfo)
                return
            }
            dialCallBack(request)

        case MeeshyNotificationAction.view.rawValue,
             MeeshyNotificationAction.answerCall.rawValue:
            // All of these surface the app to the relevant screen — the
            // deep-link router decides the destination based on payload.type.
            openNotification(userInfo)
            await consumeTapped(payload)

        case MeeshyNotificationAction.openInMaps.rawValue,
             MeeshyNotificationAction.addContact.rawValue,
             MeeshyNotificationAction.joinInvite.rawValue:
            handleDetailAction(actionIdentifier, userInfo: userInfo)
            await consumeTapped(payload)

        case MeeshyNotificationAction.stopBring.rawValue:
            await handleStopBring(userInfo)

        case MeeshyNotificationAction.declineCall.rawValue:
            // Silent decline — no navigation. The VoIP layer handles the
            // actual decline via CallKit; APNs declineCall is just
            // bookkeeping so we don't reopen the call screen.
            break

        default:
            openNotification(userInfo)
            await consumeTapped(payload)
        }
    }

    /// #17442 — « Arrêter » sur la bannière d'un Bring : le Bring s'éteint partout, l'app ne s'ouvre pas.
    private func handleStopBring(_ userInfo: [AnyHashable: Any]) async {
        guard let bringId = userInfo["bringId"] as? String, !bringId.isEmpty else { return }
        await stopBring(bringId)
    }

    // MARK: - Conversation verrouillée par PIN (#12655)

    /// Les gestes qu'une conversation sous PIN refuse depuis l'écran
    /// verrouillé : ceux qui ÉCRIVENT dans la conversation (répondre, marquer
    /// lu) et ceux qui AGISSENT sur son contenu (suivre l'invitation, ajouter
    /// le contact, ouvrir la position dans Plans).
    static let pinGuardedActions: Set<String> = [
        MeeshyNotificationAction.reply.rawValue,
        MeeshyNotificationAction.markRead.rawValue,
        MeeshyNotificationAction.joinInvite.rawValue,
        MeeshyNotificationAction.addContact.rawValue,
        MeeshyNotificationAction.openInMaps.rawValue,
    ]

    /// Défense en profondeur derrière la catégorie sans action de l'extension :
    /// une bannière livrée avant le verrou, ou catégorisée par la passerelle
    /// quand l'extension n'a pas tourné (tuée, hors budget), porte encore ses
    /// gestes. Sur une conversation verrouillée (ou une charge scellée), rien
    /// ne part, rien n'est marqué lu, aucun lien n'est suivi : l'app s'ouvre
    /// sur la conversation, que la porte du routeur garde par le PIN. Une
    /// réponse, exécutée en arrière-plan, le dit par une notification locale.
    private func refusesUnderConversationPin(
        _ actionIdentifier: String,
        payload: NotificationPayload,
        userInfo: [AnyHashable: Any]
    ) -> Bool {
        guard Self.pinGuardedActions.contains(actionIdentifier) else { return false }
        let locked = payload.conversationId.map { conversationLocks.mayBeLocked($0) } ?? false
        guard locked || NSEAttachmentPolicy.isSealedForLockedConversation(userInfo) else { return false }
        logger.info("notification action refused: conversation locked by PIN")
        if actionIdentifier == MeeshyNotificationAction.reply.rawValue {
            notifyRefusedReply(payload.conversationId)
        }
        openNotification(userInfo)
        return true
    }

    // MARK: - Détail d'un message (#8858)

    /// Exécute le geste que la catégorie du détail propose. Le détail se relit
    /// par la MÊME politique que l'extension a appliquée pour choisir la
    /// catégorie — protection comprise. Faute de détail lisible, le geste
    /// ouvre la notification : un bouton ne reste jamais inerte.
    private func handleDetailAction(_ actionIdentifier: String, userInfo: [AnyHashable: Any]) {
        switch (actionIdentifier, NotificationDetailPolicy.detail(userInfo: userInfo)) {
        case (MeeshyNotificationAction.openInMaps.rawValue, .location(let place)?):
            guard let url = place.mapsURL else { return openNotification(userInfo) }
            openExternalURL(url)
        case (MeeshyNotificationAction.addContact.rawValue, .contact(let card)?):
            openNotification(userInfo)
            presentNewContact(card)
        case (MeeshyNotificationAction.joinInvite.rawValue, .invite(let invite)?):
            // Une invitation ne mène qu'à une jointure : un lien d'e-mail
            // glissé à sa place n'entre jamais par la voie système (#10874).
            guard Self.isInvitation(invite.url) else { return openNotification(userInfo) }
            openDeepLink(invite.url)
        default:
            openNotification(userInfo)
        }
    }

    static func isInvitation(_ url: URL) -> Bool {
        switch DeepLinkParser.parse(url) {
        case .joinLink, .chatLink: return true
        default: return false
        }
    }

    // MARK: - Consommation d'une bannière (#6999)

    /// Marque lue la notification que le geste vient d'ouvrir ou de résoudre.
    ///
    /// `notificationId` est la SEULE clé qui couvre tous les types : un
    /// `security_alert`, un `login_new_device`, un `password_changed`, un
    /// `friend_request` n'ont ni `conversationId` ni `postId`, et n'avaient donc
    /// aucun chemin vers « lu » — ils le restaient à vie. Le gateway la pose
    /// depuis toujours ; c'est le décodeur client qui l'ignorait.
    ///
    /// La consommation par FIL (conversation, post) n'est PAS faite ici : elle
    /// suit la navigation (`onConversationOpened` / `onPostOpened`), qui sait
    /// ce qui s'est réellement ouvert. Faire les deux marquerait lues des
    /// lignes que l'utilisateur n'a pas atteintes si le routage échoue.
    func consumeTapped(_ payload: NotificationPayload) async {
        guard let notificationId = payload.notificationId else { return }
        await consume(.notification(id: notificationId))
    }

    // MARK: - Mark read

    private func handleMarkRead(_ payload: NotificationPayload) async {
        guard let conversationId = payload.conversationId else { return }
        localMarkRead(conversationId)
        do {
            try await conversationService.markRead(conversationId: conversationId)
        } catch {
            logger.error("markRead REST failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        removeDeliveredForConversation(conversationId)
    }

    /// #14667, #14673 — la suite des réponses dont le régime attend : relecture,
    /// retrait, effacement du clair (`NotificationReplyRegimeWait`).
    lazy var awaitingReplies = NotificationReplyRegimeWait(
        store: repliesAwaitingRegime,
        rules: awaitingReplyRules,
        endToEnd: endToEnd,
        currentUserId: currentUserId,
        destination: { [unowned self] in await self.replyRegime.destination(of: $0, userInfo: [:]) },
        offThreadReply: { [unowned self] in self.offThreadReply },
        sendReadable: { [unowned self] in await self.sendReadableReply($0, senderId: $1) },
        notifyRefusedEndToEndReply: notifyRefusedEndToEndReply
    )
}
