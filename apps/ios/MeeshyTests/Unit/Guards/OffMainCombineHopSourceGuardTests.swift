import XCTest

/// **Une chaîne Combine qui part d'une source HORS DU MAIN saute sur le main
/// AVANT son premier opérateur à fermeture.**
///
/// L'app compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, MeeshyUI
/// sous `.defaultIsolation(MainActor.self)` : une fermeture `filter`, `map`,
/// `compactMap` ou `sink` écrite dans ce code est isolée au MainActor, et le
/// runtime vérifie l'exécuteur à son ENTRÉE. Reçue sur une autre file, elle
/// trappe — `SIGTRAP`, `_dispatch_assert_queue_fail`. Un `Task { @MainActor }`
/// À L'INTÉRIEUR de la fermeture ne protège rien : la vérification a déjà eu
/// lieu.
///
/// C'est le plantage TestFlight des builds 1915/1916 (« l'app s'arrête à chaque
/// fois ») : `NetworkMonitor.isOfflinePublisher.filter { !$0 }` dans
/// `VisitorReachReporter.liveReconnects`, au lancement et à chaque retour du
/// réseau. Et celui de « Find nearby » le 2026-08-25, même source.
///
/// Un tel défaut ne rougit pas un test : il TUE le process. D'où cette garde,
/// qui lit le code de chaque abonné des sources connues pour émettre hors du
/// main :
/// - `isOfflinePublisher` — débounce sur `DispatchQueue.global(qos: .utility)` ;
/// - `nearCapacityPublisher` — émis depuis l'actor `OfflineQueue` ;
/// - `ConversationAppearanceChange.notification` — postée par l'actor
///   `ConversationStore` ;
/// - `.meeshyAgeBelowMinimum` — postée par `APIClient`, sur l'exécuteur de
///   l'appelant de la requête ;
/// - le KVO d'`AVPlayer` (`currentItem`, `duration`) — publié sur le fil qui a
///   changé la valeur.
///
/// Toute occurrence qui continue une chaîne (`.opérateur` après la source, ou
/// après la parenthèse qui l'enveloppe) doit commencer par `.receive(on:`. Une
/// occurrence qui ne continue pas de chaîne (passée à une fonction) doit être
/// nommée dans `reviewedHandOffs`, avec la raison qui la rend sûre.
final class OffMainCombineHopSourceGuardTests: XCTestCase {

    private static let offMainSources = [
        "isOfflinePublisher",
        "nearCapacityPublisher",
        "ConversationAppearanceChange.notification",
        ".meeshyAgeBelowMinimum",
        "publisher(for: \\.currentItem)",
        "publisher(for: \\.duration)",
    ]

    /// Fichier → raison. Une source passée à une fonction qui saute elle-même.
    private static let reviewedHandOffs: [String: String] = [
        "VisitorReachReporter.swift":
            "reconnects(from:) saute sur le main avant filter/map (VisitorReachReconnectsTests)",
    ]

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private static let scannedRoots = [
        "apps/ios/Meeshy",
        "packages/MeeshySDK/Sources/MeeshyUI",
    ]

    private func swiftFiles() -> [URL] {
        Self.scannedRoots.flatMap { root -> [URL] in
            let base = Self.repoRoot.appendingPathComponent(root)
            guard let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { return [] }
            return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        }
    }

    func test_scan_readsTheSourceTree() {
        XCTAssertGreaterThan(swiftFiles().count, 500, "la garde ne lirait RIEN : chemin de la racine faux")
    }

    func test_everyChainFromAnOffMainSource_hopsToMainBeforeItsFirstOperator() throws {
        var violations: [String] = []
        var seen = 0
        for url in swiftFiles() {
            let raw = try String(contentsOf: url, encoding: .utf8)
            guard Self.offMainSources.contains(where: raw.contains) else { continue }
            let source = AppSourceGuard.stripComments(raw)
            for token in Self.offMainSources {
                var cursor = source.startIndex
                while let hit = source.range(of: token, range: cursor..<source.endIndex) {
                    cursor = hit.upperBound
                    // Une DÉCLARATION de la source n'est pas un abonnement.
                    let lineStart = source[..<hit.lowerBound].lastIndex(of: "\n") ?? source.startIndex
                    let line = source[lineStart..<hit.lowerBound]
                    if line.hasSuffix("var ") || line.hasSuffix("let ") || line.hasSuffix("func ") { continue }
                    seen += 1
                    let rest = source[hit.upperBound...].drop { $0.isWhitespace || $0 == ")" }
                    let file = url.lastPathComponent
                    if rest.hasPrefix(".") {
                        if !rest.hasPrefix(".receive(on:") {
                            let lineNo = source[..<hit.lowerBound].filter { $0 == "\n" }.count + 1
                            violations.append("\(file):\(lineNo) — \(token) enchaîne `\(rest.prefix(30))` sans saut préalable")
                        }
                    } else if Self.reviewedHandOffs[file] == nil {
                        let lineNo = source[..<hit.lowerBound].filter { $0 == "\n" }.count + 1
                        violations.append("\(file):\(lineNo) — \(token) remis à une fonction non relue (reviewedHandOffs)")
                    }
                }
            }
        }
        XCTAssertGreaterThan(seen, 5, "la garde n'a trouvé aucun abonné : elle ne mesure rien")
        XCTAssertTrue(
            violations.isEmpty,
            "Source hors du main sans .receive(on: DispatchQueue.main) AVANT le premier opérateur — " +
            "SIGTRAP (_dispatch_assert_queue_fail) à la première émission :\n" + violations.joined(separator: "\n")
        )
    }

    /// `IncomingCallWakeGate` garde « hors du main → on saute » : cette garde
    /// ne peut s'exécuter que dans une fermeture NON isolée. Écrite dans le
    /// type `@MainActor`, la fermeture trapperait à son entrée avant de lire
    /// `Thread.isMainThread`.
    func test_incomingCallWakeGate_offMainGuardLivesInANonisolatedClosure() throws {
        let url = Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/Features/Main/Services/CallManagerHost.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(source.contains("offers().sink(receiveValue: Self.delivery(to: self))"))
        XCTAssertTrue(source.contains("nonisolated private static func delivery("))
    }
}
