import XCTest
@testable import Meeshy

/// **Lot 3A du composer unifié (#4035) — l'état INSPECTEUR (planche P4 §3).**
///
/// Taper un objet de la scène incrustée doit faire paraître ses contrôles
/// juste au-dessus de `toolRow` ; aucune sélection ⇒ la zone reste ABSENTE
/// (loi 4). Cette suite éprouve la SOURCE (même patron que
/// `ComposerDocumentSurfaceMentionMountGuardTests` : R5/R15, suite tournée
/// sans UIKit réel) — trois faits qu'un rendu ne prouverait pas plus vite :
/// 1. `body` monte `sceneInspector` gaté sur non-nil, DIRECTEMENT au-dessus
///    de `toolRow` (pas ailleurs, pas systématiquement) ;
/// 2. `content` relaie `onSceneItemTapped`/`onSceneBackgroundTapped` au
///    canvas incrusté — sans ce relais, la scène n'a aucun moyen de remonter
///    une sélection ;
/// 3. la garde-fou : sans une source non vide, tout ce qui précède serait
///    vert par omission.
final class ComposerDocumentSurfaceSceneInspectorMountGuardTests: XCTestCase {

    private func surfaceSource() throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: surfaceURL(), encoding: .utf8))
    }

    private func surfaceURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
    }

    /// Source COMPACTÉE — tout blanc retiré (même patron que
    /// `MeeshyComposerHostGuardTests.hostCompact`) : une garde qui cherche un
    /// littéral multi-tokens (`onItemTapped: onSceneItemTapped`) ne doit pas
    /// pouvoir être contournée par un simple retour à la ligne ou un espace
    /// en plus.
    private func compact(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    func test_theGuardReadsANonEmptySource() throws {
        let code = try surfaceSource()
        XCTAssertGreaterThan(code.count, 400,
            "La source de la surface est introuvable ou vide — les gardes ci-dessous ne mesureraient RIEN.")
        XCTAssertTrue(code.contains("struct ComposerDocumentSurface"),
            "Le fichier lu n'est pas celui de la surface document.")
    }

    /// Le contrôle n'existe QUE quand une sélection existe (loi 4) : jamais
    /// monté inconditionnellement, jamais un panneau vide.
    func test_body_mountsSceneInspector_gatedOnNonNil() throws {
        let source = try surfaceSource()
        guard let bodyBlock = body(of: "var body: some View {", in: source) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(bodyBlock.contains("if let sceneInspector"),
            "`body` doit gater le montage de la zone contextuelle sur `if let sceneInspector` — la monter "
                + "inconditionnellement afficherait un panneau vide dès que `sceneInspector` est nil.")
    }

    /// « Juste au-dessus de la rangée d'outils » (planche P4 §3) : le bloc
    /// `if let sceneInspector` doit précéder `toolRow` dans le texte de
    /// `body`, sans rien d'autre entre les deux qui la déplacerait ailleurs
    /// à l'écran.
    func test_sceneInspector_isMountedImmediatelyAboveToolRow() throws {
        let source = try surfaceSource()
        guard let bodyBlock = body(of: "var body: some View {", in: source) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        guard let inspectorRange = bodyBlock.range(of: "if let sceneInspector"),
              let toolRowRange = bodyBlock.range(of: "toolRow", range: inspectorRange.upperBound..<bodyBlock.endIndex)
        else {
            return XCTFail("`sceneInspector` doit apparaître AVANT `toolRow` dans `body`.")
        }
        let between = bodyBlock[inspectorRange.upperBound..<toolRowRange.lowerBound]
        XCTAssertFalse(between.contains("mediaStrip"),
            "`mediaStrip` s'intercale entre `sceneInspector` et `toolRow` — la zone contextuelle doit rester "
                + "JUSTE au-dessus de la rangée d'outils.")
        XCTAssertFalse(between.contains("backgroundStrip"),
            "`backgroundStrip` s'intercale entre `sceneInspector` et `toolRow` — la zone contextuelle doit "
                + "rester JUSTE au-dessus de la rangée d'outils.")
    }

    /// Sans ce relais, la scène incrustée n'a aucun moyen de faire remonter
    /// une sélection à l'hôte — `EmbeddedSceneCanvas` transmet
    /// `onItemTapped`/`onBackgroundTapped` depuis le lot 3A, mais seul CE
    /// site les branche à un rappel de `ComposerDocumentSurface`.
    func test_content_forwardsSelectionCallbacks_toTheEmbeddedSceneCanvas() throws {
        let source = try surfaceSource()
        guard let contentBlock = body(of: "private var content: some View {", in: source) else {
            return XCTFail("`content` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(contentBlock.contains("EmbeddedSceneCanvas("),
            "`content` doit continuer de monter `EmbeddedSceneCanvas` (Phase 2, inchangé).")
        let compactContent = compact(contentBlock)
        XCTAssertTrue(compactContent.contains("onItemTapped:onSceneItemTapped"),
            "`EmbeddedSceneCanvas` doit recevoir `onItemTapped: onSceneItemTapped` — sans ce relais, taper "
                + "un objet de la scène ne remonte aucune sélection à l'hôte.")
        XCTAssertTrue(compactContent.contains("onBackgroundTapped:onSceneBackgroundTapped"),
            "`EmbeddedSceneCanvas` doit recevoir `onBackgroundTapped: onSceneBackgroundTapped` — sans ce "
                + "relais, l'hôte n'a aucun moyen d'effacer la sélection.")
    }
}
