import Testing
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Le composer de story porte les quatre modes. PINNED — et lui seul — pose un
/// badge sur le canevas ; les trois autres n'existent que dans `references`,
/// que la publication déclare.
@MainActor
struct StoryComposerReferencesTests {

    @Test func test_addReference_pinned_posesABadgeCarryingTheUserId() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))

        let badges = vm.currentEffects.textObjects.filter { $0.referenceUserId != nil }
        #expect(badges.count == 1)
        #expect(badges[0].text == "@alice")
        #expect(badges[0].referenceUserId == "u-a")
    }

    @Test func test_addReference_note_posesNoBadge() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .note))

        #expect(vm.currentEffects.textObjects.isEmpty)
        #expect(vm.references.map(\.display) == [.note])
    }

    @Test func test_addReference_silent_posesNoBadge() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .silent))

        #expect(vm.currentEffects.textObjects.isEmpty)
        #expect(vm.references.map(\.display) == [.silent])
    }

    @Test func test_changingFromPinnedToNote_removesTheBadge() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .note))

        #expect(vm.currentEffects.textObjects.filter { $0.referenceUserId != nil }.isEmpty)
        #expect(vm.references.count == 1)
        #expect(vm.references[0].display == .note)
    }

    @Test func test_removingReference_removesItsBadgeToo() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))
        vm.removeReference(username: "alice")

        #expect(vm.currentEffects.textObjects.isEmpty)
        #expect(vm.references.isEmpty)
    }

    @Test func test_deletingTheBadgeOnCanvas_dropsTheReference() {
        // L'auteur supprime la pastille au doigt : la référence doit partir
        // avec elle, sinon il notifie quelqu'un dont plus rien ne témoigne.
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))
        let badgeId = vm.currentEffects.textObjects[0].id

        vm.deleteElement(id: badgeId)

        #expect(vm.references.isEmpty)
    }

    @Test func test_deletingAPlainTextObject_leavesTheReferencesAlone() {
        // Un objet texte ordinaire ne porte AUCUNE référence : le supprimer ne
        // doit pas emporter les références déclarées par ailleurs.
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .note))
        guard let text = vm.addText() else {
            Issue.record("addText() n'a rien posé")
            return
        }

        vm.deleteElement(id: text.id)

        #expect(vm.references.map(\.username) == ["alice"])
    }
}

/// Un badge est un `StoryTextObject` ordinaire : l'auteur peut le retoucher au
/// doigt, comme n'importe quelle étiquette. Le lien entre la pastille et la
/// référence doit donc tenir à `referenceUserId` — la seule chose qu'une
/// retouche ne touche pas — et jamais au texte affiché.
@MainActor
struct StoryComposerEditedBadgeTests {

    private func composerWithEditedBadge() -> StoryComposerViewModel {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))
        vm.currentEffects.textObjects[0].text = "@Alice ❤️"
        return vm
    }

    @Test func test_removeReference_afterTheBadgeTextWasEdited_stillRemovesTheBadge() {
        let vm = composerWithEditedBadge()

        vm.removeReference(username: "alice")

        #expect(vm.currentEffects.textObjects.isEmpty)
        #expect(vm.references.isEmpty)
    }

    @Test func test_changingFromPinnedToNote_afterTheBadgeTextWasEdited_removesTheBadge() {
        // Sinon la pastille orpheline survit à la publication, et la règle
        // d'union du canevas la redéclare PINNED : le mode choisi par l'auteur
        // serait silencieusement annulé.
        let vm = composerWithEditedBadge()

        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .note))

        #expect(vm.currentEffects.textObjects.filter { $0.referenceUserId != nil }.isEmpty)
        #expect(vm.references.map(\.display) == [.note])
    }

    @Test func test_deletingAnEditedBadge_dropsTheReference() {
        let vm = composerWithEditedBadge()
        let badgeId = vm.currentEffects.textObjects[0].id

        vm.deleteElement(id: badgeId)

        #expect(vm.references.isEmpty)
    }
}

/// L'édition ne remplace l'ensemble déclaré QUE si elle le connaît en entier.
///
/// Les charges utiles de LISTE l'amputent — le select du feed écarte les
/// silencieuses — et republier un jeu amputé les révoquerait sans que l'auteur
/// les ait seulement vues.
@MainActor
struct StoryComposerDeclaredReferencesTests {

    private func editingComposer() -> StoryComposerViewModel {
        StoryComposerViewModel(editing: StoryItem(
            id: "post-1",
            content: "Hier soir",
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(3600),
            mentions: [
                PostReference(userId: "u-a", username: "alice", display: .note),
                PostReference(userId: "u-b", username: "bob", display: .inline)
            ]
        ))
    }

    @Test func test_editing_showsTheServedReferences_butDoesNotClaimToKnowThemAll() {
        let vm = editingComposer()

        // Affichées tout de suite — l'auteur voit ce que la story porte.
        #expect(vm.references.map(\.username) == ["alice"])
        // Mais le drapeau reste BAS : ce jeu-là n'a pas les silencieuses.
        #expect(vm.editingKnowsDeclaredReferences == false)
    }

    @Test func test_editing_dropsTheInlineOnes_becauseTheTextCarriesThem() {
        #expect(editingComposer().references.contains { $0.username == "bob" } == false)
    }

    @Test func test_adoptDeclaredReferences_isWhatLetsTheEditReplaceTheSet() {
        let vm = editingComposer()

        vm.adoptDeclaredReferences([
            PostReference(userId: "u-a", username: "alice", display: .note),
            PostReference(userId: "u-c", username: "carol", display: .silent)
        ])

        #expect(vm.references.map(\.username) == ["alice", "carol"])
        #expect(vm.references.map(\.display) == [.note, .silent])
        #expect(vm.editingKnowsDeclaredReferences)
    }
}
