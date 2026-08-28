import XCTest
@testable import Meeshy

/// **Lot 3A du composer unifié (#4035) — le meuble retient la sélection sur
/// la scène incrustée et monte la zone contextuelle sans jamais dupliquer le
/// modèle.**
///
/// Suite de gardes de SOURCE, même patron que `MeeshyComposerHostGuardTests` :
/// ce que ces règles protègent est une STRUCTURE de câblage (« le meuble ne
/// possède que l'IDENTITÉ de la sélection », « l'inspecteur partage le MÊME
/// `viewModel` ») sans sortie observable qu'un test unitaire de rendu
/// pourrait lire plus vite.
final class MeeshyComposerHostSceneInspectorGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_theGuardReadsANonEmptySource() throws {
        let code = try hostSource()
        XCTAssertGreaterThan(code.count, 400,
            "La source du host est introuvable ou vide — les gardes ci-dessous ne mesureraient RIEN.")
        XCTAssertTrue(code.contains("struct MeeshyComposerHost"),
            "Le fichier lu n'est pas celui du host.")
    }

    /// Le meuble décide QUE de l'absence/présence de la zone — jamais du
    /// contenu qu'elle montre (`EmbeddedSceneInspector` le lit sur le MÊME
    /// `viewModel`).
    func test_documentSurface_gatesSceneInspector_onTheRetainedSelection() throws {
        let code = try hostSource()
        let compacted = compact(code)
        XCTAssertTrue(
            compacted.contains("sceneInspector:!documentHasScene?nil:EmbeddedSceneInspector(viewModel:viewModel,kind:selectedSceneItemKind).map{AnyView($0)}"),
            "`documentSurface` doit gater `sceneInspector` sur la présence de la scène ET déléguer le "
                + "reste à l'`init?` de `EmbeddedSceneInspector(viewModel:kind:)` — le MÊME modèle que "
                + "l'atelier, et une loi 4 que le meuble ne PEUT pas enfreindre (l'init échoue pour tout "
                + "kind qu'aucun contrôle ne sert)."
        )
        XCTAssertFalse(compacted.contains("AnyView(EmbeddedSceneInspector(viewModel:viewModel))"),
            "Le meuble monte `EmbeddedSceneInspector` SANS son `kind` : la zone servirait les contrôles "
                + "d'un média sous une sélection de texte — « les contrôles de l'objet courant, EUX SEULS » "
                + "(planche P4 §3).")
    }

    /// Sans ces deux rappels, `ComposerDocumentSurface` n'a aucun moyen de
    /// signaler une sélection au meuble — la zone resterait pour toujours
    /// absente, quel que soit ce que l'utilisateur tape sur la scène.
    func test_documentSurface_wiresSceneSelectionCallbacks() throws {
        let code = try hostSource()
        let compacted = compact(code)
        XCTAssertTrue(compacted.contains("onSceneItemTapped:{_,kindinselectedSceneItemKind=kind}"),
            "`onSceneItemTapped` doit retenir le KIND de la sélection — c'est lui qui décide QUELS "
                + "contrôles s'appliquent ; retenir l'id seul ne le dirait pas.")
        // **Repointée au #4035.** Elle épinglait `{selectedSceneItemKind=nil}` —
        // « le tap sur le fond EFFACE ». C'était juste, et c'était aussi ce qui
        // rendait l'inspecteur INATTEIGNABLE : en Post, la règle 4 fait du seul
        // média de la slide son FOND, et le hit-test du canvas n'itère que le
        // conteneur des OBJETS. Le geste réel de l'utilisateur tombait donc
        // toujours sur l'effacement.
        //
        // Le rappel passe désormais par une RÈGLE nommée, éprouvée à part
        // (`ComposerSceneBackgroundTapPolicyTests`) : effacer reste ce qu'elle
        // rend dans trois cas sur quatre, mais ce n'est plus une constante
        // écrite dans un `body`, où aucun test ne pouvait la lire.
        XCTAssertTrue(compacted.contains("onSceneBackgroundTapped:{handleSceneBackgroundTap()}"),
            "`onSceneBackgroundTapped` doit passer par la RÈGLE — un littéral écrit ici serait "
                + "invisible aux tests, et c'est exactement ce qui a laissé l'inspecteur inatteignable.")
        XCTAssertTrue(compacted.contains("ComposerSceneBackgroundTapPolicy.selection("),
            "…et le meuble doit APPELER la règle, pas en réécrire une seconde copie.")
    }
}
