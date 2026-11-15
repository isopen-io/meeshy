import XCTest
@testable import Meeshy

/// **Chaque maillon de la chaîne du composer est une frontière NOMINALE.**
///
/// ## Le défaut, et ce qui le fermait mal
///
/// `ConversationView.themedComposer` empilait ~13 modificateurs système sur UN
/// seul `some View`. Chaque modificateur ajoute un niveau de générique
/// `ModifiedContent<…>` distinct ; à la profondeur atteinte, la résolution
/// runtime du type opaque (`swift_getTypeByMangledName`, récursive à ~17 Ko de
/// pile par niveau) dépassait les 1008 Ko du thread principal (device iPhone 16
/// Pro Max, 2026-09-03, atteint depuis `ConversationFirstRenderWarmup`).
///
/// > DÉCOUPER DES PROPRIÉTÉS NE DÉCOUPE PAS LE TYPE. Quatre maillons-fonctions
/// > `(AnyView) -> AnyView` bornaient la profondeur mais détruisaient l'identité
/// > de la vue à chaque rendu. Une struct `ViewModifier` obtient son PROPRE nœud
/// > d'attribut et son nom remplace tout le sous-arbre dans les mangled names :
/// > elle borne la profondeur sans effacer l'identité.
///
/// Cette garde est une garde de SOURCE parce que la grandeur qu'elle protège est
/// une SIGNATURE. Elle ne remplace pas la vérification sur appareil réel : le
/// simulateur a 8 Mo de pile contre 1008 Ko sur device.
final class ConversationComposerChainErasureSourceGuardTests: XCTestCase {

    /// L'unité de l'écran : la vue, ses extensions, et `ConversationLayers/`.
    private static let chainPath = AppSourceGuard.conversationViewPath

    /// Les maillons de la chaîne, dans l'ordre où `themedComposer` les compose.
    private static let modifierLinks = [
        "ConversationComposerPickers",
        "ConversationComposerGuestSheet",
        "ConversationComposerStickerSheet",
        "ConversationComposerEditingCovers",
    ]

    private func chainSource() throws -> String {
        let source = try AppSourceGuard.unit(Self.chainPath)
        XCTAssertFalse(source.isEmpty, "Source de la chaîne du composer introuvable")
        return AppSourceGuard.stripComments(source)
    }

    func test_themedComposer_estUneVueOpaqueSansEffacement() throws {
        let source = try chainSource()
        XCTAssertTrue(source.contains("var themedComposer: some View"))
        XCTAssertFalse(source.contains("var themedComposer: AnyView"),
                       "`themedComposer` ne se déclare plus effacée : ses maillons sont nominaux.")
    }

    func test_chaqueMaillon_estUneStructNominale() throws {
        let source = try chainSource()
        XCTAssertTrue(source.contains("struct ConversationComposerCore: View"),
                      "le coeur du composeur est une vue nominale")
        for link in Self.modifierLinks {
            XCTAssertTrue(
                source.contains("struct \(link): ViewModifier"),
                "Le maillon `\(link)` doit être une `struct … : ViewModifier` : une propriété calculée `some View` se niche dans le type de son appelant."
            )
            XCTAssertFalse(
                source.contains("var \(link):") || source.contains("func \(link)("),
                "Le maillon `\(link)` est redevenu une propriété ou une fonction — le type composé se reforme dans le getter de `themedComposer`."
            )
        }
    }

    func test_themedComposer_composeLesMaillonsDansLOrdre() throws {
        let source = try chainSource()
        guard let start = source.range(of: "var themedComposer: some View") else {
            XCTFail("themedComposer introuvable"); return
        }
        var cursor = start.upperBound
        for link in ["ConversationComposerCore("] + Self.modifierLinks.map({ ".modifier(\($0)(" }) {
            guard let found = source.range(of: link, range: cursor..<source.endIndex) else {
                XCTFail("`\(link)` doit être posé dans `themedComposer`, dans l'ordre de la chaîne.")
                return
            }
            cursor = found.upperBound
        }
    }

    func test_aucunMaillon_nEstUneFonctionSurAnyView() throws {
        let source = try chainSource()
        XCTAssertFalse(source.contains("_ content: AnyView"),
                       "un maillon `(AnyView) -> AnyView` détruit l'identité de la vue à chaque rendu.")
    }

    func test_composerCore_nePossedeQueLesAbonnesDuVumetreEtDuTexte() throws {
        let core = try chainSource()
        XCTAssertTrue(core.contains("ComposerAudioHost(recorder: recorder)"))
        XCTAssertTrue(core.contains("ComposerTextHost(model: composerText)"))
    }
}
