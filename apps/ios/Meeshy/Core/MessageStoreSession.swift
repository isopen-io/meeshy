// apps/ios/Meeshy/Core/MessageStoreSession.swift

import Foundation
import GRDB
import MeeshySDK
import os

private nonisolated let storeSessionLogger = Logger(subsystem: "me.meeshy.app", category: "message-store-session")

/// La base locale d'UN compte, ouverte (#8656).
///
/// Tout ce qui vit dans le fichier GRDB des messages — la timeline, l'outbox,
/// le fil social, l'index de recherche — appartient au compte qui l'a écrit.
/// Une session porte ce fichier ET les acteurs qui l'écrivent : un acteur
/// capturé par une tâche en vol écrit donc dans la base de SON compte, jamais
/// dans celle du compte arrivé depuis. C'est ce qui rend l'étanchéité
/// indépendante de l'ordre des tâches.
///
/// `key == nil` : la session « personne », un fichier temporaire propre au
/// processus, qu'aucun compte ne lit jamais.
nonisolated final class MessageStoreSession: Sendable {
    let key: MessageStoreAccountKey?
    let path: String
    let dbPool: DatabasePool
    let messagePersistence: MessagePersistenceActor
    let feedPersistence: FeedPersistenceActor
    let diagnostics: DatabaseInitDiagnostics

    init(
        key: MessageStoreAccountKey?,
        path: String,
        dbPool: DatabasePool,
        diagnostics: DatabaseInitDiagnostics
    ) {
        self.key = key
        self.path = path
        self.dbPool = dbPool
        self.messagePersistence = MessagePersistenceActor(dbWriter: dbPool, currentUserId: key?.userId)
        self.feedPersistence = FeedPersistenceActor(dbWriter: dbPool)
        self.diagnostics = diagnostics
    }

    var fileName: String { (path as NSString).lastPathComponent }

    /// Ouvre la base de `key` dans `directory` (celle de personne dans le
    /// dossier temporaire), migrations comprises, et démarre son acteur.
    ///
    /// Synchrone par construction : c'est ce qui permet de basculer de base
    /// AVANT que la nouvelle session ne lise quoi que ce soit.
    static func open(
        key: MessageStoreAccountKey?,
        directory: URL,
        fallbackDirectory: URL? = nil,
        fileManager: FileManager = .default
    ) -> MessageStoreSession {
        let fileName = key?.databaseFileName ?? "meeshy_messages_signed_out_\(UUID().uuidString).sqlite"
        let base = key == nil ? fileManager.temporaryDirectory : directory
        let path = base.appendingPathComponent(fileName).path
        let fallbackPath = key == nil ? nil : fallbackDirectory.map { $0.appendingPathComponent(fileName).path }

        var diagnostics = DatabaseInitDiagnostics()
        let pool = DependencyContainer.openWithRecovery(
            dbPath: path,
            fallbackPath: fallbackPath,
            config: DependencyContainer.dbConfig(),
            fileManager: fileManager,
            diagnostics: &diagnostics
        )
        do {
            try MessageDatabaseMigrations.runAll(on: pool)
            try FeedDatabaseMigrations.runAll(on: pool)
        } catch {
            storeSessionLogger.fault("Message store migrations failed: \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | migrations: \(error.localizedDescription)"
        }
        if key != nil {
            DependencyContainer.applyMessageStoreFileProtection(
                directoryPath: base.path,
                databasePath: pool.path
            )
        }
        let session = MessageStoreSession(key: key, path: pool.path, dbPool: pool, diagnostics: diagnostics)
        let persistence = session.messagePersistence
        Task { await persistence.start() }
        return session
    }
}
