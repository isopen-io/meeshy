// apps/ios/Meeshy/Core/DependencyContainer.swift

import Foundation
import Combine
import GRDB
import MeeshySDK
import os
import UIKit

private nonisolated let containerLogger = Logger(subsystem: "me.meeshy.app", category: "dependency-container")

/// Diagnostic record produced by ``DependencyContainer`` boot.
///
/// The container no longer crashes the app when the on-disk database
/// cannot be opened — corrupted SQLite files are quarantined and
/// recreated, inaccessible paths fall back to Application Support
/// (entitlement-less builds: the app-group container resolves but the
/// sandbox denies access, seen on iOS-on-Mac build 1750, 2026-08-11),
/// and as a last resort a unique temp-file pool is used so the user
/// lands in the app (in degraded mode) instead of a crash loop. This
/// struct records what happened so the host app can surface the issue
/// to the user and to Crashlytics.
nonisolated struct DatabaseInitDiagnostics: Sendable, Equatable {
    var firstAttemptError: String?
    var recoveryAttempted: Bool = false
    var quarantinedFilePath: String?
    var fellBackToSecondaryPath: Bool = false
    var fellBackToEphemeralStorage: Bool = false
}

@MainActor
final class DependencyContainer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = DependencyContainer()

    /// #8656 — la base locale des messages est celle du compte ACTIF. Les trois
    /// accesseurs ci-dessous la relisent à chaque appel : un site qui les
    /// consulte au moment d'écrire vise la bonne base, un site qui a capturé
    /// une session garde celle du compte qui l'a ouverte.
    let storeRouter: MessageStoreRouter
    nonisolated var dbPool: DatabasePool { storeRouter.current.dbPool }
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
        // #8656 — la base ouverte au démarrage est celle du compte du TROUSSEAU,
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
        // #8656 — la page va dans la base du compte qui l'a DEMANDÉE
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
        // edit, suppression, réaction et vue unique consommée n'atteignaient que
        // `cache.messages`, que la timeline ne lit pas. Hors-ligne, rouvrir la
        // conversation affichait donc le texte d'avant l'édition, la bulle
        // supprimée et la réaction manquante jusqu'au prochain refetch REST.
        ConversationSyncEngine.shared.realtimeMessagePersistor = { [router] mutation in
            guard let session = router.session(ownedBy: ConversationSyncEngine.currentSyncOwner) else { return }
            await Self.persist(mutation, into: session.messagePersistence)
        }
    }

    /// Le dossier des bases de compte (App Group, ou Application Support
    /// quand l'entitlement manque).
    let storeDirectory: URL

    /// La base qui revient au compte ACTIF — utilisateur + environnement (#8657).
    static func activeAccountStoreKey() -> MessageStoreAccountKey? {
        MessageStoreAccountKey(
            userId: AuthManager.shared.activeAccountId,
            serverOrigin: MeeshyConfig.shared.persistedServerOrigin
        )
    }

    // MARK: - #8656 — bascule SYNCHRONE de la base locale

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
        // #8674 — un compte quitté SANS être déconnecté (changement de compte,
        // ajout d'un compte) garde sa base ouverte pour son retour ; seul un
        // compte dont les jetons sont partis (déconnexion, session révoquée,
        // retrait) voit la sienne purgée.
        let keepsLeaving = AccountDataRetention.keepsData(of: storeRouter.current.key) {
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
        // AVANT le premier push de la session (#8657).
        if key != nil { WidgetDataManager.shared.publishAPIBaseURL() }
        let incoming = storeRouter.current.dbPool
        Task { await OfflineQueue.shared.configure(pool: incoming) }
    }

    private func takeSessionsAwaitingPurge() -> [MessageStoreSession] {
        defer { sessionsAwaitingPurge = [] }
        return sessionsAwaitingPurge
    }

    // MARK: - #8674 — ce que l'appareil garde de chaque compte

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
        let pool = session.dbPool
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
            case let .edited(messageId, content, editedAt, marksEdited):
                try await persistence.markEdited(
                    localId: messageId, newContent: content, editedAt: editedAt, marksEdited: marksEdited)
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
                // scellées — une vue unique n'y est pas épargnée (#7960).
                try await persistence.markDeleted(localId: messageId, deletedAt: expiredAt, expired: true)
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
        // #5913 — PAS de `.dropFirst()`. Il écartait la valeur INITIALE, donc la
        // purge n'avait lieu que sur une transition `true → false` observée EN
        // VOL. Or les fins de session les plus courantes n'en émettent aucune :
        // l'app tuée pendant la session, le jeton expiré constaté au démarrage,
        // la session invalidée côté serveur entre deux lancements. Dans ces trois
        // cas l'app démarre déjà déconnectée — première valeur `false`, jetée —
        // et la file du compte sortant survivait jusqu'au compte suivant (mesuré :
        // 7 lignes de 12 h, dont 2 `blockUser` et 1 `unblockUser`).
        //
        // Le `filter { !$0 }` suffit à garder un démarrage CONNECTÉ hors de la
        // purge ; sur un démarrage déconnecté avec une file vide, le coût est une
        // lecture `pendingOutboxCount()` et rien d'autre. Le toast, lui, reste
        // gouverné par `sessionWasInvalidated` — faux au démarrage à froid, donc
        // aucun message ne s'affiche pour une purge de résidus.
        // #5968 — le booléen SEUL confond « pas encore regardé » et « regardé,
        // personne ». `isAuthenticated` naît `false`, `checkExistingSession()`
        // est async, et ce conteneur s'abonne à la CONSTRUCTION de l'`App` : un
        // `@Published` rejoue sa valeur courante au nouvel abonné, donc `false`
        // traversait `filter { !$0 }` et la purge partait à CHAQUE démarrage à
        // froid — 25 messages et 7 lignes d'outbox effacés sur une session
        // parfaitement valide, mesuré au simulateur de recette.
        //
        // Le commentaire de #5913 concluait « un `filter { !$0 }` suffit à
        // garder le démarrage CONNECTÉ hors de la purge ». C'est cette phrase
        // que la mesure réfute : au moment où le filtre s'applique, personne
        // n'a encore regardé s'il y a une session.
        //
        // `hasResolvedStoredSession` apporte le troisième état. Le cas de #5913
        // — app tuée, jeton expiré, session invalidée entre deux lancements —
        // reste couvert : il se présente comme « résolu, personne », et purge.
        Publishers.CombineLatest(
            AuthManager.shared.$hasResolvedStoredSession,
            AuthManager.shared.$isAuthenticated
        )
        .map { SessionPurgeDecision.shouldPurgeLocalMessages(sessionResolved: $0, isAuthenticated: $1) }
        .removeDuplicates()
        .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                let invalidated = self?.sessionWasInvalidated ?? false
                self?.sessionWasInvalidated = false
                // #8656 — la purge vise les bases QUITTÉES, que la bascule
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
                        // grdb-01 — purge feed indépendante : un échec d'un côté
                        // ne doit pas empêcher l'autre purge.
                        do {
                            try await feed.clearAllForLogout()
                        } catch {
                            containerLogger.error("grdb-01 logout feed purge failed: \(error.localizedDescription, privacy: .public)")
                        }
                        // #8656 — purgée, la base quittée quitte aussi le disque :
                        // un acteur encore capturé n'y réécrira jamais rien que
                        // le compte retrouverait en revenant.
                        router?.retire(session)
                    }
                    // #5913 — la purge SQL ci-dessus vide la TABLE ; l'acteur
                    // `OfflineQueue` garde, lui, ses `items` et ses
                    // `outcomeTombstones` EN MÉMOIRE. Sans cette ligne, le
                    // bandeau continue d'afficher les lignes du compte sortant
                    // et `retryAll()` — qui n'a aucun filtre de statut et se
                    // déclenche au retour du réseau — peut encore les rejouer,
                    // sous le jeton du compte SUIVANT. `clearAll()` fait les
                    // trois (mémoire, tombstones, base) ; elle n'avait jusqu'ici
                    // aucun appelant dans le dépôt.
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
                    await PendingStatusQueue.shared.clearAll()
                    // #8656 — les brouillons de commentaire sont rangés par post,
                    // sans compte : un post vu des deux comptes rendait au
                    // second le brouillon du premier.
                    await MainActor.run { CommentDraftStore.shared.clearAll() }
                    // #8848 — la création en cours du composer appartient au
                    // compte sortant, comme son brouillon de story (E9).
                    ComposerAutosaveStore.shared.deleteAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Recovery (P1.5 — no more fatalError on DB init)

    /// Open the on-disk database with one-shot recovery: if the first
    /// `DatabasePool(path:)` throws with a corruption-shaped error
    /// (typically `SQLITE_CORRUPT`), the offending file is moved aside
    /// with its WAL/SHM siblings, then a fresh database is opened at the
    /// same path. Access-denied errors skip the quarantine entirely — an
    /// unreadable file is not a corrupt one, and renaming or deleting it
    /// would destroy data a correctly-signed build could still read
    /// (iOS-on-Mac build 1750: the sandbox denies the app-group container
    /// when the binary lost its entitlement, `SQLITE_AUTH`).
    ///
    /// When the primary path is unusable, `fallbackPath` (Application
    /// Support in production) gets the same open-then-recover treatment.
    /// The last resort is a unique temp-file pool — NEVER `:memory:`,
    /// which a `DatabasePool` cannot honor (WAL requires a real file:
    /// "could not activate WAL Mode at path: :memory:"), so that old
    /// "fallback" trapped unconditionally and boot-looped the app.
    ///
    /// Internal access for ``DependencyContainerTests`` to drive the
    /// corrupted-file and denied-path flows against tmp directories.
    nonisolated static func openWithRecovery(
        dbPath: String,
        fallbackPath: @autoclosure () -> String? = nil,
        config: Configuration,
        fileManager: FileManager = .default,
        clock: () -> Date = Date.init,
        diagnostics: inout DatabaseInitDiagnostics
    ) -> DatabasePool {
        do {
            return try DatabasePool(path: dbPath, configuration: config)
        } catch {
            containerLogger.fault("Database open failed at \(dbPath, privacy: .public): \(error.localizedDescription, privacy: .public) — attempting recovery")
            diagnostics.firstAttemptError = error.localizedDescription
            if let pool = reopenReplacingCorruptFile(
                at: dbPath, after: error, config: config,
                fileManager: fileManager, clock: clock, diagnostics: &diagnostics
            ) {
                return pool
            }
        }

        if let secondary = fallbackPath(), secondary != dbPath {
            diagnostics.fellBackToSecondaryPath = true
            do {
                let pool = try DatabasePool(path: secondary, configuration: config)
                containerLogger.info("Database opened at fallback path \(secondary, privacy: .public)")
                return pool
            } catch {
                containerLogger.fault("Fallback database open failed at \(secondary, privacy: .public): \(error.localizedDescription, privacy: .public)")
                diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | fallback: \(error.localizedDescription)"
                if let pool = reopenReplacingCorruptFile(
                    at: secondary, after: error, config: config,
                    fileManager: fileManager, clock: clock, diagnostics: &diagnostics
                ) {
                    return pool
                }
            }
        }

        diagnostics.fellBackToEphemeralStorage = true
        let ephemeralPath = fileManager.temporaryDirectory
            .appendingPathComponent("meeshy_messages_ephemeral_\(UUID().uuidString).sqlite")
            .path
        containerLogger.fault("All database paths unusable — falling back to an ephemeral pool at \(ephemeralPath, privacy: .public)")
        do {
            return try DatabasePool(path: ephemeralPath, configuration: config)
        } catch {
            containerLogger.fault("Ephemeral DatabasePool init failed: \(error.localizedDescription, privacy: .public)")
            preconditionFailure("Ephemeral DatabasePool unavailable: \(error)")
        }
    }

    /// Quarantine-then-reopen, reserved for corruption-shaped failures.
    /// Returns `nil` when the error is access-shaped, suspension-shaped, or
    /// when the fresh open still fails — the caller moves on to the next
    /// fallback tier.
    ///
    /// Interne (et non `private`) pour que ``DependencyContainerSuspensionTests``
    /// puisse présenter une erreur EXACTE à la garde : une interruption ne se
    /// fabrique pas en ouvrant un vrai fichier, et un témoin qui n'y arrive pas
    /// serait vert par omission — la branche ne serait jamais jouée.
    nonisolated static func reopenReplacingCorruptFile(
        at path: String,
        after error: Error,
        config: Configuration,
        fileManager: FileManager,
        clock: () -> Date,
        diagnostics: inout DatabaseInitDiagnostics
    ) -> DatabasePool? {
        guard !isAccessDenied(error) else {
            containerLogger.fault("Access denied at \(path, privacy: .public) — leaving the file untouched (unreadable ≠ corrupt)")
            return nil
        }
        // #7160 — UNE INTERRUPTION N'EST PAS UNE CORRUPTION, et ici elle coûte
        // LE STORE DE MESSAGES DE L'UTILISATEUR.
        //
        // Armer la suspension juste au-dessus fait apparaître une erreur que ce
        // chemin n'avait jamais vue : une ouverture pendant la fenêtre de
        // suspension (réveil d'arrière-plan, extension, tâche BG) rend
        // `SQLITE_INTERRUPT`. `isAccessDenied` ne couvre que AUTH / PERM /
        // CANTOPEN / READONLY : sans cette garde, l'interruption tombait dans
        // la branche « corrompu », le fichier partait en quarantaine et une
        // base VIDE le remplaçait. On aurait troqué une suppression par le
        // système contre une perte de données — strictement pire.
        guard !DatabaseSuspension.isSuspensionInterruption(error) else {
            containerLogger.fault("Database open interrupted by suspension at \(path, privacy: .public) — leaving the file untouched (interrupted ≠ corrupt)")
            return nil
        }
        diagnostics.recoveryAttempted = true
        diagnostics.quarantinedFilePath = quarantineCorruptDatabase(
            at: path,
            fileManager: fileManager,
            clock: clock
        )
        do {
            let pool = try DatabasePool(path: path, configuration: config)
            containerLogger.info("Database recovered with a fresh file at \(path, privacy: .public)")
            return pool
        } catch {
            containerLogger.fault("Database recovery failed at \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | recovery: \(error.localizedDescription)"
            return nil
        }
    }

    private nonisolated static func isAccessDenied(_ error: Error) -> Bool {
        guard let dbError = error as? DatabaseError else { return false }
        let code = dbError.resultCode
        return code == .SQLITE_AUTH
            || code == .SQLITE_PERM
            || code == .SQLITE_CANTOPEN
            || code == .SQLITE_READONLY
    }

    /// Move the suspected-corrupt SQLite file (plus its WAL / SHM siblings)
    /// out of the way so a fresh one can be created at the canonical path.
    /// Returns the new location of the quarantined main file, or `nil` when
    /// the move failed (in which case we delete instead).
    nonisolated static func quarantineCorruptDatabase(
        at path: String,
        fileManager: FileManager = .default,
        clock: () -> Date = Date.init
    ) -> String? {
        let timestamp = Int(clock().timeIntervalSince1970)
        let quarantined = "\(path).corrupted.\(timestamp)"

        let mainExists = fileManager.fileExists(atPath: path)
        if mainExists {
            do {
                try fileManager.moveItem(atPath: path, toPath: quarantined)
            } catch {
                containerLogger.error("Failed to quarantine corrupt DB: \(error.localizedDescription, privacy: .public) — deleting instead")
                do {
                    try fileManager.removeItem(atPath: path)
                } catch {
                    containerLogger.error("Failed to delete corrupt DB at \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }
        // The WAL and SHM siblings reference a now-missing main file and
        // would prevent GRDB from creating a fresh database. They never
        // carry data we can recover separately, so they're safe to remove.
        let walPath = path + "-wal"
        if fileManager.fileExists(atPath: walPath) {
            do {
                try fileManager.removeItem(atPath: walPath)
            } catch {
                containerLogger.error("Failed to remove WAL file at \(path, privacy: .public)-wal: \(error.localizedDescription, privacy: .public)")
            }
        }

        let shmPath = path + "-shm"
        if fileManager.fileExists(atPath: shmPath) {
            do {
                try fileManager.removeItem(atPath: shmPath)
            } catch {
                containerLogger.error("Failed to remove SHM file at \(path, privacy: .public)-shm: \(error.localizedDescription, privacy: .public)")
            }
        }

        return (mainExists && fileManager.fileExists(atPath: quarantined)) ? quarantined : nil
    }

    // MARK: - App Group shared path (O6)

    static func databaseDirectory() -> URL {
        databaseDirectory(
            groupContainer: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
            )
        )
    }

    /// Le dossier des bases de messages — une par compte depuis #8656.
    ///
    /// `groupContainer` is `nil` when the signed binary lost the app-group
    /// entitlement (seen on Xcode Cloud distribution-signed TestFlight
    /// builds — launch crash-loop of build 1125, 2026-06-12). Trapping here
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

    // MARK: - Database config (O7, N7, N8)

    nonisolated static func dbConfig() -> Configuration {
        var config = Configuration()
        config.maximumReaderCount = min(ProcessInfo.processInfo.activeProcessorCount * 2, 16)
        // N1 — the NSE opens its own pool on the same App Group file. GRDB's
        // default `.immediateError` busy mode turns any cross-process write
        // collision into SQLITE_BUSY; a 5 s timeout absorbs the contention
        // (the NSE's writes are sub-millisecond, the app's are batched).
        config.busyMode = .timeout(5)
        // #7160 — LE SECOND POOL APPREND, LUI AUSSI, QUE L'APPLICATION SE SUSPEND.
        //
        // `observesSuspensionNotifications` se pose PAR POOL. #7059 l'a armé sur
        // `AppDatabase` (`meeshy.sqlite`) et le `0xDEAD10CC` est revenu à
        // l'identique en build 1827 : le rapport du 20/09 15:15 montre DEUX fils
        // `GRDB.DatabasePool.writer` vivants au moment de la suppression — l'un
        // en `sqlite3_wal_checkpoint_v2` jusqu'à `guarded_pwrite_np`, l'autre
        // dans un `write` synchrone. Celui-ci est le pool de
        // `meeshy_messages.sqlite`, et il n'écoutait rien.
        //
        // C'est le pool le plus exposé des deux : `MessagePersistenceActor`
        // écrit dessus à chaque message reçu, y compris pendant la transition
        // vers l'arrière-plan.
        DatabaseSuspension.arm(&config)
        config.prepareDatabase { db in
            try db.execute(sql: "PRAGMA synchronous = NORMAL")
            try db.execute(sql: "PRAGMA journal_size_limit = 16777216")
            try db.execute(sql: "PRAGMA wal_autocheckpoint = 1000")
            // #6221 — `cache_size`, `mmap_size` et `temp_store` vivent sur la
            // CONNEXION, pas dans le fichier. `applyTuning(on:)` les posait via
            // `pool.write`, donc sur le seul rédacteur : les seize lecteurs
            // travaillaient sans mmap ni cache de pages. Ici, ils atteignent
            // chaque connexion — et sans transaction d'écriture au démarrage.
            try DatabaseMaintenance.prepareTuning(db)
        }
        return config
    }
}

