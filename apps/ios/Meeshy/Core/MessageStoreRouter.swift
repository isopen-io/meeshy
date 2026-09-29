// apps/ios/Meeshy/Core/MessageStoreRouter.swift

import Foundation
import MeeshySDK
import os

private nonisolated let storeRouterLogger = Logger(subsystem: "me.meeshy.app", category: "message-store-router")

/// Aiguille chaque lecture et chaque écriture vers la base du compte ACTIF
/// (#8656, #8657).
///
/// Avant : une seule base pour tous les comptes de l'appareil, purgée en tâche
/// asynchrone à la sortie de session. Entre la bascule et la purge, le compte
/// suivant lisait les lignes du compte quitté — contenu protégé compris — et
/// une conversation PARTAGÉE par les deux comptes y mêlait leurs auteurs.
///
/// Désormais :
///  * un fichier par compte (`MessageStoreAccountKey` : utilisateur +
///    environnement) ;
///  * la bascule est SYNCHRONE (`activate(_:)`) : quand elle rend la main, plus
///    rien ne lit l'ancienne base par le routeur ;
///  * une écriture ATTRIBUÉE à un compte (`session(ownedBy:)`) ne vise que la
///    base de ce compte, et rien si ce compte n'est plus actif.
///
/// Une session QUITTÉE n'est plus tenue par le routeur : sa purge de sortie
/// faite, son fichier est retiré du disque (`retire(_:)`). Mesuré au
/// simulateur : un acteur capturé par un modèle de vue encore vivant écrivait
/// APRÈS la purge de sortie dans la base du compte quitté. Le fichier délié,
/// ces écritures tardives atterrissent dans un inode orphelin, et le compte qui
/// revient rouvre une base neuve — jamais une base « purgée puis re-remplie ».
nonisolated final class MessageStoreRouter: @unchecked Sendable {
    typealias Opener = (MessageStoreAccountKey?) -> MessageStoreSession

    private let lock = NSLock()
    private let open: Opener
    private var sessions: [MessageStoreAccountKey: MessageStoreSession] = [:]
    private var signedOut: MessageStoreSession?
    private var _current: MessageStoreSession

    init(initialKey: MessageStoreAccountKey?, open: @escaping Opener) {
        self.open = open
        let first = open(initialKey)
        _current = first
        if let initialKey {
            sessions[initialKey] = first
        } else {
            signedOut = first
        }
    }

    var current: MessageStoreSession { lock.withLock { _current } }

    /// Rend active la base de `key` (celle de personne pour `nil`) et rend la
    /// session QUITTÉE quand elle change, pour que l'appelant la purge.
    @discardableResult
    func activate(_ key: MessageStoreAccountKey?) -> MessageStoreSession? {
        let (current, cached) = lock.withLock { (_current, lookup(key)) }
        guard current.key != key else { return nil }
        let incoming = cached ?? open(key)
        return lock.withLock {
            let outgoing = _current
            if let outgoingKey = outgoing.key { sessions[outgoingKey] = nil }
            store(incoming, for: key)
            _current = incoming
            storeRouterLogger.info("Message store switched to \(incoming.fileName, privacy: .public)")
            return outgoing
        }
    }

    /// La base du compte `userId`, seulement s'il est ACTIF. `nil` pour une
    /// écriture non attribuée : elle suit la base courante.
    func session(ownedBy userId: String?) -> MessageStoreSession? {
        lock.withLock {
            guard let userId else { return _current }
            return _current.key?.userId == userId ? _current : nil
        }
    }

    /// Le fichier du compte actif — le seul qu'un balayage n'a pas le droit
    /// de retirer.
    var openAccountFileNames: Set<String> {
        lock.withLock { Set(sessions.values.map(\.fileName)) }
    }

    /// Retire du disque la base d'une session QUITTÉE, une fois sa purge de
    /// sortie faite — et seulement si son compte n'a pas été rouvert entre-temps.
    /// Une écriture tardive d'un acteur capturé tombe ensuite dans un inode
    /// orphelin, jamais dans la base que le compte rouvrira.
    func retire(_ session: MessageStoreSession) {
        lock.withLock {
            guard let key = session.key, _current.key != key, sessions[key] == nil else { return }
            Self.removeDatabaseFiles(at: session.path, fileManager: .default)
        }
    }

    private func lookup(_ key: MessageStoreAccountKey?) -> MessageStoreSession? {
        guard let key else { return signedOut }
        return sessions[key]
    }

    private func store(_ session: MessageStoreSession, for key: MessageStoreAccountKey?) {
        guard let key else {
            signedOut = session
            return
        }
        sessions[key] = session
    }
}

// MARK: - Fichiers sur disque

nonisolated extension MessageStoreRouter {

    static let sidecarSuffixes = ["", "-wal", "-shm"]

    /// Premier lancement après la mise à jour : l'ancienne base PARTAGÉE est
    /// attribuée au compte actif (sa file d'envoi et son cache y survivent),
    /// ou supprimée quand personne n'est connecté — elle n'appartient alors à
    /// personne qu'on puisse nommer.
    static func adoptLegacyStore(
        in directory: URL,
        for key: MessageStoreAccountKey?,
        fileManager: FileManager = .default
    ) {
        let legacy = directory.appendingPathComponent(MessageStoreAccountKey.legacyDatabaseFileName).path
        guard fileManager.fileExists(atPath: legacy) else { return }
        let target = key.map { directory.appendingPathComponent($0.databaseFileName).path }
        guard let target, !fileManager.fileExists(atPath: target) else {
            removeDatabaseFiles(at: legacy, fileManager: fileManager)
            return
        }
        for suffix in sidecarSuffixes where fileManager.fileExists(atPath: legacy + suffix) {
            do {
                try fileManager.moveItem(atPath: legacy + suffix, toPath: target + suffix)
            } catch {
                storeRouterLogger.error("Legacy store adoption failed for \(suffix, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        removeDatabaseFiles(at: legacy, fileManager: fileManager)
    }

    /// Retire les bases de compte qu'aucune session ouverte ne tient : hors
    /// session, aucun compte n'a de données à garder sur l'appareil — la sortie
    /// de session les purgeait déjà quand elles étaient une seule base.
    static func sweepDormantAccountStores(
        in directory: URL,
        keeping openFileNames: Set<String>,
        fileManager: FileManager = .default
    ) {
        let names: [String]
        do {
            names = try fileManager.contentsOfDirectory(atPath: directory.path)
        } catch {
            return
        }
        names
            .filter { MessageStoreAccountKey.isAccountStoreFileName($0) && !openFileNames.contains($0) }
            .forEach { removeDatabaseFiles(at: directory.appendingPathComponent($0).path, fileManager: fileManager) }
    }

    static func removeDatabaseFiles(at path: String, fileManager: FileManager) {
        for suffix in sidecarSuffixes where fileManager.fileExists(atPath: path + suffix) {
            do {
                try fileManager.removeItem(atPath: path + suffix)
            } catch {
                storeRouterLogger.error("Store file removal failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
