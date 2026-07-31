import XCTest

/// Garde de source : l'alerte de sortie du composer (« Quitter sans
/// publier ? ») doit être présentée via `.confirmationDialog`, jamais via
/// `.alert` — B5 (arbitrage S2, rapport_benchmark.md §1.3.9) : les leaders
/// SOTA (Snapchat/Instagram/TikTok) présentent un choix de sortie via une
/// feuille d'action ancrée bas au moment du geste, jamais une alerte système
/// centrée à 3 boutons.
///
/// `StoryComposerView` n'est pas « hostable » en XCTest (précédent :
/// `StoryComposerView_ShouldShowEmptyStateLargePickerTests.swift`) — la garde
/// s'ancre donc sur le COMPORTEMENT via analyse de source, comme
/// `StoryBackgroundLayerVolumeSourceGuardTests`. Le fichier contient TROIS
/// blocs `.alert(`/`.confirmationDialog(` (sortie, médias perdus, chargement
/// impossible) : un grep global de `.alert(` donnerait un résultat faussé (2
/// occurrences légitimes hors périmètre). L'ancrage se fait donc sur le
/// littéral UNIQUE `"story.composer.quitWithoutPublishing"`, jamais sur le nom
/// de propriété partagé `showDiscardAlert` (qui n'apparaît qu'une fois de
/// toute façon, mais l'ancrage textuel doit rester robuste à un futur
/// deuxième binding sur la même clé). Les commentaires sont retirés avant
/// analyse : la prose qui décrit le fix déclencherait sinon l'alerte
/// elle-même.
final class StoryComposerExitDialogSourceGuardTests: XCTestCase {

    // MARK: - Tests réels (fichier du repo)

    func test_discardAlert_usesConfirmationDialogNotAlert() throws {
        let code = try Self.strippedSource()
        let lines = code.components(separatedBy: "\n")

        guard let modifierLine = Self.precedingModifierLine(lines: lines, anchor: Self.anchor) else {
            XCTFail("Aucun modificateur `.alert(`/`.confirmationDialog(` trouvé avant l'ancre")
            return
        }

        XCTAssertTrue(
            modifierLine.contains(".confirmationDialog("),
            "L'alerte de sortie doit être présentée via `.confirmationDialog(`, trouvé : \(modifierLine)"
        )
        XCTAssertFalse(
            modifierLine.contains(".alert("),
            "L'alerte de sortie ne doit plus utiliser `.alert(` : \(modifierLine)"
        )
    }

    func test_exitDialog_preservesAllThreeActions() throws {
        let code = try Self.strippedSource()
        let lines = code.components(separatedBy: "\n")
        let block = Self.dialogBlock(lines: lines, anchor: Self.anchor)

        for key in ["story.composer.save", "story.composer.quit", "story.composer.cancelAction"] {
            XCTAssertTrue(
                block.contains { $0.contains(key) },
                "La clé localisée \(key) a disparu du bloc de la feuille d'action de sortie"
            )
        }
    }

    func test_saveButton_stillHiddenWhenEditing() throws {
        let code = try Self.strippedSource()
        let lines = code.components(separatedBy: "\n")
        let block = Self.dialogBlock(lines: lines, anchor: Self.anchor)

        guard let saveIndex = block.firstIndex(where: { $0.contains("story.composer.save") }) else {
            XCTFail("Bouton Sauvegarder introuvable dans le bloc")
            return
        }
        let guardPresent = block[..<saveIndex].contains { $0.contains("if !isEditingExistingStory") }

        XCTAssertTrue(
            guardPresent,
            "Le bouton Sauvegarder doit rester derrière `if !isEditingExistingStory`"
        )
    }

    // MARK: - Méta-tests de la garde elle-même

    /// Contrôle positif : sans ce test, une garde cassée (mauvais fichier,
    /// filtre trop large) resterait verte pour toujours et ne protégerait
    /// rien — elle doit réellement détecter le motif banni.
    func test_guardDetectsTheBannedPattern() {
        let sample = """
        struct Fake: View {
            var body: some View {
                Text("x")
                .alert(
                    String(localized: "story.composer.quitWithoutPublishing", defaultValue: "x"),
                    isPresented: $showDiscardAlert
                ) { EmptyView() }
            }
        }
        """
        let lines = sample.components(separatedBy: "\n")
        let modifierLine = Self.precedingModifierLine(lines: lines, anchor: Self.anchor)

        XCTAssertEqual(modifierLine?.contains(".alert("), true)
        XCTAssertEqual(modifierLine?.contains(".confirmationDialog("), false)
    }

    /// Contrôle négatif : la forme correcte ne doit pas déclencher l'alerte.
    func test_guardAcceptsTheCorrectForm() {
        let sample = """
        struct Fake: View {
            var body: some View {
                Text("x")
                .confirmationDialog(
                    String(localized: "story.composer.quitWithoutPublishing", defaultValue: "x"),
                    isPresented: $showDiscardAlert,
                    titleVisibility: .visible
                ) { EmptyView() }
            }
        }
        """
        let lines = sample.components(separatedBy: "\n")
        let modifierLine = Self.precedingModifierLine(lines: lines, anchor: Self.anchor)

        XCTAssertEqual(modifierLine?.contains(".confirmationDialog("), true)
        XCTAssertEqual(modifierLine?.contains(".alert("), false)
    }

    // MARK: - Helpers

    private static let anchor = "story.composer.quitWithoutPublishing"

    /// Racine du package : le fichier vit dans `Tests/MeeshyUITests/Story/`,
    /// il faut donc remonter QUATRE niveaux avant de redescendre dans `Sources`.
    private static var composerSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView.swift")
    }

    private static func strippedSource() throws -> String {
        let source = try String(contentsOf: composerSourceURL, encoding: .utf8)
        return strippingLineComments(source)
    }

    private static func strippingLineComments(_ source: String) -> String {
        source
            .components(separatedBy: "\n")
            .map { line -> String in
                guard let range = line.range(of: "//") else { return line }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// Remonte depuis la ligne portant `anchor` jusqu'au premier modificateur
    /// `.alert(`/`.confirmationDialog(` de chaîne SwiftUI rencontré — la
    /// forme réelle du fichier place toujours ce modificateur à quelques
    /// lignes au-dessus de l'argument titre littéral.
    private static func precedingModifierLine(lines: [String], anchor: String) -> String? {
        guard let anchorIndex = lines.firstIndex(where: { $0.contains(anchor) }) else { return nil }
        var i = anchorIndex
        while i >= 0 {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix(".confirmationDialog(") || trimmed.hasPrefix(".alert(") {
                return lines[i]
            }
            i -= 1
        }
        return nil
    }

    /// Bloc de lignes couvrant l'ANCRE jusqu'au modificateur top-level
    /// suivant (`.alert(` du bloc « médias perdus »), utilisé pour vérifier
    /// le contenu du corps du dialogue sans dépendre d'un compte de lignes
    /// fixe (fragile si le fichier bouge).
    private static func dialogBlock(lines: [String], anchor: String) -> [String] {
        guard let anchorIndex = lines.firstIndex(where: { $0.contains(anchor) }) else { return [] }
        guard let modifierStart = (0...anchorIndex).reversed().first(where: { i in
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            return trimmed.hasPrefix(".confirmationDialog(") || trimmed.hasPrefix(".alert(")
        }) else { return [] }

        let nextModifierIndex = lines[(anchorIndex + 1)...].firstIndex { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            return trimmed.hasPrefix(".alert(") || trimmed.hasPrefix(".confirmationDialog(")
        }
        let end = nextModifierIndex ?? lines.count
        return Array(lines[modifierStart..<end])
    }
}
