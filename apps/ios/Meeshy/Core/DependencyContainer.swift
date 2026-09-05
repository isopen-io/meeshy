// apps/ios/Meeshy/Core/DependencyContainer.swift

import Foundation
import Combine
import GRDB
import MeeshySDK
import os

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
struct DatabaseInitDiagnostics: Sendable, Equatable {
    var firstAttemptError: String?
    var recoveryAttempted: Bool = false
    var recoveredFromCorruption: Bool = false
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

    let dbPool: DatabasePool
    let messagePersistence: MessagePersistenceActor
    let feedPersistence: FeedPersistenceActor
    /// Pont de persistance GRDB du feed. Possédé par le container — donc par
    /// l'app — et non plus par `FeedView` : armé au montage de l'écran et
    /// désarmé à sa disparition, il ratait tout ce qui arrivait pendant que le
    /// feed n'était pas affiché (post créé, commentaire, réaction, traduction).
    /// La persistance disque ne doit dépendre d'aucune vue.
    let feedSocketHandler: FeedSocketHandler
    let thumbnailPrefetcher: ThumbnailPrefetcher

    /// Q3 (P1 hotfix) — Combine subscriptions tenues par le container.
    /// Aujourd'hui : un seul abonnement sur `AuthManager.isAuthenticated` pour
    /// le hook outbox logout (cf. `wireOutboxLogoutHook`).
    private var cancellables = Set<AnyCancellable>()

    /// Snapshot of how the database came up. Surfaced to ``AppDelegate``
    /// (which forwards the non-empty case to Crashlytics) and to the
    /// RecoveryView when ``fellBackToEphemeralStorage`` is true.
    let initDiagnostics: DatabaseInitDiagnostics

    private init() {
        let dbPath = Self.databasePath()
        let config = Self.dbConfig()

        var diagnostics = DatabaseInitDiagnostics()
        let pool = Self.openWithRecovery(
            dbPath: dbPath,
            fallbackPath: Self.databasePath(groupContainer: nil),
            config: config,
            diagnostics: &diagnostics
        )

        // Migrations + tuning. If these fail on the recovered DB, we surface
        // the diagnostic but still proceed — the alternative is crashing the
        // user into a boot loop they can't escape from.
        do {
            try MessageDatabaseMigrations.runAll(on: pool)
            try FeedDatabaseMigrations.runAll(on: pool)
            DatabaseMaintenance.applyTuning(on: pool)
        } catch {
            containerLogger.fault("Database migrations failed after recovery: \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | migrations: \(error.localizedDescription)"
        }

        self.dbPool = pool
        let persistence = MessagePersistenceActor(dbWriter: pool)
        self.messagePersistence = persistence
        let feed = FeedPersistenceActor(dbWriter: pool)
        self.feedPersistence = feed
        self.feedSocketHandler = FeedSocketHandler(persistence: feed)
        self.thumbnailPrefetcher = ThumbnailPrefetcher.shared
        self.initDiagnostics = diagnostics

        Task {
            await messagePersistence.start()
        }

        // Q3 (P1 hotfix) — au logout, purge TOUTES les tables messages
        // on-device. Sans ça, des messages enqueued par user A pourraient
        // être envoyés sous l'identité du user B après un logout+login rapide
        // sur le même device. Hook côté app car le SDK AuthManager ne connaît
        // pas DependencyContainer (qui est app-side).
        wireOutboxLogoutHook()
        wireCurrentUserHook()

        // Mirror every API message the SyncEngine sees (global `message:new`
        // relay, push-driven `ensureMessages`, pagination) into the GRDB
        // message store. The engine only maintains CacheCoordinator (list
        // previews); the conversation timeline reads GRDB — without this hook
        // a message received while its conversation is closed shows in the
        // list preview but is missing when the conversation opens.
        ConversationSyncEngine.shared.apiMessagePersistor = { [weak persistence] messages in
            guard !messages.isEmpty else { return }
            // Le prisme du lecteur se résout ICI, à la MISE EN FILE : lu depuis
            // la boucle d'écriture sérielle de la persistance, il y faisait
            // attendre chaque lot que le MainActor — donc le RENDU — soit
            // libre, et les réconciliations en file derrière lui attendaient
            // avec.
            await persistence?.bufferIncomingAPIMessages(
                messages, preferredLanguages: MessagePersistenceActor.readerPrism()
            )
        }

        // Même raison pour les mutations qui ne portent PAS d'`APIMessage` :
        // edit, suppression, réaction et vue unique consommée n'atteignaient que
        // `cache.messages`, que la timeline ne lit pas. Hors-ligne, rouvrir la
        // conversation affichait donc le texte d'avant l'édition, la bulle
        // supprimée et la réaction manquante jusqu'au prochain refetch REST.
        ConversationSyncEngine.shared.realtimeMessagePersistor = { [weak persistence] mutation in
            guard let persistence else { return }
            await Self.persist(mutation, into: persistence)
        }

        // Skip the auto-vacuum tune when we're on the ephemeral fallback —
        // the temp file dies with this launch and the next boot will retry
        // against the real path anyway.
        let autoVacuumKey = "meeshy.db.autoVacuumOneShotDone"
        if !diagnostics.fellBackToEphemeralStorage,
           !UserDefaults.standard.bool(forKey: autoVacuumKey) {
            let pool = self.dbPool
            Task.detached(priority: .background) {
                do {
                    try DatabaseMaintenance.enableIncrementalAutoVacuumOneShot(on: pool)
                } catch {
                    containerLogger.error("Failed to enable incremental auto-vacuum: \(error.localizedDescription, privacy: .public)")
                }
                await MainActor.run {
                    UserDefaults.standard.set(true, forKey: autoVacuumKey)
                }
            }
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
        do {
            switch mutation {
            case let .edited(messageId, content, editedAt):
                try await persistence.markEdited(localId: messageId, newContent: content, editedAt: editedAt)
            case let .callNoticeUpdated(messageId, content, callSummaryJson, serverUpdatedAt):
                try await persistence.applyCallNoticeUpdate(
                    localId: messageId, content: content,
                    callSummaryJson: callSummaryJson, serverUpdatedAt: serverUpdatedAt
                )
            case let .deleted(messageId, deletedAt):
                try await persistence.markDeleted(localId: messageId, deletedAt: deletedAt)
            case let .reactionAdded(messageId, reactionId, emoji, participantId, maxCount):
                try await persistence.appendReaction(
                    localId: messageId, reactionId: reactionId, messageId: messageId,
                    participantId: participantId, emoji: emoji, maxCount: maxCount
                )
            case let .reactionRemoved(messageId, emoji, participantId):
                try await persistence.removeReaction(
                    localId: messageId, emoji: emoji, participantId: participantId
                )
            case let .consumed(messageId, viewOnceCount):
                try await persistence.updateViewOnceCount(localId: messageId, count: viewOnceCount)
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
        let persistence = messagePersistence
        let feed = feedPersistence
        AuthManager.shared.sessionInvalidated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.sessionWasInvalidated = true }
            .store(in: &cancellables)
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                let invalidated = self?.sessionWasInvalidated ?? false
                self?.sessionWasInvalidated = false
                Task {
                    do {
                        let pendingCount = try await persistence.pendingOutboxCount()
                        try await persistence.clearAllMessagesForLogout()
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
                    // outbox-11 — résidus cross-compte hors messages/feed :
                    // impressions (UserDefaults standard, clés sans userId,
                    // rejouées dès l'init de chaque surface) et
                    // PendingStatusQueue. (pending_mark_read App Group est
                    // couvert par le wipe appgroup-01 — pas de doublon ici.)
                    ImpressionBatcher.purgeAllPendingImpressions()
                    await PendingStatusQueue.shared.clearAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Current-user hook (T7 — reaction ownership)

    /// Keep the persistence actor's `currentUserId` in sync with the
    /// authenticated user. The on-device DB has no userId column and the
    /// aggregated reaction payload only flags WHICH emojis the current user
    /// reacted with, so the actor needs to know who "the current user" is to
    /// tag their reconstructed reactions with the right owner (otherwise the
    /// "I reacted" highlight is lost after a cache reload). `$currentUser`
    /// replays its current value on subscription, so this both seeds and keeps
    /// the value current across login / account switch / logout (nil).
    private func wireCurrentUserHook() {
        let persistence = messagePersistence
        AuthManager.shared.$currentUser
            .map { $0?.id }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { userId in
                Task { await persistence.setCurrentUserId(userId) }
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
    static func openWithRecovery(
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
    /// Returns `nil` when the error is access-shaped or when the fresh
    /// open still fails — the caller moves on to the next fallback tier.
    private static func reopenReplacingCorruptFile(
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
        diagnostics.recoveryAttempted = true
        diagnostics.quarantinedFilePath = quarantineCorruptDatabase(
            at: path,
            fileManager: fileManager,
            clock: clock
        )
        do {
            let pool = try DatabasePool(path: path, configuration: config)
            diagnostics.recoveredFromCorruption = true
            containerLogger.info("Database recovered with a fresh file at \(path, privacy: .public)")
            return pool
        } catch {
            containerLogger.fault("Database recovery failed at \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | recovery: \(error.localizedDescription)"
            return nil
        }
    }

    private static func isAccessDenied(_ error: Error) -> Bool {
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
    static func quarantineCorruptDatabase(
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

    static func databasePath() -> String {
        databasePath(
            groupContainer: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
            )
        )
    }

    /// `groupContainer` is `nil` when the signed binary lost the app-group
    /// entitlement (seen on Xcode Cloud distribution-signed TestFlight
    /// builds — launch crash-loop of build 1125, 2026-06-12). Trapping here
    /// boot-loops the app on EVERY launch; falling back to Application
    /// Support keeps the user in the app, merely without NSE/widget data
    /// sharing until the signing issue is fixed.
    static func databasePath(groupContainer: URL?) -> String {
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
        let dbPath = dbDir.appendingPathComponent("meeshy_messages.sqlite").path
        applyMessageStoreFileProtection(directoryPath: dbDir.path, databasePath: dbPath)
        return dbPath
    }

    /// N2 — pin `.completeUntilFirstUserAuthentication` on the shared message
    /// store (directory + sqlite + WAL/SHM sidecars), mirroring
    /// `AppDatabase.resolveDatabaseURL`. The main app's
    /// `default-data-protection = NSFileProtectionComplete` entitlement would
    /// otherwise make any file (re)created by the app unreadable to the NSE
    /// while the device is locked — silently disabling pre-persist.
    private static func applyMessageStoreFileProtection(
        directoryPath: String,
        databasePath: String
    ) {
        let fileManager = FileManager.default
        let protection: [FileAttributeKey: Any] = [
            .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
        ]
        var paths = [directoryPath]
        paths += ["", "-wal", "-shm"]
            .map { databasePath + $0 }
            .filter { fileManager.fileExists(atPath: $0) }
        for path in paths {
            do {
                try fileManager.setAttributes(protection, ofItemAtPath: path)
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
        config.prepareDatabase { db in
            try db.execute(sql: "PRAGMA synchronous = NORMAL")
            try db.execute(sql: "PRAGMA journal_size_limit = 16777216")
            try db.execute(sql: "PRAGMA wal_autocheckpoint = 1000")
        }
        return config
    }
}

