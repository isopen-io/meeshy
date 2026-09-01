import XCTest

/// A key is a PROMISE: one string, served to every site that uses it.
///
/// `LocalizationConsistencyTests` guards a call site against the CATALOG — and
/// therefore cannot speak about the two cases this suite covers:
///
/// 1. **A key the catalog does not have.** Its inline `defaultValue` is not a
///    fallback, it is what SHIPS, to all seven locales. There is no catalog entry
///    to compare it against, so `test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage`
///    skips it silently.
/// 2. **A screen that is not pinned.** That guard iterates `fullyLocalizedScreens`
///    only, so a divergence on any of the ~1090 other sources is invisible.
///
/// In both cases two sites of the SAME key can declare two DIFFERENT strings, and
/// nothing goes red — because no guard ever compares two sites to EACH OTHER.
/// That is the axis added at 271i, and it found both shapes on the first run:
///
/// - `feed.media.item` carried FIVE defaults (*Media 1 of …* through *Media 5 of …*)
///   across FOURTEEN call sites. One catalog entry cannot serve
///   five strings, so the key was untranslatable as written — and the ratchet's own
///   remediation advice ("add the catalog entry") would have COLLAPSED the five
///   VoiceOver labels into one. A trap, armed and waiting.
/// - `common.done` declared `"OK"` at an SDK site and `"Terminé"` at three app
///   sites. The catalog has the key and wins at runtime, so nothing was visibly
///   wrong; the literal simply lied about what the app says.
///
/// Comparison is on the LITERAL SKELETON, not the raw default: two sites that
/// differ only in the expression they interpolate make the same promise
/// (`"Supprimer \(label)"` / `"Supprimer \(labelFor(x))"` both extract to
/// `Supprimer %@`), and flagging those would be noise that gets the guard
/// allowlisted into uselessness.
@MainActor
final class InlineDefaultConsistencyTests: XCTestCase {

    private static let sourceRoots = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyContextMenu",
        "packages/MeeshySDK/Sources",
    ]

    /// Documented exceptions. Keep empty; add a key only with a justifying comment.
    private static let allowlist: Set<String> = []

    func test_noKeyIsGivenTwoDifferentInlineDefaults() throws {
        let repoRoot = Self.repoRoot()
        let files = Self.swiftFiles(under: repoRoot)
        guard !files.isEmpty else {
            throw XCTSkip("No Swift sources found — source tree unavailable")
        }

        // (catalog, key) → skeleton → the files that declare it.
        //
        // Grouping by CATALOG and not by key alone is load-bearing. `share.empty`
        // says "Aucune conversation" in the app and "Ouvrez Meeshy une fois pour
        // retrouver vos conversations ici" in the share extension — two bundles,
        // two catalogs, two entries, no conflict. Keying on the bare name would
        // report it, and reporting a non-defect is how a guard earns the allowlist
        // that ends it.
        var declarations: [CatalogKey: [String: Set<String>]] = [:]
        for file in files {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for call in LocalizedCallScanner.calls(in: text) {
                guard LocalizedCallScanner.isIdentifier(call.key),
                      !Self.allowlist.contains(call.key),
                      let inline = call.defaultValue else { continue }
                let catalogKey = CatalogKey(
                    catalog: LocalizationCatalogMap.catalogPath(
                        resolvedFor: file, isModuleBundle: call.isModuleBundle
                    ),
                    key: call.key
                )
                let skeleton = LocalizedCallScanner.literalSkeleton(of: inline)
                let relative = file.path.replacingOccurrences(of: repoRoot.path + "/", with: "")
                declarations[catalogKey, default: [:]][skeleton, default: []].insert(relative)
            }
        }

        let violations = declarations
            .filter { $0.value.count > 1 }
            .sorted { ($0.key.catalog, $0.key.key) < ($1.key.catalog, $1.key.key) }
            .map { catalogKey, bySkeleton -> String in
                let shapes = bySkeleton.sorted { $0.key < $1.key }.map { skeleton, sites in
                    "      \"\(skeleton)\"  ← \(sites.sorted().joined(separator: ", "))"
                }
                return "\(catalogKey.key)   [\(catalogKey.catalog)]\n" + shapes.joined(separator: "\n")
            }

        XCTAssertTrue(
            violations.isEmpty,
            "One key, several different strings. A key resolves to ONE catalog entry, "
            + "so these sites cannot all be served: either they mean the same thing and "
            + "must say it identically, or they mean different things and need different "
            + "keys. Interpolations are normalized away (\u{FFFC}), so what differs below "
            + "is the TEXT:\n"
            + violations.joined(separator: "\n")
        )
    }

    // The skeletonizer's own bounds — the ones that keep the guard above from
    // going green on a broken tree by collapsing everything, or by collapsing
    // nothing — live with the scanner, in `LocalizedCallScannerTests`.

    // MARK: - Source tree

    private struct CatalogKey: Hashable {
        let catalog: String
        let key: String
    }

    private static func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Architecture
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root
    }

    private static func swiftFiles(under repoRoot: URL) -> [URL] {
        var files: [URL] = []
        for root in sourceRoots {
            let directory = repoRoot.appendingPathComponent(root)
            guard let enumerator = FileManager.default.enumerator(
                at: directory,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            ) else { continue }
            for case let url as URL in enumerator {
                if url.path.contains("/Build/") || url.path.contains("/.build/") { continue }
                if url.pathExtension == "swift" { files.append(url) }
            }
        }
        return files
    }
}
