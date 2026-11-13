// apps/ios/Meeshy/Core/MessageStoreRouter.swift

import Foundation
import MeeshySDK
import os

private nonisolated let storeRouterLogger = MeeshyLog.logger(.messageStoreRouter)

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
/// Une session quittée par un compte GARDÉ sur l'appareil (changement de
/// compte, ajout d'un compte) reste tenue, ouverte, jusqu'à son retour
/// (`activate(_:keepingOutgoing:)`, #8674) : il retrouve sa base telle qu'il
/// l'a laissée et ne resynchronise que l'écart.
///
/// Une session quittée par un compte DÉCONNECTÉ n'est plus tenue par le
/// routeur : sa purge de sortie faite, son fichier est retiré du disque
/// (`retire(_:)`). Mesuré au simulateur : un acteur capturé par un modèle de
/// vue encore vivant écrivait APRÈS la purge de sortie dans la base du compte
/// quitté. Le fichier délié, ces écritures tardives atterrissent dans un inode
/// orphelin, et le compte qui revient rouvre une base neuve — jamais une base
/// « purgée puis re-remplie ».
nonisolated final class MessageStoreRouter: @unchecked Sendable {
    typealias Opener = (MessageStoreAccountKey?) -> MessageStoreSession

    nonisolated private struct State {
        var sessions: [MessageStoreAccountKey: MessageStoreSession] = [:]
        var signedOut: MessageStoreSession?
        var current: MessageStoreSession

        func lookup(_ key: MessageStoreAccountKey?) -> MessageStoreSession? {
            guard let key else { return signedOut }
            return sessions[key]
        }

        mutating func store(_ session: MessageStoreSession, for key: MessageStoreAccountKey?) {
            guard let key else {
                signedOut = session
                return
            }
            sessions[key] = session
        }
    }

    private let state: Locked<State>
    private let open: Opener

    init(initialKey: MessageStoreAccountKey?, open: @escaping Opener) {
        self.open = open
        let first = open(initialKey)
        var initial = State(current: first)
        initial.store(first, for: initialKey)
        state = Locked(uncheckedState: initial)
    }

    var current: MessageStoreSession { state.mutateUnchecked { $0.current } }

    /// Rend active la base de `key` (celle de personne pour `nil`) et rend la
    /// session QUITTÉE quand elle change. `keepingOutgoing` la garde ouverte
    /// pour le retour de son compte ; sinon l'appelant la purge.
    @discardableResult
    func activate(_ key: MessageStoreAccountKey?, keepingOutgoing: Bool = false) -> MessageStoreSession? {
        let (current, cached) = state.mutateUnchecked { ($0.current, $0.lookup(key)) }
        guard current.key != key else { return nil }
        let incoming = cached ?? open(key)
        return state.mutateUnchecked { state in
            let outgoing = state.current
            if let outgoingKey = outgoing.key, !keepingOutgoing { state.sessions[outgoingKey] = nil }
            state.store(incoming, for: key)
            state.current = incoming
            storeRouterLogger.info("Message store switched to \(incoming.fileName, privacy: .public)")
            return outgoing
        }
    }

    /// La base du compte `userId`, seulement s'il est ACTIF. `nil` pour une
    /// écriture non attribuée : elle suit la base courante.
    func session(ownedBy userId: String?) -> MessageStoreSession? {
        state.mutateUnchecked { state in
            guard let userId else { return state.current }
            return state.current.key?.userId == userId ? state.current : nil
        }
    }

    /// Lâche les sessions gardées des comptes absents de `keys` — retirés de
    /// l'appareil — et les rend pour que l'appelant les purge (#8674). La
    /// session active n'est jamais lâchée.
    func dropSessions(keeping keys: Set<MessageStoreAccountKey>) -> [MessageStoreSession] {
        state.mutateUnchecked { state in
            let activeKey = state.current.key
            let dropped = state.sessions.filter { key, _ in !keys.contains(key) && key != activeKey }
            dropped.keys.forEach { state.sessions[$0] = nil }
            return Array(dropped.values)
        }
    }

    /// Les fichiers des comptes tenus ouverts — l'actif et ceux qui sont
    /// gardés : aucun balayage n'a le droit de les retirer.
    var openAccountFileNames: Set<String> {
        state.mutateUnchecked { Set($0.sessions.values.map(\.fileName)) }
    }

    /// Retire du disque la base d'une session QUITTÉE, une fois sa purge de
    /// sortie faite — et seulement si son compte n'a pas été rouvert entre-temps.
    /// Une écriture tardive d'un acteur capturé tombe ensuite dans un inode
    /// orphelin, jamais dans la base que le compte rouvrira.
    func retire(_ session: MessageStoreSession) {
        state.mutateUnchecked { state in
            guard let key = session.key, state.current.key != key, state.sessions[key] == nil else { return }
            Self.removeDatabaseFiles(at: session.path, fileManager: .default)
        }
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
