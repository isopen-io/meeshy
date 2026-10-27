import XCTest

/// **Le budget de taille des fichiers Swift, mesuré.** Au-delà de 1 000 lignes
/// (`wc -l`), un découpage se justifie sans se discuter (directive 2026-09-02,
/// #4302) : aucun fichier écrit à la main de l'app, de ses extensions ou du SDK
/// n'y reste. Un fichier GÉNÉRÉ (`// GÉNÉRÉ` en tête) n'est pas mesuré.
///
/// #10988 — la dette héritée (`legacyOverBudget`, `legacyLineCeiling`) est
/// soldée : la liste est vide et le plafond à 0. Les trois règles qui la
/// gardaient (pas de nouveau fichier au-delà de 1 200, la liste ne s'allonge
/// pas, son cumul ne monte pas) étaient devenues soit vides, soit incluses dans
/// le seuil de 1 000 lignes ci-dessous, qui balaie un périmètre plus large. Leur
/// histoire est dans `git log` de ce fichier.
final class FileSizeBudgetGuardTests: XCTestCase {

    private static let splitThreshold = 1000

    func test_noHandWrittenFileExceedsTheSplitThreshold() throws {
        let offenders = try handWrittenSources()
            .map { ($0.lastPathComponent, lineCount(of: $0) - 1) }
            .filter { $0.1 > Self.splitThreshold }
            .sorted { $0.1 > $1.1 }

        XCTAssertTrue(
            offenders.isEmpty,
            "Fichier(s) au-delà du seuil de découpe de \(Self.splitThreshold) lignes — "
            + "découper par responsabilité :\n"
            + offenders.map { "  \($0.0) — \($0.1) lignes" }.joined(separator: "\n")
        )
    }

    /// Sans cette borne, le seuil passerait au vert en ne regardant rien.
    func test_splitThresholdSeesAppAndSDKButNotGenerated() throws {
        let sources = try handWrittenSources()
        let names = Set(sources.map(\.lastPathComponent))
        XCTAssertGreaterThan(sources.count, 400)
        XCTAssertTrue(names.contains("CallManager.swift"))
        XCTAssertTrue(names.contains("MeeshyColors.swift"))
        XCTAssertFalse(names.contains("AppearanceCatalogData.swift"))
    }

    private func handWrittenSources() throws -> [URL] {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
        let roots = [
            "Meeshy", "MeeshyNotificationExtension", "MeeshyNotificationContentExtension",
            "MeeshyShareExtension", "MeeshyBroadcastExtension", "MeeshyWidgets",
        ].map { iosRoot.appendingPathComponent($0) }
            + [iosRoot.deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("packages/MeeshySDK/Sources")]
        return roots
            .flatMap { swiftFiles(under: $0) }
            .filter { !isGenerated($0) }
    }

    private func swiftFiles(under root: URL) -> [URL] {
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func isGenerated(_ url: URL) -> Bool {
        let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return text.hasPrefix("// GÉNÉRÉ")
    }

    private func lineCount(of url: URL) -> Int {
        let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return text.components(separatedBy: .newlines).count
    }
}
