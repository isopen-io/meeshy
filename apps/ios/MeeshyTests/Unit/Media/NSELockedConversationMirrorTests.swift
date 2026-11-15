import XCTest
@testable import Meeshy

/// **Le verrou PIN d'une conversation se lit en UNE fois, au fichier miroir**
/// (#12655, audit adversarial de #12856).
///
/// L'extension lisait la clé `UserDefaults` du groupe d'apps, puis, faute de
/// clé, ouvrait le plist du domaine pour savoir s'il était lisible. Deux
/// lectures : un déverrouillage entre les deux rendait « ouverte » une
/// conversation sous PIN. Et le plist d'une app en `NSFileProtectionComplete`
/// pouvait se fermer dès l'écran verrouillé, scellant toutes les bannières.
/// Le fichier miroir porte son signal et sa donnée dans la même lecture.
final class NSELockedConversationMirrorTests: XCTestCase {

    private struct Unreadable: Error {}

    private func temporaryDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory
    }

    private func lock(
        _ conversationId: String? = "c1",
        file: NSELockMirrorRead,
        legacy: [String]? = nil,
        snapshot: Bool = false
    ) -> NSEConversationLock {
        NSELockedConversationMirror.conversationLock(
            conversationId: conversationId,
            readFile: { file },
            readLegacyKey: { legacy },
            snapshotDeclaresLock: { _ in snapshot }
        )
    }

    // MARK: - La lecture du fichier

    func test_readFile_aWrittenMirror_isTheFullSet() throws {
        let url = try XCTUnwrap(NSELockedConversationMirror.fileURL(inContainer: try temporaryDirectory()))

        XCTAssertTrue(NSELockedConversationMirror.mirror(["b", "a"], toFile: url, defaults: nil))

        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url), .ids(["a", "b"]))
    }

    func test_readFile_anEmptySet_isAKnowledge_notAnAbsence() throws {
        let url = try XCTUnwrap(NSELockedConversationMirror.fileURL(inContainer: try temporaryDirectory()))

        NSELockedConversationMirror.mirror([], toFile: url, defaults: nil)

        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url), .ids([]))
    }

    /// Aucune version de l'app ne l'a écrit : c'est la transition, pas un savoir.
    func test_readFile_aFileNeverWritten_isAbsent() throws {
        let url = try XCTUnwrap(NSELockedConversationMirror.fileURL(inContainer: try temporaryDirectory()))

        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url), .absent)
    }

    /// Avant le premier déverrouillage, le fichier existe mais ne s'ouvre pas.
    func test_readFile_aFileThatDoesNotOpen_isUnreadable() {
        let url = URL(fileURLWithPath: "/mirror.json")

        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url) { _ in
            throw CocoaError(.fileReadNoPermission)
        }, .unreadable)
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url) { _ in
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(EPERM))
        }, .unreadable)
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url) { _ in throw Unreadable() }, .unreadable)
    }

    func test_readFile_onlyTheNoSuchFileErrors_meanAbsent() {
        let url = URL(fileURLWithPath: "/mirror.json")

        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url) { _ in
            throw CocoaError(.fileReadNoSuchFile)
        }, .absent)
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url) { _ in
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT))
        }, .absent)
    }

    func test_readFile_aDamagedFile_orNoContainer_isUnreadable() {
        let url = URL(fileURLWithPath: "/mirror.json")

        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url) { _ in Data("pas du json".utf8) }, .unreadable)
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url) { _ in Data("{}".utf8) }, .unreadable)
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: nil), .unreadable)
    }

    // MARK: - L'écriture

    /// Le fichier ET la clé des versions antérieures, jeu vide compris.
    func test_mirror_writesTheFileAndTheLegacyKey() throws {
        let suite = "nse-lock-mirror-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let url = try XCTUnwrap(NSELockedConversationMirror.fileURL(inContainer: try temporaryDirectory()))

        NSELockedConversationMirror.mirror(["b", "a"], toFile: url, defaults: defaults)
        XCTAssertEqual(defaults.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey), ["a", "b"])
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url), .ids(["a", "b"]))

        NSELockedConversationMirror.mirror([], toFile: url, defaults: defaults)
        XCTAssertEqual(defaults.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey), [])
        XCTAssertEqual(NSELockedConversationMirror.readFile(at: url), .ids([]))
    }

    /// Un fichier qui ne s'écrit pas n'empêche pas la clé : elle peut encore
    /// AJOUTER le verrou que l'extension lira en renfort.
    func test_mirror_aFailedFileWrite_stillWritesTheLegacyKey() throws {
        let suite = "nse-lock-mirror-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        let written = NSELockedConversationMirror.mirror(
            ["c1"], toFile: URL(fileURLWithPath: "/mirror.json"), defaults: defaults
        ) { _, _ in throw Unreadable() }

        XCTAssertFalse(written)
        XCTAssertEqual(defaults.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey), ["c1"])
    }

    /// Le fichier doit rester lisible écran verrouillé après le premier
    /// déverrouillage : l'app est en `NSFileProtectionComplete` par défaut, et
    /// un fichier de classe A se fermerait à chaque verrouillage de l'écran.
    /// Garde de SOURCE : le simulateur n'applique pas la protection des données.
    func test_theDefaultWriter_pinsTheProtectionClassUntilFirstUnlock() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("MeeshyNotificationExtension/NSELockedConversationMirror.swift"),
            encoding: .utf8
        )
        let writer = try XCTUnwrap(source.range(of: "static func writeProtectedUntilFirstUnlock"))
        let body = source[writer.upperBound...].prefix(240)

        XCTAssertTrue(body.contains(".completeFileProtectionUntilFirstUserAuthentication"))
        XCTAssertTrue(body.contains(".atomic"), "l'extension ne lit jamais un fichier à moitié écrit")
    }

    // MARK: - La composition

    func test_conversationLock_theFileDecides() {
        XCTAssertEqual(lock(file: .ids(["c1"])), .locked)
        XCTAssertEqual(lock(file: .ids([])), .open)
        XCTAssertEqual(lock(file: .ids(["autre"])), .open)
        XCTAssertEqual(lock(file: .unreadable), .unknown, "un fichier qui ne s'ouvre pas ne dit pas « ouverte »")
        XCTAssertEqual(lock(nil, file: .unreadable), .noConversation)
        XCTAssertEqual(lock("", file: .ids(["c1"])), .noConversation)
    }

    /// Le renfort et le cliché AJOUTENT un verrou ; aucun n'en retire.
    func test_conversationLock_theLegacyKeyAndTheSnapshot_canOnlyAddALock() {
        XCTAssertEqual(lock(file: .ids([]), legacy: ["c1"]), .locked)
        XCTAssertEqual(lock(file: .ids([]), snapshot: true), .locked)
        XCTAssertEqual(lock(file: .unreadable, legacy: ["c1"]), .locked)
        XCTAssertEqual(lock(file: .unreadable, snapshot: true), .locked)
        XCTAssertEqual(lock(file: .unreadable, legacy: []), .unknown, "une clé vide n'ouvre pas un fichier illisible")
        XCTAssertEqual(lock(file: .ids(["c1"]), legacy: []), .locked)
    }

    /// Écran verrouillé après le premier déverrouillage : le domaine
    /// `UserDefaults` d'une app en classe A peut se fermer, le fichier non.
    /// Une conversation ouverte garde son contenu et ses actions.
    func test_conversationLock_aClosedDefaultsDomain_doesNotSealAConversationTheFileSaysOpen() {
        XCTAssertEqual(lock(file: .ids(["autre"]), legacy: nil), .open)
    }

    // MARK: - La transition (#9223) : une version antérieure n'écrit que la clé

    func test_conversationLock_aFileNeverWritten_fallsBackToTheLegacyKey() {
        XCTAssertEqual(lock(file: .absent, legacy: []), .open, "l'ancienne version a écrit « aucun verrou »")
        XCTAssertEqual(lock(file: .absent, legacy: ["c1"]), .locked)
        XCTAssertEqual(lock(file: .absent, legacy: ["autre"]), .open)
        XCTAssertEqual(lock(file: .absent, legacy: nil), .unknown, "ni fichier ni clé : l'extension ne sait pas")
        XCTAssertEqual(lock(file: .absent, legacy: nil, snapshot: true), .locked)
    }

    // MARK: - Aucune lecture ne peut courir contre une autre

    /// Le fichier se lit EN PREMIER : son verdict ne dépend d'aucune lecture
    /// postérieure.
    func test_conversationLock_readsTheFileFirst() {
        var reads: [String] = []

        _ = NSELockedConversationMirror.conversationLock(
            conversationId: "c1",
            readFile: { reads.append("file"); return .ids([]) },
            readLegacyKey: { reads.append("legacy"); return nil },
            snapshotDeclaresLock: { _ in reads.append("snapshot"); return false }
        )

        XCTAssertEqual(reads.first, "file")
    }

    /// Un appareil qui passe son PREMIER déverrouillage pendant que
    /// l'extension compose : quelle que soit la lecture que le déverrouillage
    /// précède, une conversation sous PIN n'est jamais rendue « ouverte ».
    /// Le cache `CFPreferences` d'un processus réutilisé peut encore servir le
    /// domaine VIDE d'avant le déverrouillage : la clé reste alors `nil`.
    func test_conversationLock_anUnlockDuringTheReads_neverOpensALockedConversation() {
        for unlockAfterReads in 0...3 {
            for legacyCacheIsStale in [false, true] {
                let device = Device(unlockAfterReads: unlockAfterReads, legacyCacheIsStale: legacyCacheIsStale)

                let result = NSELockedConversationMirror.conversationLock(
                    conversationId: "coffre",
                    readFile: { device.readFile() },
                    readLegacyKey: { device.readLegacyKey() },
                    snapshotDeclaresLock: { _ in device.readSnapshot() }
                )

                XCTAssertNotEqual(result, .open, "déverrouillé après \(unlockAfterReads) lecture(s), cache périmé : \(legacyCacheIsStale)")
            }
        }
    }

    /// Le téléphone de `coffre`, verrouillé par PIN, qui passe son premier
    /// déverrouillage après `unlockAfterReads` lectures.
    private final class Device {
        private let unlockAfterReads: Int
        private let legacyCacheIsStale: Bool
        private var reads = 0

        init(unlockAfterReads: Int, legacyCacheIsStale: Bool) {
            self.unlockAfterReads = unlockAfterReads
            self.legacyCacheIsStale = legacyCacheIsStale
        }

        private func read() -> Bool {
            defer { reads += 1 }
            return reads >= unlockAfterReads
        }

        func readFile() -> NSELockMirrorRead { read() ? .ids(["coffre"]) : .unreadable }

        func readLegacyKey() -> [String]? {
            let unlocked = read()
            return unlocked && !legacyCacheIsStale ? ["coffre"] : nil
        }

        func readSnapshot() -> Bool { read() }
    }
}
