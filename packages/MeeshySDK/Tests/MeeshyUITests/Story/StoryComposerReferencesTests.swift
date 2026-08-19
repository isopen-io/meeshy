import Testing
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
