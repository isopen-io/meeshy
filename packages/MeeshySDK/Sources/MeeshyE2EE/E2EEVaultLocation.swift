import Foundation

/// Où vit le coffre libsignal dans le conteneur du groupe d'apps (IOS-03, #18945).
///
/// Un dossier dédié, EXCLU DE LA SAUVEGARDE : la clé de scellement et
/// l'identité sont dans le trousseau en `…ThisDeviceOnly`, elles ne suivent ni
/// une sauvegarde iCloud ou Finder, ni un Démarrage rapide. Un coffre qui
/// arriverait sans elles sur un autre iPhone ne se lirait plus jamais (spec
/// § 4.5 : un appareil restauré est un NOUVEL appareil). La valeur se pose sur
/// le DOSSIER : SQLite recrée `-wal` et `-shm`, une valeur posée sur un fichier
/// ne survivrait pas à sa recréation ; celle du dossier couvre tout ce qu'il
/// contient. Jamais `Library/Caches` : le système le purge, ce serait détruire
/// l'historique.
public enum E2EEVaultLocation {
    public static let folderName = "E2EE"
    public static let databaseName = "e2ee.sqlite"
    /// Le journal et l'index de mémoire partagée de SQLite. Ils se déplacent
    /// AVANT la base : tant que la base n'est pas à sa place, la migration se
    /// rejoue, et une base n'arrive jamais sans son journal.
    static let companionSuffixes = ["-wal", "-shm"]

    /// Le chemin de la base, son dossier créé et exclu de la sauvegarde. Une
    /// base laissée à la racine du conteneur par une version précédente y est
    /// déplacée avec son journal ; une base déjà à sa place n'est jamais
    /// remplacée. À appeler sous le verrou inter-processus, avant toute
    /// ouverture de la base.
    public static func preparedDatabase(in container: URL, fileManager: FileManager = .default) throws -> URL {
        var folder = container.appendingPathComponent(folderName, isDirectory: true)
        try fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        var excluded = URLResourceValues()
        excluded.isExcludedFromBackup = true
        try folder.setResourceValues(excluded)
        let database = folder.appendingPathComponent(databaseName)
        try moveLegacyDatabase(from: container.appendingPathComponent(databaseName), to: database, fileManager: fileManager)
        return database
    }

    private static func moveLegacyDatabase(from legacy: URL, to database: URL, fileManager: FileManager) throws {
        guard !fileManager.fileExists(atPath: database.path), fileManager.fileExists(atPath: legacy.path) else { return }
        for suffix in companionSuffixes {
            let from = URL(fileURLWithPath: legacy.path + suffix)
            guard fileManager.fileExists(atPath: from.path) else { continue }
            let to = URL(fileURLWithPath: database.path + suffix)
            if fileManager.fileExists(atPath: to.path) { try fileManager.removeItem(at: to) }
            try fileManager.moveItem(at: from, to: to)
        }
        try fileManager.moveItem(at: legacy, to: database)
    }
}
