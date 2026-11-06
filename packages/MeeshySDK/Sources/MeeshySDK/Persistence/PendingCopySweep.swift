import Foundation
import os
import GRDB

/// **Une copie d'envoi que plus rien ne désigne quitte le disque au démarrage à froid** (#16129).
///
/// `OutboxFlusher` efface la copie durable d'un envoi rejoué après une grâce de dix minutes
/// (`appliedFileSweepGrace`), dans une tâche que la mort de l'application emporte. Si l'écho a
/// basculé la bulle sur l'URL serveur sans adopter le fichier, la copie reste sous
/// `pending-media/<cmid>/` ou `pending-audio/<cmid>/`, et plus rien ne la référence.
///
/// **Ce qu'il ne touche pas est la moitié qui compte.** Ces deux dossiers sont PARTAGÉS par les
/// comptes de l'appareil, alors que chaque compte a sa base : une copie ne s'efface donc que
/// jugée contre TOUTES les bases, et le moindre doute (une base illisible, une base de secours
/// loin de ses voisines) n'efface rien. Une ligne d'outbox la désigne par son `clientMessageId`
/// ou par sa charge, une bulle par `attachmentsJson` ; le nom du dossier suffit à les reconnaître,
/// parce que `JSONEncoder` échappe les `/` d'un chemin complet.
public enum PendingCopySweep {
    /// Une mise en file peut être en train de copier ses fichiers, sa ligne pas encore écrite.
    public static let minimumAge: TimeInterval = 3600

    /// Les pièces de commentaire ont leur balayage, jugé contre la base de leur auteur.
    private static let commentFolderPrefix = "comments-"

    private struct Copy {
        let url: URL
        let token: Data
    }

    public static var defaultRoots: [URL] {
        [OfflineQueue.pendingMediaDirectoryName, OfflineQueue.pendingAudioDirectoryName]
            .map { URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: $0), isDirectory: true) }
    }

    /// Rend le nombre de copies effacées.
    @discardableResult
    public static func sweepAtColdStart(
        activeBase: any DatabaseReader,
        activePath: String,
        storeDirectory: URL,
        roots: [URL] = defaultRoots,
        olderThan age: TimeInterval = minimumAge,
        now: Date = Date()
    ) async -> Int {
        let copies = staleCopies(in: roots, olderThan: age, now: now)
        guard !copies.isEmpty, let neighbours = neighbourBases(of: activePath, in: storeDirectory) else { return 0 }
        do {
            var references: [Data] = []
            for base in [activeBase] + neighbours {
                references += try await base.read { db in try designations(in: db) }
            }
            let orphans = copies.filter { copy in !references.contains { $0.range(of: copy.token) != nil } }
            orphans.forEach { FileManager.default.removeItemLogging(at: $0.url, context: "copie d'envoi orpheline") }
            return orphans.count
        } catch {
            Logger.messages.error("Orphan copy sweep skipped, copies kept: \(error.localizedDescription, privacy: .public)")
            return 0
        }
    }

    private static func staleCopies(in roots: [URL], olderThan age: TimeInterval, now: Date) -> [Copy] {
        roots.flatMap { root -> [Copy] in
            let entries = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
            return entries.filter { !$0.hasPrefix(commentFolderPrefix) && !$0.hasPrefix(".") }.compactMap { entry in
                let url = root.appendingPathComponent(entry)
                guard let modified = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date,
                      now.timeIntervalSince(modified) >= age else { return nil }
                return Copy(url: url, token: Data((entry as NSString).deletingPathExtension.utf8))
            }
        }
    }

    /// Les bases des AUTRES comptes de l'appareil, ou `nil` si l'une d'elles ne s'ouvre pas ou si
    /// la base active n'est pas parmi elles.
    private static func neighbourBases(of activePath: String, in directory: URL) -> [DatabaseQueue]? {
        let activeName = (activePath as NSString).lastPathComponent
        guard (activePath as NSString).deletingLastPathComponent == directory.path,
              let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) else { return nil }
        var configuration = Configuration()
        configuration.readonly = true
        do {
            return try names
                .filter { MessageStoreAccountKey.isAccountStoreFileName($0) && $0 != activeName }
                .map { try DatabaseQueue(path: directory.appendingPathComponent($0).path, configuration: configuration) }
        } catch {
            Logger.messages.error("Orphan copy sweep skipped, a neighbour base did not open: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// Tout ce qui peut désigner une copie dans UNE base, lu dans la même transaction.
    private static func designations(in db: Database) throws -> [Data] {
        let rows = try Row.fetchAll(db, sql: "SELECT clientMessageId, payload FROM outbox")
        let bubbles = try Data.fetchAll(
            db,
            sql: "SELECT attachmentsJson FROM messages WHERE instr(attachmentsJson, ?) > 0",
            arguments: [Data("pending-".utf8)]
        )
        return bubbles + rows.flatMap { row -> [Data] in
            let clientMessageId: String? = row["clientMessageId"]
            let payload: Data = row["payload"]
            return [Data((clientMessageId ?? "").utf8), payload]
        }
    }
}
