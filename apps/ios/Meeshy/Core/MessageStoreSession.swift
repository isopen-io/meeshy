// apps/ios/Meeshy/Core/MessageStoreSession.swift

import Foundation
@_spi(AccountStore) import MeeshySDK
import MeeshySDK

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
    let database: MessageStoreDatabase
    let messagePersistence: MessagePersistenceActor
    let feedPersistence: FeedPersistenceActor

    init(key: MessageStoreAccountKey?, database: MessageStoreDatabase) {
        self.key = key
        self.path = database.path
        self.database = database
        self.messagePersistence = MessagePersistenceActor(dbWriter: database.pool, currentUserId: key?.userId)
        self.feedPersistence = FeedPersistenceActor(dbWriter: database.pool)
    }

    var diagnostics: DatabaseInitDiagnostics { database.diagnostics }

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

        let database = MessageStoreDatabase.open(path: path, fallbackPath: fallbackPath, fileManager: fileManager)
        if key != nil {
            DependencyContainer.applyMessageStoreFileProtection(
                directoryPath: base.path,
                databasePath: database.path
            )
        }
        // #9743 — le compte de ce fichier, inscrit à l'ouverture : c'est la
        // preuve que la file lit pour écrire ou montrer un commentaire.
        // Pas une base de secours éphémère : seul le fichier du compte s'inscrit.
        if let key, AccountStoreRegistry.admits(databasePath: database.path, for: key) {
            AccountStoreRegistry.register(databasePath: database.path, key: key)
        }
        let session = MessageStoreSession(key: key, database: database)
        let persistence = session.messagePersistence
        Task { await persistence.start() }
        return session
    }
}
