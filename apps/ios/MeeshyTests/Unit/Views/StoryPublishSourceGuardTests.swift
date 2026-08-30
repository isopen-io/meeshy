import XCTest
@testable import Meeshy

/// Deux gardes de source pour ce que le comportement seul ne verrouille pas.
///
/// La vraie garde de C5 est comportementale (`StoryUploadQueueTests` :
/// deux publications = deux entrées). Celle-ci est un FILET DE SÉCURITÉ pour
/// les surfaces de VUE, non hostables en XCTest : elle interdit la FAMILLE
/// d'expressions, pas une chaîne — un `guard viewModel.activeUploads.isEmpty`
/// rétablirait exactement le verrou que C5 interdit tout en passant un grep
/// littéral sur `activeUpload == nil`.
final class StoryPublishSourceGuardTests: XCTestCase {

    private static let creationEntryAnchor = "showStoryComposer = true"
    private static let blockingSymbols = ["activeUpload", "activeUploads", "currentUploadId"]

    func test_noProductionCodeGuardsCreationOnActiveUpload() throws {
        var scannedEntries = 0
        for file in ["Features/Main/Views/StoryTrayView.swift",
                     "Features/Main/Views/MyStoriesView.swift"] {
            let lines = try Self.strippedLines(of: file)
            let entries = lines.indices.filter { lines[$0].contains(Self.creationEntryAnchor) }
            scannedEntries += entries.count

            for index in entries {
                // Remonter jusqu'à l'ouverture du bloc d'action (Button / item
                // de menu contextuel) et vérifier qu'aucune garde de file d'upload
                // ne s'y interpose.
                let start = Self.enclosingActionStart(lines: lines, from: index)
                for line in lines[start...index] {
                    let trimmed = line.trimmingCharacters(in: .whitespaces)
                    guard trimmed.hasPrefix("guard ") || trimmed.hasPrefix("if ") else { continue }
                    for symbol in Self.blockingSymbols where trimmed.contains(symbol) {
                        XCTFail("""
                        \(file):\(index + 1) — une garde sur « \(symbol) » précède une entrée de \
                        création de story. Critère C5 : toute garde du type \
                        `guard activeUpload == nil` sur l'entrée de création = échec. \
                        Ligne fautive : \(trimmed)
                        """)
                    }
                }
            }
        }
        // Contrôle positif : une garde qui ne trouverait plus AUCUNE entrée de
        // création (fichier renommé, ancre changée) ne protégerait plus rien.
        XCTAssertGreaterThanOrEqual(scannedEntries, 3,
                                    "Les trois entrées de création du tray doivent être visibles")
    }

    /// C3 sur le chemin HORS-LIGNE : l'enrichissement thumbHash est toujours le
    /// DERNIER maillon avant le premier octet réseau, et jamais devant un
    /// feedback utilisateur. L'intercaler avant les lignes optimistes laisserait
    /// le tray VIDE plusieurs secondes (jusqu'à la borne par vidéo).
    /// Non observable de l'extérieur — la fonction n'expose aucun point
    /// intermédiaire — d'où l'ancrage sur l'ordre des appels.
    func test_offlinePublish_insertsOptimisticRowsBeforeAwaitingThumbHashes() throws {
        let source = try Self.strippedLines(of: "Features/Main/ViewModels/StoryViewModel.swift")
            .joined(separator: "\n")
        guard let start = source.range(of: "func enqueueStoryForOfflinePublish("),
              let rows = source.range(of: "insertOptimisticOfflineStories(", range: start.upperBound..<source.endIndex),
              let toast = source.range(of: "story.publish.queue.enqueued", range: rows.upperBound..<source.endIndex),
              let enrich = source.range(of: "enrichSlidesWithThumbHashes(", range: start.upperBound..<source.endIndex) else {
            XCTFail("Séquence hors-ligne introuvable dans StoryViewModel.swift")
            return
        }
        XCTAssertTrue(rows.lowerBound < enrich.lowerBound,
                      "Les lignes optimistes doivent précéder l'enrichissement")
        XCTAssertTrue(toast.lowerBound < enrich.lowerBound,
                      "Le haptic + toast doivent précéder l'enrichissement")
    }

    /// Le littéral « FRIENDS » ne doit plus vivre qu'à UN endroit côté app :
    /// `StoryVisibilityPreferenceStore.fallback`, dérivé de
    /// `PostVisibility.friends`. Deux défauts dupliqués divergent dès que le
    /// défaut produit bouge.
    func test_storyViewModel_hasNoDuplicatedFriendsLiteral() throws {
        let source = try Self.strippedLines(of: "Features/Main/ViewModels/StoryViewModel.swift")
            .joined(separator: "\n")
        // Garde-fou de la garde : une source vide ferait passer l'assertion
        // négative ci-dessous au vert sans rien avoir vérifié.
        XCTAssertGreaterThan(source.count, 400,
                             "Source (unité) de StoryViewModel introuvable ou vide — la garde ne mesurerait rien.")

        XCTAssertFalse(
            source.contains("\"FRIENDS\""),
            """
            `StoryViewModel` porte encore un littéral "FRIENDS" : utiliser \
            `StoryVisibilityPreferenceStore.fallback`.
            """
        )
    }

    // MARK: - Méta-tests de la garde

    func test_guardDetectsABlockingGuardInASampleBlock() {
        let sample = """
        Button {
            guard viewModel.activeUploads.isEmpty else { return }
            viewModel.showStoryComposer = true
        } label: { }
        """
        let lines = sample.components(separatedBy: "\n")
        guard let index = lines.firstIndex(where: { $0.contains(Self.creationEntryAnchor) }) else {
            return XCTFail("Ancre absente de l'échantillon")
        }
        let start = Self.enclosingActionStart(lines: lines, from: index)
        let offending = lines[start...index].contains { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            return trimmed.hasPrefix("guard ") && Self.blockingSymbols.contains { trimmed.contains($0) }
        }
        XCTAssertTrue(offending, "La garde doit détecter la famille d'expressions, pas une chaîne exacte")
    }

    // MARK: - Helpers

    /// Début du bloc d'action englobant : remonte jusqu'à la ligne qui ouvre un
    /// `Button {` / `AvatarContextMenuItem(...) {` / closure d'action, sans
    /// jamais dépasser 12 lignes (au-delà, on sortirait du bloc).
    private static func enclosingActionStart(lines: [String], from index: Int) -> Int {
        let lowerBound = max(0, index - 12)
        var i = index
        while i > lowerBound {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("Button {") || trimmed.contains("AvatarContextMenuItem(") { return i }
            i -= 1
        }
        return lowerBound
    }

    /// `StoryViewModel` s'est scindé en plusieurs fichiers (#4425) : ce chemin
    /// précis passe par l'UNITÉ (`AppSourceGuard.storyViewModelSource`) — les
    /// deux gardes ci-dessus cherchent des séquences (ordre d'appels, absence
    /// d'un littéral) qui peuvent vivre dans un fichier frère
    /// (`StoryViewModel+Publication.swift`) depuis le découpage. Les deux
    /// autres appelants (`StoryTrayView.swift`, `MyStoriesView.swift`)
    /// continuent de lire leur fichier tel quel.
    private static func strippedLines(of relativePath: String) throws -> [String] {
        let raw: String
        if "Meeshy/" + relativePath == AppSourceGuard.storyViewModelPath {
            raw = try AppSourceGuard.storyViewModelSource()
        } else {
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()  // …/Unit/Views
                .deletingLastPathComponent()  // …/Unit
                .deletingLastPathComponent()  // …/MeeshyTests
                .deletingLastPathComponent()  // …/apps/ios
                .appendingPathComponent("Meeshy")
                .appendingPathComponent(relativePath)
            raw = try String(contentsOf: url, encoding: .utf8)
        }
        return raw
            .components(separatedBy: "\n")
            .map { line -> String in
                guard let range = line.range(of: "//") else { return line }
                return String(line[line.startIndex..<range.lowerBound])
            }
    }
}
