// apps/ios/Meeshy/Core/DependencyContainer.swift

import Foundation
import Combine
import MeeshySDK
import os
import UIKit

private nonisolated let containerLogger = MeeshyLog.logger(.dependencyContainer)

@MainActor
final class DependencyContainer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = DependencyContainer()

    /// La base locale des messages est celle du compte ACTIF. Les trois
    /// accesseurs ci-dessous la relisent à chaque appel : un site qui les
    /// consulte au moment d'écrire vise la bonne base, un site qui a capturé
    /// une session garde celle du compte qui l'a ouverte.
    let storeRouter: MessageStoreRouter
    nonisolated var database: MessageStoreDatabase { storeRouter.current.database }
    nonisolated var messagePersistence: MessagePersistenceActor { storeRouter.current.messagePersistence }
    nonisolated var feedPersistence: FeedPersistenceActor { storeRouter.current.feedPersistence }
    /// Sessions quittées dont la purge de sortie n'a pas encore tourné : la
    /// bascule (synchrone) les dépose, `wireOutboxLogoutHook` les consomme.
    private var sessionsAwaitingPurge: [MessageStoreSession] = []
    /// Pont de persistance GRDB du feed. Possédé par le container — donc par
    /// l'app — et non plus par `FeedView` : armé au montage de l'écran et
    /// désarmé à sa disparition, il ratait tout ce qui arrivait pendant que le
    /// feed n'était pas affiché (post créé, commentaire, réaction, traduction).
    /// La persistance disque ne doit dépendre d'aucune vue.
    let feedSocketHandler: FeedSocketHandler

    /// Q3 (P1 hotfix) — Combine subscriptions tenues par le container.
    /// Aujourd'hui : un seul abonnement sur `AuthManager.isAuthenticated` pour
    /// le hook outbox logout (cf. `wireOutboxLogoutHook`).
    private var cancellables = Set<AnyCancellable>()

    /// Snapshot of how the database came up. Surfaced to ``AppDelegate``
    /// (which forwards the non-empty case to Crashlytics) and to the
    /// RecoveryView when ``fellBackToEphemeralStorage`` is true.
    let initDiagnostics: DatabaseInitDiagnostics

    private init() {
        // La base ouverte au démarrage est celle du compte du TROUSSEAU,
        // lue en synchrone : un compte restauré se sert depuis SA base avant que
        // `checkExistingSession()` n'ait fini, cache-first.
        let directory = Self.databaseDirectory()
        let fallbackDirectory = Self.databaseDirectory(groupContainer: nil)
        let initialKey = Self.activeAccountStoreKey()
        MessageStoreRouter.adoptLegacyStore(in: directory, for: initialKey)
        Self.carryAutoVacuumFlag(to: initialKey)
        let router = MessageStoreRouter(initialKey: initialKey) { key in
            let session = MessageStoreSession.open(
                key: key, directory: directory, fallbackDirectory: fallbackDirectory
            )
            Self.enableIncrementalAutoVacuumOnce(on: session)
            return session
        }
        self.storeRouter = router
        self.storeDirectory = directory
        self.feedSocketHandler = FeedSocketHandler(persistenceProvider: { router.current.feedPersistence })
        self.initDiagnostics = router.current.diagnostics

        // Q3 (P1 hotfix) — au logout, purge TOUTES les tables messages
        // on-device. Sans ça, des messages enqueued par user A pourraient
        // être envoyés sous l'identité du user B après un logout+login rapide
        // sur le même device. Hook côté app car le SDK AuthManager ne connaît
        // pas DependencyContainer (qui est app-side).
        wireAccountStoreSwitch()
        wireOutboxLogoutHook()
        wireRetainedAccountsSweep()

        // Mirror every API message the SyncEngine sees (global `message:new`
        // relay, push-driven `ensureMessages`, pagination) into the GRDB
        // message store. The engine only maintains CacheCoordinator (list
        // previews); the conversation timeline reads GRDB — without this hook
        // a message received while its conversation is closed shows in the
        // list preview but is missing when the conversation opens.
        //
        // La page va dans la base du compte qui l'a DEMANDÉE
        // (`currentSyncOwner`), et nulle part si ce compte n'est plus actif.
        ConversationSyncEngine.shared.apiMessagePersistor = { [router] messages in
            guard !messages.isEmpty,
                  let session = router.session(ownedBy: ConversationSyncEngine.currentSyncOwner)
            else { return }
            // Le prisme du lecteur se résout ICI, à la MISE EN FILE : lu depuis
            // la boucle d'écriture sérielle de la persistance, il y faisait
            // attendre chaque lot que le MainActor — donc le RENDU — soit
            // libre, et les réconciliations en file derrière lui attendaient
            // avec.
            await session.messagePersistence.bufferIncomingAPIMessages(
                messages, preferredLanguages: MessagePersistenceActor.readerPrism()
            )
        }

        // Même raison pour les mutations qui ne portent PAS d'`APIMessage` :
        // edit, suppression, réaction et vue unique consommée. Sans ce relais
        // elles n'atteindraient que `cache.messages`, que la timeline ne lit pas :
        // hors-ligne, rouvrir la conversation afficherait le texte d'avant
        // l'édition, la bulle supprimée et la réaction manquante jusqu'au
        // prochain refetch REST.
        ConversationSyncEngine.shared.realtimeMessagePersistor = { [router] mutation in
            guard let session = router.session(ownedBy: ConversationSyncEngine.currentSyncOwner) else { return }
            await Self.persist(mutation, into: session.messagePersistence)
        }
    }

    /// Le dossier des bases de compte (App Group, ou Application Support
    /// quand l'entitlement manque).
    let storeDirectory: URL

    /// La base qui revient au compte ACTIF — utilisateur + environnement.
    static func activeAccountStoreKey() -> MessageStoreAccountKey? {
        MessageStoreAccountKey(
            userId: AuthManager.shared.activeAccountId,
            serverOrigin: MeeshyConfig.shared.persistedServerOrigin
        )
    }

    // MARK: - Bascule SYNCHRONE de la base locale

    /// Bascule la base AVANT que la session suivante ne lise quoi que ce soit.
    ///
    /// Aucun `receive(on:)` : un `@Published` émet dans son `willSet`, sur le
    /// fil qui l'écrit — le principal pour `AuthManager`. Le sink tourne donc
    /// DANS l'affectation de `isAuthenticated`, avant tout observateur
    /// asynchrone et avant que SwiftUI ne remonte la racine. La purge de la
    /// session quittée, elle, peut rester asynchrone : plus rien ne la lit.
    private func wireAccountStoreSwitch() {
        Publishers.CombineLatest(
            AuthManager.shared.$hasResolvedStoredSession,
            AuthManager.shared.$isAuthenticated
        )
        .sink { [weak self] resolved, isAuthenticated in
            MainActor.assumeIsolated {
                self?.applyAccountStore(sessionResolved: resolved, isAuthenticated: isAuthenticated)
            }
        }
        .store(in: &cancellables)
    }

    private func applyAccountStore(sessionResolved: Bool, isAuthenticated: Bool) {
        let target = MessageStoreTarget.resolve(
            sessionResolved: sessionResolved,
            isAuthenticated: isAuthenticated,
            activeKey: Self.activeAccountStoreKey()
        )
        guard case let .account(key) = target else { return }
        EndToEndRegimeMemory.shared.bind(account: key.map(EndToEndRegimeMemory.account(of:)))
        // Un compte quitté SANS être déconnecté (changement de compte,
        // ajout d'un compte) garde sa base ouverte pour son retour ; seul un
        // compte dont les jetons sont partis (déconnexion, session révoquée,
        // retrait) voit la sienne purgée.
        let keepsLeaving = AccountDataRetention.keepsData(of: storeRouter.current.key, arriving: key) {
            AuthManager.shared.hasPreservedSession(for: $0)
        }
        let outgoing = storeRouter.activate(key, keepingOutgoing: keepsLeaving)
        if let outgoing, outgoing.key != nil, !keepsLeaving {
            sessionsAwaitingPurge.append(outgoing)
        }
        if key == nil {
            MessageStoreRouter.sweepDormantAccountStores(
                in: storeDirectory,
                keeping: storeRouter.openAccountFileNames
                    .union(sessionsAwaitingPurge.map(\.fileName))
                    .union(retainedAccountKeys().map(\.databaseFileName))
            )
        }
        guard outgoing != nil else { return }
        // La NSE dérive la base du destinataire de l'environnement publié :
        // un environnement changé à l'écran de connexion doit l'atteindre
        // AVANT le premier push de la session.
        if key != nil { WidgetDataManager.shared.publishAPIBaseURL() }
        let incoming = storeRouter.current.database.pool
        Task { await OfflineQueue.shared.configure(pool: incoming) }
    }

    private func takeSessionsAwaitingPurge() -> [MessageStoreSession] {
        defer { sessionsAwaitingPurge = [] }
        return sessionsAwaitingPurge
    }

    // MARK: - Ce que l'appareil garde de chaque compte

    private func retainedAccountKeys() -> Set<MessageStoreAccountKey> {
        AccountDataRetention.retainedKeys(
            savedAccountIds: AuthManager.shared.savedAccounts.map(\.id),
            activeUserId: AuthManager.shared.activeAccountId,
            serverOrigin: MeeshyConfig.shared.persistedServerOrigin
        )
    }

    /// Les comptes absents du sélecteur n'ont plus rien sur l'appareil : au
    /// démarrage (une fois le sélecteur relu) et à chaque retrait, leurs bases,
    /// leurs caches mis de côté et leurs points de reprise partent.
    ///
    /// Jamais tant que les données protégées sont indisponibles (appareil
    /// verrouillé au réveil en arrière-plan) : un sélecteur illisible ne dit
    /// pas qu'il est vide.
    private func wireRetainedAccountsSweep() {
        Publishers.CombineLatest(
            AuthManager.shared.$hasResolvedStoredSession,
            AuthManager.shared.$savedAccounts.map { $0.map(\.id) }
        )
        .filter { resolved, _ in resolved }
        .map { _, ids in ids }
        .removeDuplicates()
        .receive(on: DispatchQueue.main)
        .sink { [weak self] _ in self?.forgetAccountsNoLongerOnDevice() }
        .store(in: &cancellables)
    }

    private func forgetAccountsNoLongerOnDevice() {
        guard UIApplication.shared.isProtectedDataAvailable else { return }
        let retained = retainedAccountKeys()
        let dropped = storeRouter.dropSessions(keeping: retained)
        // Les pièces de commentaire des comptes que l'appareil ne garde plus.
        OfflineQueue.purgePendingCommentMedia(keepingOwners: Set(retained.map(\.userId)))
        MessageStoreRouter.sweepDormantAccountStores(
            in: storeDirectory,
            keeping: storeRouter.openAccountFileNames
                .union(sessionsAwaitingPurge.map(\.fileName))
                .union(retained.map(\.databaseFileName))
        )
        CacheAccountBinder.shared.sweep(keeping: retained)
        guard !dropped.isEmpty else { return }
        let router = storeRouter
        Task {
            for session in dropped {
                await Self.purge(session)
                router.retire(session)
            }
        }
    }

    private nonisolated static func purge(_ session: MessageStoreSession) async {
        // Les pièces de commentaire en attente d'un compte retiré
        // quittent le disque avec sa base.
        OfflineQueue.purgePendingCommentMedia(ownerId: session.key?.userId)
        do {
            try await session.messagePersistence.clearAllMessagesForLogout()
        } catch {
            containerLogger.error("Removed account message purge failed: \(error.localizedDescription, privacy: .public)")
        }
        do {
            try await session.feedPersistence.clearAllForLogout()
        } catch {
            containerLogger.error("Removed account feed purge failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Auto-vacuum incrémental, une fois par base

    private nonisolated static let legacyAutoVacuumKey = "meeshy.db.autoVacuumOneShotDone"

    private nonisolated static func autoVacuumKey(for fileName: String) -> String {
        "\(legacyAutoVacuumKey).\(fileName)"
    }

    /// L'ancienne base partagée, attribuée au compte actif, a déjà reçu son
    /// réglage : ne pas le rejouer sur un fichier qui n'a pas changé.
    private static func carryAutoVacuumFlag(to key: MessageStoreAccountKey?) {
        guard let key, UserDefaults.standard.bool(forKey: legacyAutoVacuumKey) else { return }
        UserDefaults.standard.set(true, forKey: autoVacuumKey(for: key.databaseFileName))
    }

    /// Skip the auto-vacuum tune on the signed-out store and on the ephemeral
    /// fallback — the temp file dies with this launch.
    private nonisolated static func enableIncrementalAutoVacuumOnce(on session: MessageStoreSession) {
        guard session.key != nil, !session.diagnostics.fellBackToEphemeralStorage else { return }
        let flag = autoVacuumKey(for: session.fileName)
        guard !UserDefaults.standard.bool(forKey: flag) else { return }
        let pool = session.database.pool
        Task.detached(priority: .background) {
            do {
                try DatabaseMaintenance.enableIncrementalAutoVacuumOneShot(on: pool)
            } catch {
                containerLogger.error("Failed to enable incremental auto-vacuum: \(error.localizedDescription, privacy: .public)")
            }
            UserDefaults.standard.set(true, forKey: flag)
        }
    }

    // MARK: - Realtime message mutations → table canonique

    /// Route une mutation temps réel du SDK vers la table `messages`. Chaque
    /// écriture est idempotente côté acteur (garde `alreadyExists` sur
    /// `appendReaction`, garde d'ordre sur `markEdited`), donc le double
    /// passage relais + `ConversationSocketHandler` sur la conversation
    /// OUVERTE est sans effet de bord — c'est ce qui permet au relais de ne
    /// pas dépendre d'un état « conversation ouverte » toujours en retard
    /// d'un cycle de vie de vue.
    nonisolated static func persist(
        _ mutation: RealtimeMessageMutation,
        into persistence: MessagePersistenceActor
    ) async {
        await StarredMessagesStore.follow(mutation, persistence: persistence)
        do {
            switch mutation {
            case let .edited(messageId, content, editedAt, marksEdited, authorship):
                try await persistence.markEdited(
                    localId: messageId, newContent: content, editedAt: editedAt, marksEdited: marksEdited,
                    authorship: authorship)
            case let .callNoticeUpdated(messageId, content, callSummaryJson, serverUpdatedAt):
                try await persistence.applyCallNoticeUpdate(
                    localId: messageId, content: content,
                    callSummaryJson: callSummaryJson, serverUpdatedAt: serverUpdatedAt
                )
            case let .deleted(messageId, deletedAt):
                try await persistence.markDeleted(localId: messageId, deletedAt: deletedAt, sparingOpenedViewOnce: true)
            case let .expired(messageId, expiredAt):
                // Même écriture que la conversation OUVERTE
                // (`ConversationSocketHandler`) : contenu vidé, citations
                // scellées — une vue unique n'y est pas épargnée.
                try await persistence.markDeleted(localId: messageId, deletedAt: expiredAt, expired: true)
                // Les réponses d'un mort quittent la base avec lui.
                try await persistence.purgeQuoteCascade(fromDead: [messageId])
            case let .citedPostWithdrawn(postId, conversationId, _):
                try await persistence.markCitedPostWithdrawn(postId: postId, conversationId: conversationId)
            case let .reactionAdded(messageId, reactionId, emoji, participantId, maxCount, ownerUserId):
                try await persistence.appendReaction(
                    localId: messageId, reactionId: reactionId, messageId: messageId,
                    participantId: participantId, emoji: emoji, maxCount: maxCount,
                    ownerUserId: ownerUserId
                )
            case let .reactionRemoved(messageId, emoji, participantId, ownerUserId, aggregateCount, aggregateParticipantIds):
                try await persistence.removeReaction(
                    localId: messageId, emoji: emoji, participantId: participantId,
                    ownerUserId: ownerUserId, aggregateCount: aggregateCount,
                    aggregateParticipantIds: aggregateParticipantIds
                )
            case let .consumed(messageId, viewOnceCount):
                try await persistence.updateViewOnceCount(localId: messageId, count: viewOnceCount)
            case let .viewOnceOpened(messageId):
                try await persistence.markViewOnceOpened(localId: messageId)
            case let .senderRepainted(event):
                try await persistence.repaintSender(event)
            case .starred, .unstarred:
                break
            }
        } catch {
            containerLogger.error("Realtime message persistence failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Q3 — Outbox session quiesce hook

    /// startup-03 — état armé par `sessionInvalidated` (serveur), consommé au
    /// flip isAuthenticated : distingue invalidation de session et logout
    /// volontaire pour le toast de perte.
    private var sessionWasInvalidated = false

    /// Pure — la perte de messages en attente n'est signalée que quand la
    /// purge suit une invalidation SERVEUR (jamais un logout volontaire) ET
    /// qu'il restait des lignes outbox non envoyées.
    static func shouldSurfaceOutboxLossToast(sessionWasInvalidated: Bool, pendingCount: Int) -> Bool {
        sessionWasInvalidated && pendingCount > 0
    }

    /// Pattern calqué sur `ConversationAudioCoordinator.wireAuthLogoutHook` :
    /// observe la transition `isAuthenticated true→false` et purge TOUTES les
    /// tables messages on-device (outbox + `messages` autoritaire +
    /// translations/transcriptions/audio/attachments/pending_ids via
    /// `clearAllMessagesForLogout`). Sans la purge de `messages`, user B verrait
    /// le contenu de user A au prochain login (table non namespacée par userId,
    /// lue par `MessageStore.loadInitialSnapshot`).
    /// startup-03 — la purge reste INCONDITIONNELLE (invariant anti fuite
    /// cross-compte Q3) ; quand elle suit une invalidation de session serveur
    /// avec des envois en attente, l'utilisateur en est informé par un toast.
    private func wireOutboxLogoutHook() {
        AuthManager.shared.sessionInvalidated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.sessionWasInvalidated = true }
            .store(in: &cancellables)
        // PAS de `.dropFirst()` : la valeur INITIALE compte. Les fins de session
        // les plus courantes n'émettent aucune transition `true → false` observée
        // EN VOL : l'app tuée pendant la session, le jeton expiré constaté au
        // démarrage, la session invalidée côté serveur entre deux lancements.
        // Dans ces trois cas l'app démarre déjà déconnectée (première valeur
        // `false`), et la file du compte sortant survivrait jusqu'au compte suivant.
        //
        // Le `filter { !$0 }` seul ne suffit pas : le booléen confond « pas encore
        // regardé » et « regardé, personne ». `isAuthenticated` naît `false`,
        // `checkExistingSession()` est async, et ce conteneur s'abonne à la
        // CONSTRUCTION de l'`App` : un `@Published` rejoue sa valeur courante au
        // nouvel abonné, donc `false` traverserait le filtre et la purge partirait
        // à CHAQUE démarrage à froid, sur une session parfaitement valide.
        //
        // `hasResolvedStoredSession` apporte le troisième état. Le cas « app tuée,
        // jeton expiré, session invalidée entre deux lancements » reste couvert :
        // il se présente comme « résolu, personne », et purge. Le toast reste
        // gouverné par `sessionWasInvalidated` — faux au démarrage à froid, donc
        // aucun message ne s'affiche pour une purge de résidus.
        Publishers.CombineLatest(
            AuthManager.shared.$hasResolvedStoredSession,
            AuthManager.shared.$isAuthenticated
        )
        .map { SessionPurgeDecision.shouldPurgeLocalMessages(sessionResolved: $0, isAuthenticated: $1) }
        .removeDuplicates()
        .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                ConversationListPreviewLoader.purgeAllLive() // EN TÊTE, avant toute purge attendue (#11232)
                let invalidated = self?.sessionWasInvalidated ?? false
                self?.sessionWasInvalidated = false
                // La purge vise les bases QUITTÉES, que la bascule
                // synchrone a déjà retirées de la lecture : la session suivante
                // ne les voit plus, qu'elle démarre avant ou après ce nettoyage.
                let outgoing = self?.takeSessionsAwaitingPurge() ?? []
                let router = self?.storeRouter
                Task {
                    var pendingCount = 0
                    for session in outgoing {
                        let persistence = session.messagePersistence
                        let feed = session.feedPersistence
                        do {
                            pendingCount += try await persistence.pendingOutboxCount()
                            try await persistence.clearAllMessagesForLogout()
                        } catch {
                            containerLogger.error("Q3 logout message purge failed: \(error.localizedDescription, privacy: .public)")
                        }
                        // Purge feed indépendante : un échec d'un côté n'empêche pas l'autre.
                        // Les pièces de commentaire en attente du compte
                        // quitté partent avec sa file : rien ne reste sur le
                        // disque pour le compte suivant.
                        OfflineQueue.purgePendingCommentMedia(ownerId: session.key?.userId)
                        do {
                            try await feed.clearAllForLogout()
                        } catch {
                            containerLogger.error("grdb-01 logout feed purge failed: \(error.localizedDescription, privacy: .public)")
                        }
                        // Purgée, la base quittée quitte aussi le disque :
                        // un acteur encore capturé n'y réécrira jamais rien que
                        // le compte retrouverait en revenant.
                        router?.retire(session)
                    }
                    // La purge SQL ci-dessus vide la TABLE ; l'acteur
                    // `OfflineQueue` garde, lui, ses `items` et ses
                    // `outcomeTombstones` EN MÉMOIRE. Sans cette ligne, le
                    // bandeau continuerait d'afficher les lignes du compte sortant
                    // et `retryAll()` — qui n'a aucun filtre de statut et se
                    // déclenche au retour du réseau — pourrait encore les rejouer,
                    // sous le jeton du compte SUIVANT. `clearAll()` fait les
                    // trois (mémoire, tombstones, base).
                    await OfflineQueue.shared.clearAll()
                    if DependencyContainer.shouldSurfaceOutboxLossToast(
                        sessionWasInvalidated: invalidated, pendingCount: pendingCount
                    ) {
                        await MainActor.run {
                            FeedbackToastManager.shared.showError(
                                String(localized: "outbox.sessionInvalidated.pendingLost",
                                       defaultValue: "Des messages non envoyés ont été annulés — reconnectez-vous.",
                                       bundle: .main)
                            )
                        }
                    }
                    // outbox-11 — résidus cross-compte hors messages/feed :
                    // impressions (UserDefaults standard, clés sans userId,
                    // rejouées dès l'init de chaque surface) et
                    // PendingStatusQueue. (pending_mark_read App Group est
                    // couvert par le wipe appgroup-01 — pas de doublon ici.)
                    ImpressionBatcher.purgeAllPendingImpressions()
                    // Les pages servies au compte sortant ne situent
                    // pas les impressions du suivant.
                    ListingContextLedger.shared.reset()
                    // La file v2 et l'approximation des contenus
                    // affichés appartiennent au compte sortant.
                    await SocialEventsV2Outbox.shared.purgeAll()
                    SocialNotificationInbox.shared.purge()
                    await MainActor.run { RecentDisplayCaptureSource.shared.reset() }
                    // La présence vue (carte + fichier sans compte) appartient au
                    // compte sortant : le suivant ne la reçoit jamais du serveur.
                    await MainActor.run { DependencyContainer.resetInMemoryAccountState() }
                    ContactResolveService.shared.purge()
                    await PendingStatusQueue.shared.clearAll()
                    // Les brouillons de commentaire sont rangés par post,
                    // sans compte : un post vu des deux comptes rendrait au
                    // second le brouillon du premier.
                    await MainActor.run { CommentDraftStore.shared.clearAll() }
                    // Création du composer (E9) et copies temporaires du glisser : au compte sortant.
                    ComposerAutosaveStore.shared.deleteAll()
                    BubbleDragScratch.purge()
                }
            }
            .store(in: &cancellables)
    }

    /// L'état « par compte » tenu en mémoire hors des bases, rendu vierge à la
    /// déconnexion : la présence vue, les contours de story, les amis du `@`,
    /// les relations des fiches contact, la citation du brouillon de
    /// commentaire, les rappels de série, les protections armées.
    private static func resetInMemoryAccountState() {
        PresenceManager.shared.resetForLogout()
        StoryViewerParticipationStore.shared.resetForLogout()
        MentionContactsStore.shared.resetForLogout()
        CommentQuotationStore.shared.clearAll()
        StreakReminderScheduler.shared.annulerTout()
        ConversationProtectionPreferenceStore.shared.purgeAll()
        ArrivalCelebrationController.shared.resetForLogout()
    }

    // MARK: - App Group shared path (O6)

    /// Le conteneur est résolu hors du fil principal dès l'entrée du processus
    /// (`LaunchPrefetch`, #11558), jamais gardé d'un lancement à l'autre.
    static func databaseDirectory() -> URL {
        databaseDirectory(groupContainer: AppGroupContainer.url)
    }

    /// Le dossier des bases de messages — une par compte.
    ///
    /// `groupContainer` is `nil` when the signed binary lost the app-group
    /// entitlement (seen on Xcode Cloud distribution-signed TestFlight
    /// builds — launch crash-loop). Trapping here
    /// boot-loops the app on EVERY launch; falling back to Application
    /// Support keeps the user in the app, merely without NSE/widget data
    /// sharing until the signing issue is fixed.
    static func databaseDirectory(groupContainer: URL?) -> URL {
        if groupContainer == nil {
            containerLogger.fault("App-group container unavailable (missing entitlement?) — falling back to Application Support for the message store")
        }
        let base = groupContainer ?? URL.applicationSupportDirectory
        let dbDir = base.appendingPathComponent("Database")
        if !FileManager.default.fileExists(atPath: dbDir.path) {
            do {
                try FileManager.default.createDirectory(at: dbDir, withIntermediateDirectories: true)
            } catch {
                containerLogger.error("Failed to create database directory at \(dbDir.path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        applyFileProtection(to: [dbDir.path])
        return dbDir
    }

    /// N2 — pin `.completeUntilFirstUserAuthentication` on a message store
    /// (directory + sqlite + WAL/SHM sidecars), mirroring
    /// `AppDatabase.resolveDatabaseURL`. The main app's
    /// `default-data-protection = NSFileProtectionComplete` entitlement would
    /// otherwise make any file (re)created by the app unreadable to the NSE
    /// while the device is locked — silently disabling pre-persist.
    nonisolated static func applyMessageStoreFileProtection(
        directoryPath: String,
        databasePath: String
    ) {
        let fileManager = FileManager.default
        let sidecars = ["", "-wal", "-shm"]
            .map { databasePath + $0 }
            .filter { fileManager.fileExists(atPath: $0) }
        applyFileProtection(to: [directoryPath] + sidecars)
    }

    private nonisolated static func applyFileProtection(to paths: [String]) {
        let protection: [FileAttributeKey: Any] = [
            .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
        ]
        for path in paths {
            do {
                try FileManager.default.setAttributes(protection, ofItemAtPath: path)
            } catch {
                containerLogger.error("Failed to set file protection on \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
