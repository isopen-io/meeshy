import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// Un POST, un REEL ou un STATUS n'a AUCUNE couche de positionnement sur ses
/// médias : l'option « badge » y est masquée tant que la convergence des
/// composers ne leur aura pas donné de canevas.
@MainActor
struct UnifiedPostComposerReferencesTests {

    @Test func test_declarableModes_forAContentWithoutCanvas_excludePinned() {
        // Proposer un badge là où rien ne peut l'afficher promettrait un mode
        // invisible. L'option revient à la convergence des composers.
        #expect(UnifiedPostComposer.modes(forCanvas: false) == [.note, .silent])
    }

    @Test func test_declarableModes_forAContentWithCanvas_includePinned() {
        #expect(UnifiedPostComposer.modes(forCanvas: true) == [.pinned, .note, .silent])
    }

    @Test func test_textListMenu_offersInsertionFirst_thenTheModesTheContentCanShow() {
        // Depuis la liste `@`, le menu propose EN PLUS « insérer dans le
        // texte » : c'est ce que le tap fait déjà, et le nommer est ce qui
        // rend le reste du menu compréhensible.
        #expect(UnifiedPostComposer.textListModes == [.inline, .note, .silent])
    }

    @Test func test_choosingNote_fromTheTextList_stripsTheHandle() {
        let stripped = ComposerReferences.removingHandle("alice", from: "Soirée avec @alice")
        #expect(stripped == "Soirée avec")
    }
}
