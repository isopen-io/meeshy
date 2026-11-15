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
    private let logger = MeeshyLog.logger(.grdb)

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
        let logger = MeeshyLog.logger(.grdb)
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
        let logger = MeeshyLog.logger(.grdb)
        var phase = OpeningPhase.open
        do {
            let pool = try openPool(at: databaseURL)
            phase = .migrate
            try runMigrations(on: pool)
            return (pool, false)
        } catch where estUneInterruptionDeSuspension(error) {
            // #7059 — l'application est SUSPENDUE, pas cassée. Le store reste
            // INTACT sur le disque et la session se replie en mémoire : elle
            // perd son cache, jamais ses données. Le prochain lancement, hors
            // suspension, migrera normalement.
            logger.notice("DB open interrupted by suspension; store left INTACT, falling back to in-memory for this session")
            return inMemoryWriter()
        } catch where !warrantsRecreation(error, phase: phase) {
            // Disque plein, fichier verrouillé ou protégé (avant le premier
            // déverrouillage), E/S passagère : le fichier n'est pas en cause.
            // Il reste INTACT, la session se replie en mémoire.
            logger.error("On-disk DB unavailable (\(error.localizedDescription, privacy: .public)); store left INTACT, in-memory for this session")
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

    /// #8674 — le dossier où dorment les caches des comptes quittés mais
    /// gardés, à côté de `meeshy.sqlite` (même protection de fichier). Un
    /// harnais de test y a son propre dossier temporaire : il n'écrit jamais
    /// dans celui de l'app.
    public static var accountArchiveDirectory: URL {
        if runsUnderTestHarness(environment: ProcessInfo.processInfo.environment) {
            return FileManager.default.temporaryDirectory
                .appendingPathComponent("meeshy-cache-archives-\(ProcessInfo.processInfo.processIdentifier)", isDirectory: true)
        }
        do {
            return try resolveDatabaseURL().deletingLastPathComponent()
        } catch {
            return FileManager.default.temporaryDirectory.appendingPathComponent("meeshy-cache-archives", isDirectory: true)
        }
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
        DatabaseSuspension.arm(&configuration)
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
        DatabaseSuspension.isSuspensionInterruption(error)
    }

    enum OpeningPhase { case open, migrate }

    /// Le store ne s'EFFACE que s'il est perdu : corrompu (`SQLITE_CORRUPT`,
    /// `SQLITE_NOTADB`), ou une migration qui ÉCHOUE sur le schéma (erreur SQL,
    /// contrainte, ou une erreur levée par la migration elle-même) — elle
    /// échouerait à chaque lancement. Tout le reste dit « pas maintenant »
    /// (`SQLITE_FULL`, `SQLITE_BUSY`, `SQLITE_LOCKED`, `SQLITE_CANTOPEN` d'un
    /// fichier protégé avant le premier déverrouillage, `SQLITE_IOERR`,
    /// `SQLITE_PERM`…) : effacer, c'était perdre la base de l'utilisateur pour
    /// un disque plein.
    static func warrantsRecreation(_ error: Error, phase: OpeningPhase) -> Bool {
        guard let failure = error as? DatabaseError else { return phase == .migrate }
        switch failure.resultCode {
        case .SQLITE_CORRUPT, .SQLITE_NOTADB:
            return true
        case .SQLITE_ERROR, .SQLITE_CONSTRAINT, .SQLITE_MISMATCH, .SQLITE_SCHEMA:
            return phase == .migrate
        default:
            return false
        }
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
                MeeshyLog.logger(.grdb)
                    .fault("Corrupt database file '\(suffix, privacy: .public)' could not be removed, recovery will fail again: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    typealias InMemoryOpener = @Sendable () throws -> DatabaseQueue

    static let fallbackOpeners: [InMemoryOpener] = [
        { try DatabaseQueue() },
        { try DatabaseQueue(path: AppDatabase.temporaryFallbackPath()) },
    ]

    private static func temporaryFallbackPath() -> String {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-fallback-\(UUID().uuidString).sqlite")
            .path
    }

    /// `migrate` is injectable so tests can force the failure branch without
    /// depending on a real GRDB migration actually breaking.
    static func inMemoryWriter(
        openers: [InMemoryOpener] = AppDatabase.fallbackOpeners,
        recorder: any ErrorRecording = MeeshyLog.recorder,
        migrate: (any DatabaseWriter) throws -> Void = AppDatabase.runMigrations
    ) -> (any DatabaseWriter, Bool) {
        let queue = openFallbackQueue(openers: openers, recorder: recorder)
        do {
            try migrate(queue)
        } catch {
            MeeshyLog.record(
                error,
                context: "In-memory fallback DB migration failed, cache degraded for this session",
                category: .grdb,
                recorder: recorder
            )
        }
        return (queue, true)
    }

    private static func openFallbackQueue(
        openers: [InMemoryOpener],
        recorder: any ErrorRecording
    ) -> DatabaseQueue {
        for opener in openers {
            do {
                return try opener()
            } catch {
                MeeshyLog.record(
                    error,
                    context: "In-memory fallback DB could not be opened",
                    category: .grdb,
                    recorder: recorder
                )
            }
        }
        MeeshyLog.logger(.grdb).fault("No SQLite store could be opened, not even an in-memory one")
        preconditionFailure("SQLite is unavailable: no fallback store can be opened")
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

    static func migrator() -> DatabaseMigrator {
        DatabaseMigrator(table: AppDatabaseMigrations.all)
    }
}
