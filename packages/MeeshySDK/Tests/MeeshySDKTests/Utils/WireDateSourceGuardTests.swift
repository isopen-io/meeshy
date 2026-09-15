import XCTest

/// LES DATES DU FIL N'ONT QU'UNE SOURCE (#6611) — `WireDate`.
///
/// `ce94a0f71d` a cassé douze sites un par un sans qu'aucun témoin ne rougisse,
/// parce que chacun reformulait localement la règle « date-heure ISO 8601 à
/// millisecondes ». Cette garde interdit le RETOUR d'une reformulation dans
/// `Sources/` : un formateur ISO 8601 construit à la main, une heure seule, un
/// `.formatted(.iso8601)` tronqué à la seconde.
///
/// Elle ne vise pas les `JSONEncoder`/`JSONDecoder` de persistance locale
/// (`dateEncodingStrategy = .iso8601` du cache, de GRDB, des files d'attente) :
/// ils ne parlent pas à la passerelle, et aucune des formes ci-dessous ne les
/// désigne.
final class WireDateSourceGuardTests: XCTestCase {

    private static let formesInterdites = [
        "ISO8601DateFormatter(",
        ".iso8601.time(",
        "ISO8601FormatStyle(",
        ".formatted(.iso8601)",
        "strategy: .iso8601",
    ]

    /// Chemin relatif au paquet → raison. Une exemption se justifie ou n'existe pas.
    private static let exemptions: [String: String] = [
        "Sources/MeeshySDK/Utils/WireDate.swift": "la source unique des dates du fil",
    ]

    private static var racineDuPaquet: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Les lignes de CODE qui portent une forme interdite — un commentaire n'est
    /// pas compilé et peut nommer ce qu'il documente.
    static func violations(in source: String) -> [String] {
        source
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
            .filter { ligne in formesInterdites.contains { ligne.contains($0) } }
    }

    private static func sourcesSwift() -> [(chemin: String, source: String)] {
        let racine = racineDuPaquet
        let sources = racine.appendingPathComponent("Sources")
        guard let enumerateur = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil) else {
            return []
        }
        return enumerateur
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .compactMap { url in
                guard let source = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                let chemin = String(url.standardizedFileURL.path.dropFirst(racine.standardizedFileURL.path.count + 1))
                return (chemin, source)
            }
    }

    // MARK: - Le dépôt

    func test_sources_aucuneDateDuFilNeReformuleWireDate() {
        let fichiers = Self.sourcesSwift()
        XCTAssertGreaterThan(fichiers.count, 100, "la garde doit balayer les sources réelles du paquet")

        let trouvees = fichiers
            .filter { Self.exemptions[$0.chemin] == nil }
            .flatMap { fichier in Self.violations(in: fichier.source).map { "\(fichier.chemin): \($0)" } }

        XCTAssertEqual(
            trouvees, [],
            "une date du fil passe par WireDate.string(from:) / WireDate.date(from:) — jamais par un formateur local"
        )
    }

    func test_exemptions_designentDesFichiersQuiExistent() {
        let chemins = Set(Self.sourcesSwift().map(\.chemin))
        let perimees = Self.exemptions.keys.filter { !chemins.contains($0) }
        XCTAssertEqual(perimees, [], "une exemption périmée couvre un fichier disparu")
    }

    // MARK: - La garde elle-même

    func test_violations_voitChaqueFormeInterdite() {
        let source = """
        let a = ISO8601DateFormatter()
        let b = try Date(s, strategy: .iso8601.time(includingFractionalSeconds: true))
        let c = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        let d = now.formatted(.iso8601)
        let e = try? Date(s, strategy: .iso8601)
        let f = WireDate.string(from: now)
        """
        XCTAssertEqual(Self.violations(in: source).count, Self.formesInterdites.count)
    }

    func test_violations_ignoreUnCommentaire() {
        let source = """
        // ISO8601DateFormatter() est coûteux à allouer
        /// `.formatted(.iso8601)` tronque à la seconde
        let f = WireDate.string(from: now)
        """
        XCTAssertEqual(Self.violations(in: source), [])
    }
}
