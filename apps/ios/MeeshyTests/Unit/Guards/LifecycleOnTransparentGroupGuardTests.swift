import XCTest
@testable import Meeshy

/// **Un `Group` vide n'existe pas : ce qu'on y accroche ne part jamais** (#17247).
///
/// Mesuré le 2026-11-09 sur deux iPhone réels : le bouton talkie n'apparaissait dans l'en-tête d'aucun direct.
/// `ConversationHeaderTalkieButton` posait `.task(id: userId) { await offer.load() }` sur un `Group` dont le seul
/// contenu dépendait de `offer.offered`. Un `Group` est TRANSPARENT : il distribue ses modificateurs à ses enfants, et
/// sans enfant il n'y a aucune vue à laquelle les accrocher. Le chargement qui devait faire paraître le bouton
/// attendait que le bouton paraisse.
///
/// La garde est SYNTAXIQUE : un modificateur de cycle de vie (`.task`, `.onAppear`) ne se pose jamais à la racine d'un
/// `Group { … }` dans les vues du talkie.
final class LifecycleOnTransparentGroupGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private var guardedFiles: [URL] {
        let talkie = appRoot.appendingPathComponent("Features/Talkie")
        let views = (try? FileManager.default.contentsOfDirectory(at: talkie, includingPropertiesForKeys: nil)) ?? []
        return views.filter { $0.pathExtension == "swift" }
            + [appRoot.appendingPathComponent("Features/Main/Views/ConversationLayers/ConversationHeaderTalkieButton.swift")]
    }

    private func indentation(_ line: String) -> Int {
        line.prefix { $0 == " " }.count
    }

    /// La racine de la chaîne de modificateurs qui porte la ligne `index` : la première ligne au-dessus, à la même
    /// indentation, qui n'est ni un modificateur (`.`) ni une accolade fermante.
    private func chainRoot(of index: Int, in lines: [String]) -> String? {
        let depth = indentation(lines[index])
        return lines[..<index].reversed().first { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, indentation(line) == depth else { return false }
            return !trimmed.hasPrefix(".") && !trimmed.hasPrefix("}")
        }?.trimmingCharacters(in: .whitespaces)
    }

    func violations(in source: String) -> [String] {
        let lines = AppSourceGuard.strippedLines(source)
        return lines.indices.compactMap { index in
            let trimmed = lines[index].trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix(".task") || trimmed.hasPrefix(".onAppear") else { return nil }
            guard chainRoot(of: index, in: lines) == "Group {" else { return nil }
            return "ligne \(index + 1) : \(trimmed)"
        }
    }

    func test_guardedFiles_readNonEmptySources() throws {
        XCTAssertGreaterThan(guardedFiles.count, 1)
        for url in guardedFiles {
            XCTAssertFalse(try AppSourceGuard.text(at: url).isEmpty, url.lastPathComponent)
        }
    }

    func test_violations_onTaskAtTheRootOfAConditionalGroup_flagsIt() {
        let source = """
        var body: some View {
            Group {
                if offered {
                    Text("x")
                }
            }
            .animation(.default, value: offered)
            .task(id: userId) { await load() }
        }
        """
        XCTAssertEqual(violations(in: source).count, 1)
    }

    func test_violations_onTaskAtTheRootOfAStack_acceptsIt() {
        let source = """
        var body: some View {
            HStack(spacing: 0) {
                if offered {
                    Text("x")
                }
            }
            .task(id: userId) { await load() }
        }
        """
        XCTAssertTrue(violations(in: source).isEmpty)
    }

    func test_talkieViews_neverHangALifecycleModifierOnATransparentGroup() throws {
        for url in guardedFiles {
            let found = violations(in: try AppSourceGuard.text(at: url))
            XCTAssertTrue(found.isEmpty, "\(url.lastPathComponent) — \(found.joined(separator: " ; "))")
        }
    }
}
