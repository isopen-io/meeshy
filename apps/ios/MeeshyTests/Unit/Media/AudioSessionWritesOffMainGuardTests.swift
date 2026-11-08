import XCTest

/// **Aucun `setCategory` ni `setActive` sur le fil principal** (#17038).
///
/// HangTracer relevait 53 gels de l'iPhone 18 Pro Max, jusqu'à 1,69 s, le fil
/// principal bloqué dans un aller-retour SYNCHRONE vers le serveur audio :
/// `MediaSessionCoordinator.activatePlaybackSync` (vidéo, story, aperçu de
/// son), `activateRecordingSync` (vocal), `deactivatePlaybackSync`, et la
/// configuration d'un appel (`configureAudioSession`,
/// `activateAudioSessionWithoutCallKit`) par `audioSessionQueue.sync`.
///
/// Une écriture de session n'existe plus que dans les fichiers qui la font
/// sur la file série unique (`MediaSessionCoordinator.sessionQueue`, que la
/// couche appel partage sous le nom `audioSessionQueue`), ou sur la file
/// privée de CallKit. Partout ailleurs elle est interdite ; et dans ces
/// fichiers, les points d'entrée appelés depuis le fil principal ne
/// l'attendent plus.
final class AudioSessionWritesOffMainGuardTests: XCTestCase {

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .deletingLastPathComponent()   // apps/
            .deletingLastPathComponent()   // racine du dépôt
    }

    private static let scannedRoots = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyBroadcastExtension",
        "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyWidgets",
        "packages/MeeshySDK/Sources",
    ]

    /// Les seuls fichiers où une écriture de session est permise, et pourquoi.
    private static let allowed: [String: String] = [
        "packages/MeeshySDK/Sources/MeeshySDK/Media/MediaSessionCoordinator.swift":
            "les écritures s'exécutent sur sessionQueue (perform…, onSessionQueue)",
        "packages/MeeshySDK/Sources/MeeshySDK/Media/MediaSessionCoordinator+MixableVoice.swift":
            "les écritures s'exécutent dans onSessionQueue",
        "packages/MeeshySDK/Sources/MeeshySDK/Media/AudioSessionProviding.swift":
            "le relais de la session réelle, appelé par le coordinateur seul",
        "apps/ios/Meeshy/Features/Call/Services/CallCollaborators/CallAudioSessionController.swift":
            "les écritures s'exécutent dans audioSessionQueue.async",
        "apps/ios/Meeshy/Features/Call/Services/CallCollaborators/CallAudioSystemObserver.swift":
            "les écritures s'exécutent dans audioSessionQueue.async",
        "apps/ios/Meeshy/Features/Call/Services/CallManager+CallPreview.swift":
            "l'écriture s'exécute dans audioSessionQueue.async",
    ]

    private static func writesTheSession(_ text: String) throws -> Bool {
        let pattern = try NSRegularExpression(
            pattern: #"(\w*[sS]ession|sharedInstance\(\))\s*\.\s*set(Active|Category)\("#
        )
        return pattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    /// Le code, commentaires retirés : ils racontent l'ancien comportement.
    private static func code(at url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: .newlines)
            .map { $0.components(separatedBy: "//").first ?? "" }
            .joined(separator: "\n")
    }

    private static func code(_ relativePath: String) throws -> String {
        try code(at: repositoryRoot.appendingPathComponent(relativePath))
    }

    private static func swiftFiles(under relativeRoot: String) -> [String] {
        let root = repositoryRoot.appendingPathComponent(relativeRoot)
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        let prefix = repositoryRoot.path + "/"
        return walker.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { $0.path.replacingOccurrences(of: prefix, with: "") }
    }

    private static func body(of signature: String, in code: String) throws -> String {
        let start = try XCTUnwrap(code.range(of: signature), "\(signature) introuvable")
        let rest = code[start.upperBound...]
        let end = rest.range(of: "\n    }\n")?.lowerBound ?? rest.endIndex
        return String(rest[..<end])
    }

    func test_noSessionWrite_outsideTheFilesThatRunThemOnTheSessionQueue() throws {
        let offenders = try Self.scannedRoots
            .flatMap(Self.swiftFiles(under:))
            .filter { Self.allowed[$0] == nil }
            .filter { try Self.writesTheSession(Self.code($0)) }

        XCTAssertEqual(offenders, [],
                       "setCategory / setActive bloquent le fil principal jusqu'à 1,69 s : passer par MediaSessionCoordinator")
    }

    func test_theScan_seesTheAllowedFiles() throws {
        for path in Self.allowed.keys {
            XCTAssertTrue(try Self.writesTheSession(Self.code(path)),
                          "\(path) n'écrit plus la session : le retirer de la liste")
        }
    }

    /// Les points d'entrée du coordinateur rendent la main tout de suite : ils
    /// mettent l'écriture en file, ils ne la font pas.
    func test_theCoordinatorEntryPoints_onlyEnqueueTheWrite() throws {
        let code = try Self.code("packages/MeeshySDK/Sources/MeeshySDK/Media/MediaSessionCoordinator.swift")
        XCTAssertFalse(code.contains("AVAudioSession.sharedInstance()"),
                       "le coordinateur écrit la session injectée, sur sa file")
        for signature in [
            "public nonisolated func activatePlaybackSync(",
            "public nonisolated func activateRecording(",
            "public nonisolated func deactivatePlaybackSync() {",
            "public nonisolated func activateContentPlayback(",
        ] {
            let entry = try Self.body(of: signature, in: code)
            XCTAssertFalse(entry.contains("audioSession.set"), "\(signature) écrit la session sur le fil de l'appelant")
            XCTAssertTrue(entry.contains("onSessionQueue"), "\(signature) met l'écriture en file")
        }
    }

    /// La couche appel configure sa session sans que le fil principal attende.
    /// Le contrat CallKit (`provider(_:didActivate:)`, sur la file privée de
    /// CallKit) n'est pas touché.
    func test_theCallEntryPoints_neverWaitForTheAudioSessionQueue() throws {
        let controller = try Self.code(
            "apps/ios/Meeshy/Features/Call/Services/CallCollaborators/CallAudioSessionController.swift")
        for signature in ["func configureAudioSession() {", "func activateAudioSessionWithoutCallKit() {"] {
            let entry = try Self.body(of: signature, in: controller)
            XCTAssertFalse(entry.contains("audioSessionQueue.sync"), "\(signature) bloque le fil principal")
            XCTAssertTrue(entry.contains("audioSessionQueue.async"), signature)
        }
        let preview = try Self.code("apps/ios/Meeshy/Features/Call/Services/CallManager+CallPreview.swift")
        let audible = try Self.body(of: "func setPreviewAudible(_ audible: Bool) {", in: preview)
        XCTAssertFalse(audible.contains("audioSessionQueue.sync"), "setPreviewAudible bloque le fil principal")
    }
}
