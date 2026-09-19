import Foundation
import GRDB
import os

// MARK: - AppDatabase
public final class AppDatabase: @unchecked Sendable {
    public static let shared = AppDatabase()

    public let databaseWriter: any DatabaseWriter
    /// `true` when the on-disk SQLite store could not be opened and we fell
    /// back to an in-memory queue. Callers that persist long-term data can
    /// decide to skip writes or surface a warning to the user.
    public let isEphemeral: Bool
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")

    private init() {
        // **UN HARNAIS DE TEST N'ÉCRIT PAS DANS LE MAGASIN DE L'APP** (#6857).
        //
        // 68 écritures de témoins, sur 31 fichiers, visent
        // `CacheCoordinator.shared` sous des clés de PRODUCTION. Le magasin
        // étant sur disque, jouer la suite sur un simulateur y gravait des
        // fixtures durables : après la suite, la liste de conversations de
        // l'app ne montrait plus que `conv-hydrate` / « Alice & Bob », et son
        // repli de curseur envoyait cet identifiant à la passerelle.
        //
        // La garde est posée ICI, à la racine, plutôt que dans les 68 appels :
        // un magasin en mémoire n'a rien à oublier, tandis qu'une discipline
        // de nettoyage se perd au premier témoin écrit distraitement — ce
        // défaut avait déjà été diagnostiqué une fois, et corrigé chez un seul
        // consommateur.
        //
        // La suite y gagne aussi son ISOLEMENT : chaque processus de test
        // démarre sur un magasin vierge, donc aucune suite n'hérite plus de ce
        // qu'une autre a semé. La dépendance à l'ORDRE que
        // `ForwardPickerViewModel` décrit dans son doc-comment disparaît avec.
        if Self.runsUnderTestHarness(environment: ProcessInfo.processInfo.environment) {
            let (writer, _) = Self.inMemoryWriter()
            self.databaseWriter = writer
            self.isEphemeral = true
            return
        }
        // makeWriter opens, migrates, AND recovers from corruption internally,
        // so the writer it returns is always a fully-migrated, usable store.
        let (writer, ephemeral) = Self.makeWriter()
        self.databaseWriter = writer
        self.isEphemeral = ephemeral
    }

    /// **Ce processus est-il un harnais de test ?** Pure, et prenant son
    /// environnement en PARAMÈTRE : sans ça, la règle ne s'éprouve que dans le
    /// processus qui l'habite, donc jamais sur son verdict négatif — et un
    /// prédicat qui rend toujours `true` rendrait le magasin de l'app livrée
    /// éphémère sans que rien ne rougisse.
    ///
    /// XCTest exporte ses propres variables dans le processus hôte
    /// (`XCTestConfigurationFilePath` pour un bundle unitaire,
    /// `XCTestBundlePath` pour l'exécution sans hôte). Le préfixe les couvre
    /// toutes les deux, et celles qu'Apple ajoutera.
    public static func runsUnderTestHarness(environment: [String: String]) -> Bool {
        environment.keys.contains { $0.hasPrefix("XCTest") }
    }

    /// Build a fully-migrated GRDB writer that never crashes the host app.
    /// Opens the on-disk store, runs migrations, and on an unusable file
    /// (SQLITE_CORRUPT / SQLITE_NOTADB / migration failure) deletes it and
    /// recreates once; if that still fails, falls back to an in-memory queue
    /// so the L2 cache is degraded but the app stays alive — critical when the
    /// OS wakes us for a silent push or background task and disk access
    /// transiently fails.
    private static func makeWriter() -> (any DatabaseWriter, Bool) {
        let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
        let databaseURL: URL
        do {
            databaseURL = try resolveDatabaseURL()
        } catch {
            logger.error("Failed to resolve on-disk DB location, using in-memory: \(error.localizedDescription, privacy: .public)")
            return inMemoryWriter()
        }
        return openOrRecover(at: databaseURL)
    }

    /// Open + migrate the store at `databaseURL`. A `DatabasePool` opens
    /// lazily, so a corrupt file only throws (SQLITE_CORRUPT / SQLITE_NOTADB)
    /// at migration time — the first real query. We run migrations HERE so
    /// corruption is caught while we can still recover, instead of leaving a
    /// broken pool in use for the whole session (and across relaunches). On
    /// failure: drop the file (+ WAL/SHM sidecars) and retry once; then
    /// in-memory. Internal for tests.
    static func openOrRecover(at databaseURL: URL) -> (any DatabaseWriter, Bool) {
        let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
        do {
            let pool = try openPool(at: databaseURL)
            try runMigrations(on: pool)
            return (pool, false)
        } catch where estUneInterruptionDeSuspension(error) {
            // #7059 — l'application est SUSPENDUE, pas cassée. Le store reste
            // INTACT sur le disque et la session se replie en mémoire : elle
            // perd son cache, jamais ses données. Le prochain lancement, hors
            // suspension, migrera normalement.
            logger.notice("DB open interrupted by suspension; store left INTACT, falling back to in-memory for this session")
            return inMemoryWriter()
        } catch {
            logger.error("On-disk DB unusable (\(error.localizedDescription, privacy: .public)); deleting and recreating")
            removeDatabaseFiles(at: databaseURL)
            do {
                let pool = try openPool(at: databaseURL)
                try runMigrations(on: pool)
                logger.info("Recovered on-disk DB by recreating the store")
                return (pool, false)
            } catch {
                logger.error("DB recreate failed (\(error.localizedDescription, privacy: .public)); using in-memory")
                return inMemoryWriter()
            }
        }
    }

    /// Resolve (and create) the on-disk SQLite URL with iOS Data Protection:
    /// the SQLite file and its directory are encrypted by the OS when the
    /// device is locked (readable after the first unlock each boot — required
    /// for background tasks and NSE — but encrypted at rest and excluded from
    /// unencrypted backups).
    private static func resolveDatabaseURL() throws -> URL {
        let fileManager = FileManager.default
        let appSupportDir = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directoryURL = appSupportDir.appendingPathComponent("Database", isDirectory: true)
        if !fileManager.fileExists(atPath: directoryURL.path) {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        }
        try (directoryURL as NSURL).setResourceValue(
            URLFileProtection.completeUntilFirstUserAuthentication,
            forKey: .fileProtectionKey
        )
        let databaseURL = directoryURL.appendingPathComponent("meeshy.sqlite")
        if fileManager.fileExists(atPath: databaseURL.path) {
            try (databaseURL as NSURL).setResourceValue(
                URLFileProtection.completeUntilFirstUserAuthentication,
                forKey: .fileProtectionKey
            )
        }
        return databaseURL
    }

    private static func openPool(at databaseURL: URL) throws -> DatabasePool {
        var configuration = Configuration()
        // #7059 — LA BASE APPREND QUE L'APPLICATION SE SUSPEND.
        //
        // Sans ce drapeau, un travail en cours sur `DatabasePool.writer` au
        // moment où iOS suspend le processus retient un verrou sur le fichier
        // SQLite, et RunningBoard supprime l'application (`0xDEAD10CC`).
        // Mesuré CINQ fois sur l'appareil du porteur, sur TROIS sites d'appel
        // différents — autorisation de requête, construction de curseur, union
        // de régions observées : ce n'est pas une requête lente qu'on pourrait
        // accélérer, c'est le verrou lui-même.
        //
        // La garde `beginBackgroundTask` de `BackgroundTransitionCoordinator`
        // ne couvrait qu'UN écrivain, la maintenance ; les cinq suppressions
        // viennent des autres. Ici, GRDB refuse toute PRISE de verrou dès que
        // `Database.suspendNotification` est postée, quel que soit l'écrivain.
        //
        // Contrepartie assumée, et c'est ce que les témoins mesurent : pendant
        // la fenêtre de suspension les écritures lèvent `SQLITE_INTERRUPT` ou
        // `SQLITE_ABORT`. Les lectures en WAL passent — l'écran continue de
        // servir ce qui est en base.
        configuration.observesSuspensionNotifications = true
        configuration.prepareDatabase { db in
            // WAL mode is GRDB default, but set it explicitly for clarity.
            // busy_timeout prevents immediate SQLITE_BUSY errors under concurrent
            // socket-event writes and UI reads (5s gives the writer time to finish).
            try db.execute(sql: "PRAGMA journal_mode = WAL")
            try db.execute(sql: "PRAGMA busy_timeout = 5000")
        }
        return try DatabasePool(path: databaseURL.path, configuration: configuration)
    }

    /// **Une interruption n'est pas une corruption** (#7059).
    ///
    /// `openOrRecover` EFFACE le store quand la migration échoue — c'est sa
    /// raison d'être, un fichier corrompu doit être recréé. Armer la suspension
    /// fait apparaître une erreur qui n'existait pas avant : une ouverture
    /// pendant la fenêtre de suspension (réveil d'arrière-plan, tâche BG) voit
    /// sa migration interrompue. La lire comme une corruption ferait **perdre
    /// la base locale de l'utilisateur** — on aurait troqué une suppression par
    /// le système contre une perte de données, strictement pire.
    ///
    /// `SQLITE_INTERRUPT` / `SQLITE_ABORT` disent « pas maintenant », jamais
    /// « ce fichier est illisible ».
    static func estUneInterruptionDeSuspension(_ error: Error) -> Bool {
        guard let erreur = error as? DatabaseError else { return false }
        return erreur.resultCode == .SQLITE_INTERRUPT || erreur.resultCode == .SQLITE_ABORT
    }

    /// Delete the SQLite file and its WAL/SHM sidecars so a recreate starts clean.
    private static func removeDatabaseFiles(at databaseURL: URL) {
        let fileManager = FileManager.default
        for suffix in ["", "-wal", "-shm"] {
            let url = URL(fileURLWithPath: databaseURL.path + suffix)
            do {
                try fileManager.removeItem(at: url)
            } catch CocoaError.fileNoSuchFile {
                // `-wal`/`-shm` n'existent pas toujours — cas nominal.
            } catch {
                // La base corrompue survit : la réouverture échouera à nouveau.
                Logger(subsystem: "com.meeshy.sdk", category: "grdb")
                    .fault("Corrupt database file '\(suffix, privacy: .public)' could not be removed, recovery will fail again: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// `migrate` is injectable so tests can force the failure branch without
    /// depending on a real GRDB migration actually breaking.
    static func inMemoryWriter(
        migrate: (any DatabaseWriter) throws -> Void = AppDatabase.runMigrations
    ) -> (any DatabaseWriter, Bool) {
        // swiftlint:disable:next force_try
        let queue = try! DatabaseQueue()
        // The ephemeral DB still needs the schema so reads/writes don't throw.
        // A migration failure here must not crash the host app — that's the
        // whole point of the in-memory fallback — but swallowing it silently
        // left zero diagnostic when the L2 cache degraded to a schemaless
        // store for the rest of the session.
        do {
            try migrate(queue)
        } catch {
            let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
            logger.error("In-memory fallback DB migration failed, cache will be degraded for this session: \(error.localizedDescription, privacy: .public)")
        }
        return (queue, true)
    }

    static func runMigrations(on writer: any DatabaseWriter) throws {
        try migrator().migrate(writer)
    }

    /// Arrête la chaîne APRÈS `identifier` : sert aux témoins qui doivent
    /// peupler la base dans l'état d'AVANT une migration de données, puis
    /// rejouer la chaîne entière pour mesurer ce que cette migration en fait.
    static func runMigrations(on writer: any DatabaseWriter, upTo identifier: String) throws {
        try migrator().migrate(writer, upTo: identifier)
    }

    private static func migrator() -> DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_create_tables") { db in
            try db.create(table: "conversations") { t in
                t.column("id", .text).primaryKey()
                t.column("name", .text).notNull()
                t.column("encodedData", .blob).notNull() // Temporary fallback column
                t.column("updatedAt", .datetime).notNull()
            }

            try db.create(table: "messages") { t in
                t.column("id", .text).primaryKey()
                t.column("conversationId", .text).notNull().references("conversations", onDelete: .cascade)
                t.column("createdAt", .datetime).notNull()
                t.column("encodedData", .blob).notNull() // Temporary fallback column
            }

            try db.create(index: "index_messages_on_conversationId_createdAt", on: "messages", columns: ["conversationId", "createdAt"])
        }

        migrator.registerMigration("v2_participant_cache") { db in
            try db.create(table: "cached_participants") { t in
                t.column("id", .text).primaryKey()
                t.column("conversationId", .text).notNull()
                t.column("userId", .text)
                t.column("username", .text)
                t.column("firstName", .text)
                t.column("lastName", .text)
                t.column("displayName", .text)
                t.column("avatar", .text)
                t.column("conversationRole", .text)
                t.column("isOnline", .boolean)
                t.column("lastActiveAt", .datetime)
                t.column("joinedAt", .datetime)
                t.column("isActive", .boolean)
                t.column("cachedAt", .datetime).notNull()
            }

            try db.create(
                index: "idx_cached_participants_conversationId",
                on: "cached_participants",
                columns: ["conversationId"]
            )

            try db.create(table: "cache_metadata") { t in
                t.column("key", .text).primaryKey()
                t.column("nextCursor", .text)
                t.column("hasMore", .boolean).notNull().defaults(to: true)
                t.column("totalCount", .integer)
                t.column("lastFetchedAt", .datetime).notNull()
            }
        }

        migrator.registerMigration("v3_unified_cache") { db in
            try db.drop(table: "cached_participants")
            try db.create(table: "cache_entries") { t in
                t.column("key", .text).notNull()
                t.column("itemId", .text).notNull()
                t.column("encodedData", .blob).notNull()
                t.column("updatedAt", .datetime).notNull()
                t.primaryKey(["key", "itemId"])
            }
            try db.create(index: "idx_cache_entries_key", on: "cache_entries", columns: ["key"])
        }

        migrator.registerMigration("v4_drop_legacy_tables") { db in
            try db.drop(table: "conversations")
            try db.drop(table: "messages")
        }

        migrator.registerMigration("v5_translation_cache") { db in
            try db.create(table: "translation_cache") { t in
                t.column("messageId", .text).notNull()
                t.column("targetLanguage", .text).notNull()
                t.column("encodedData", .blob).notNull()
                t.column("cachedAt", .datetime).notNull()
                t.primaryKey(["messageId", "targetLanguage"])
            }
            try db.create(index: "idx_translation_cache_messageId", on: "translation_cache", columns: ["messageId"])
        }

        migrator.registerMigration("v6_tus_upload_checkpoint") { db in
            // Per-file TUS upload checkpoints persisted across app kills so
            // a retry can PATCH from the last known offset instead of
            // re-uploading the slide from byte 0. Keyed on the SHA256 of
            // the file content (computed bytewise by `TusUploadManager`)
            // — stable across re-encodes that produce the same bytes,
            // collision-free across distinct files.
            try db.create(table: "tus_upload_checkpoint") { t in
                t.column("checkpointKey", .text).primaryKey()
                t.column("uploadURL", .text).notNull()
                t.column("byteOffset", .integer).notNull()
                t.column("fileSize", .integer).notNull()
                t.column("fileName", .text).notNull()
                t.column("mimeType", .text).notNull()
                t.column("uploadContext", .text)
                t.column("thumbHash", .text)
                t.column("createdAt", .datetime).notNull()
                t.column("updatedAt", .datetime).notNull()
            }
            try db.create(
                index: "idx_tus_upload_checkpoint_updatedAt",
                on: "tus_upload_checkpoint",
                columns: ["updatedAt"]
            )
        }

        // FTS5 indexes for conversations + users — sit alongside cache_entries
        // so the search index lives in the same database as the data the
        // GRDBCacheStore persists. Defined in `SearchIndexMigrations`.
        SearchIndexMigrations.registerAll(in: &migrator)

        migrator.registerMigration("v7_cache_entries_itemId_index") { db in
            try db.create(index: "idx_cache_entries_itemId", on: "cache_entries", columns: ["itemId"])
        }

        // P2-2a — empreinte du plaintext par entrée : permet au flush dirty de
        // SAUTER le re-chiffrement + la réécriture des items inchangés (le blob
        // chiffré est non déterministe, seul un hash du plaintext est
        // comparable). Nullable : les rangées existantes convergent au premier
        // flush qui les réécrit.
        migrator.registerMigration("v8_cache_entries_content_hash") { db in
            try db.alter(table: "cache_entries") { t in
                t.add(column: "contentHash", .text)
            }
        }

        // Migration SÉPARÉE de la v8 (GRDB identifie par NOM : étendre une
        // migration déjà exécutée quelque part la rendrait silencieusement
        // incomplète sur ces stores). L'ordre de la liste persistée : l'ancien
        // delete-all + réécriture le garantissait par rowid ; l'écriture-diff
        // conserve les rowids des rangées inchangées, l'ordre doit donc être
        // explicite. NULL (pré-v9) ⇒ repli rowid en lecture.
        migrator.registerMigration("v9_cache_entries_position") { db in
            try db.alter(table: "cache_entries") { t in
                t.add(column: "position", .integer)
            }
        }

        // #6893 — jusqu'à ce lot, `StoryEffects.encode` réencodait tout
        // document v3 par le runtime v1, et la première scène perdait ce que
        // v1 ne modélise pas (fond référencé par `mediaId`, kinds réservés,
        // mentions, plan). Le correctif n'empêche que les écritures NEUVES de
        // mutiler ; une ligne déjà mutilée resterait servie À FROID — route
        // IMAGE sans texte — jusqu'au prochain rafraîchissement, que rien ne
        // garantit avant l'ouverture d'un post (lien profond, notification).
        // Purge UNIQUE des deux stores qui portent un canvas, et d'eux seuls :
        // un démarrage à froid après mise à jour relit le réseau une fois.
        migrator.registerMigration("v10_purge_canvas_reencoded_by_v1") { db in
            for prefix in ["feed:", "stories:"] {
                try db.execute(
                    sql: "DELETE FROM cache_entries WHERE substr(key, 1, ?) = ?",
                    arguments: [prefix.count, prefix]
                )
                try db.execute(
                    sql: "DELETE FROM cache_metadata WHERE substr(key, 1, ?) = ?",
                    arguments: [prefix.count, prefix]
                )
            }
        }

        return migrator
    }
}
