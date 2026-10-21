import XCTest
@testable import Meeshy

/// **Balayage des index (iPhone et iPad) : `.first!` et `.last!` ne reviennent pas.**
///
/// Un `.first!` sur une liste qui peut se vider — après un `await`, une purge
/// socket, une page remplacée — est un plantage différé. Le balayage du
/// 2026-10-17 n'en a trouvé que sur des listes qui NE PEUVENT PAS être vides,
/// listées ci-dessous avec leur raison. Toute nouvelle occurrence doit lire
/// l'optionnel (`guard let`, `?? valeur`) ou rejoindre la liste en disant
/// pourquoi la collection n'est jamais vide.
final class IndexForceUnwrapGuardTests: XCTestCase {

    /// `fichier` → nombre d'occurrences admises, et pourquoi.
    private static let allowed: [String: Int] = [
        // `FileManager.urls(for:in: .userDomainMask)` d'un dossier système : jamais vide sur iOS.
        "StickerLibraryStore.swift": 1,
        "CrashStackDumper.swift": 1,
        "DiskCacheStore.swift": 1,
        // Groupes construits non vides par `splitIntoRawGroups` (un message au moins chacun).
        "EpisodeSegmenter.swift": 8,
        // `bucketTiers` : tableau constant non vide.
        "AudioWaveform.swift": 1,
    ]

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Guards
            .deletingLastPathComponent() // Unit
            .deletingLastPathComponent() // MeeshyTests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent() // racine
    }

    private static let scannedRoots = [
        "apps/ios/Meeshy", "apps/ios/MeeshyWidgets", "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyNotificationExtension", "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyBroadcastExtension", "packages/MeeshySDK/Sources",
    ]

    private func occurrences() throws -> [String: Int] {
        var counts: [String: Int] = [:]
        for root in Self.scannedRoots {
            let base = Self.repoRoot.appendingPathComponent(root)
            guard let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
                let hits = code.components(separatedBy: ".first!").count - 1 + code.components(separatedBy: ".last!").count - 1
                if hits > 0 { counts[url.lastPathComponent, default: 0] += hits }
            }
        }
        return counts
    }

    func test_forceUnwrappedFirstOrLast_onlyWhereTheCollectionCannotBeEmpty() throws {
        let found = try occurrences()
        let offenders = found.filter { file, count in count > (Self.allowed[file] ?? 0) }
        XCTAssertTrue(
            offenders.isEmpty,
            "`.first!` / `.last!` sur une liste qui peut se vider : lire l'optionnel. "
            + offenders.map { "\($0.key) (\($0.value))" }.sorted().joined(separator: ", ")
        )
    }

    /// Sans elle, le garde verdirait en ne lisant rien.
    func test_theScanSeesTheSources() throws {
        let found = try occurrences()
        XCTAssertEqual(found["EpisodeSegmenter.swift"], 8, "racine attendue : \(Self.repoRoot.path)")
    }
}
