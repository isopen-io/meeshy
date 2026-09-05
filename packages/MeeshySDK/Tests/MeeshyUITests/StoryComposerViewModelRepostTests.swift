import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryComposerViewModelRepostTests: XCTestCase {

    // MARK: - Tests

    func test_init_reposting_clonesActiveSlideOnly() {
        let story = makeStoryItem(id: "slide-1", content: "Hello")
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertEqual(vm.slides[0].content, "Hello")
        XCTAssertNotEqual(vm.slides[0].id, "slide-1", "Cloned slide must have a fresh ID")
    }

    func test_init_reposting_addsLockedBadgeAtBottomCenter() {
        let story = makeStoryItem()
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")

        let texts = vm.currentEffects.textObjects
        let lockedBadges = texts.filter { $0.isLocked == true }
        XCTAssertEqual(lockedBadges.count, 1)
        let badge = lockedBadges[0]
        // La position se LIT de la règle, jamais d'un littéral recopié : depuis
        // que la pastille se déplace au doigt (directive porteur 2026-09-01),
        // ce couple est un DÉFAUT, et un témoin qui le fige en dur rougirait au
        // premier réglage de ce défaut sans qu'aucun comportement ait changé.
        XCTAssertEqual(badge.y, StoryRepostCredit.defaultY, accuracy: 0.001)
        XCTAssertEqual(badge.x, StoryRepostCredit.defaultX, accuracy: 0.001)
        XCTAssertTrue(badge.text.contains("@alice"))
    }

    /// **Le témoin de la directive du 2026-09-01, au niveau du ViewModel.**
    ///
    /// > « on doit afficher le chip de crédit uniquement si la story originale
    /// > était publique […] on n'a plus besoin de ce chip en bas si la story
    /// > n'était pas publique ou communautaire »
    ///
    /// `StoryRepostCreditTests` éprouve la RÈGLE ; celui-ci prouve qu'elle est
    /// APPLIQUÉE par le seul site qui construit un composer de republication —
    /// une règle juste qu'aucun chemin n'appelle ne crédite personne.
    func test_init_reposting_uneStoryNONPUBLIQUE_neReçoitAucunCrédit() {
        for restreinte in ["PRIVATE", "FRIENDS", "COMMUNITY"] {
            let story = makeStoryItem(visibility: restreinte)
            let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
            XCTAssertTrue(
                vm.currentEffects.textObjects.filter { $0.isLocked == true }.isEmpty,
                "« \(restreinte) » ne doit poser aucune pastille : le lecteur porte déjà son "
                    + "indicateur de republication, et nommer un auteur devant un public que son "
                    + "original n'avait pas est le défaut que la directive ferme."
            )
        }
    }

    /// **Le RETRAIT des crédits hérités est inconditionnel.** Republier une
    /// republication publique vers une audience restreinte garderait sinon la
    /// signature qu'on vient de juger indue — le cas neuf, que l'ancien code ne
    /// pouvait pas produire puisqu'il ajoutait toujours.
    func test_init_reposting_versUneAudienceRESTREINTE_retireLeCréditHÉRITÉ() {
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(id: "herite", text: "Reposté de @racine", isLocked: true)
        ]
        let story = makeStoryItem(storyEffects: effects, visibility: "FRIENDS")
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertTrue(vm.currentEffects.textObjects.filter { $0.isLocked == true }.isEmpty,
                      "le crédit hérité doit partir avec le reste")
    }

    func test_init_reposting_repostOfRepost_doesNotStackAttributionBadges() {
        // Source story is ITSELF a repost: ses effects portent déjà un badge
        // d'attribution verrouillé ("Reposté de @alice", persisté en base car
        // sanitizedForServerPublish ne strip pas les text objects locked).
        // Reposter ce repost ne doit PAS empiler un 2e badge au même point
        // (x:0.5, y:0.92) — un seul badge, attribuant à la source immédiate.
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(
                id: "stale-badge",
                text: "Reposté de @alice",
                x: 0.5, y: 0.92,
                scale: 1.0, rotation: 0,
                fontSize: 14,
                textStyle: "bold",
                textColor: "FFFFFF",
                textAlign: "center",
                textBg: "6366F1",
                isLocked: true
            )
        ]
        let source = makeStoryItem(id: "repost-of-alice", storyEffects: effects)
        let vm = StoryComposerViewModel(reposting: source, authorHandle: "bob")

        let lockedBadges = vm.currentEffects.textObjects.filter { $0.isLocked == true }
        XCTAssertEqual(lockedBadges.count, 1, "Reposting a repost must not stack attribution badges")
        XCTAssertTrue(lockedBadges[0].text.contains("@bob"), "Le badge attribue à la source immédiate")
        XCTAssertFalse(
            vm.currentEffects.textObjects.contains { $0.text.contains("@alice") },
            "Le badge @alice obsolète doit être strippé"
        )
    }

    func test_init_reposting_preservesNonLockedTextObjects() {
        // Les text objects ÉDITABLES de la source (légende de l'auteur) doivent
        // survivre à l'import — seul le badge verrouillé est remplacé.
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(id: "caption", text: "Mon texte", x: 0.5, y: 0.3,
                            scale: 1.0, rotation: 0, fontSize: 18, textStyle: "regular",
                            textColor: "FFFFFF", textAlign: "center", textBg: nil, isLocked: nil),
            StoryTextObject(id: "stale-badge", text: "Reposté de @alice", x: 0.5, y: 0.92,
                            scale: 1.0, rotation: 0, fontSize: 14, textStyle: "bold",
                            textColor: "FFFFFF", textAlign: "center", textBg: "6366F1", isLocked: true)
        ]
        let source = makeStoryItem(id: "repost-of-alice", storyEffects: effects)
        let vm = StoryComposerViewModel(reposting: source, authorHandle: "bob")

        XCTAssertTrue(
            vm.currentEffects.textObjects.contains { $0.text == "Mon texte" && $0.isLocked != true },
            "La légende éditable de la source doit être préservée"
        )
        XCTAssertEqual(vm.currentEffects.textObjects.filter { $0.isLocked == true }.count, 1)
    }

    func test_init_reposting_propagatesIds_rootCase() {
        let story = makeStoryItem(id: "root-1", repostOfId: nil, originalRepostOfId: nil)
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.repostOfId, "root-1")
        XCTAssertEqual(vm.originalRepostOfId, "root-1")
    }

    func test_init_reposting_propagatesIds_chainedCase() {
        let story = makeStoryItem(
            id: "intermediate-1",
            repostOfId: "root-1",
            originalRepostOfId: "root-1"
        )
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.repostOfId, "intermediate-1")
        XCTAssertEqual(vm.originalRepostOfId, "root-1")
    }

    func test_init_reposting_preloadTaskCancelsOnDeinit() async {
        var vm: StoryComposerViewModel? = StoryComposerViewModel(
            reposting: makeStoryItemWithMedia(),
            authorHandle: "alice"
        )
        weak var weakVM = vm
        vm = nil
        await Task.yield()
        XCTAssertNil(weakVM, "VM must be deallocated, preload Task must release self")
    }

    // MARK: - Factories

    private func makeStoryItem(
        id: String = "story-x",
        content: String? = "Hello",
        repostOfId: String? = nil,
        originalRepostOfId: String? = nil,
        media: [FeedMedia] = [],
        storyEffects: StoryEffects? = nil,
        visibility: String = "PUBLIC"
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: media,
            storyEffects: storyEffects,
            createdAt: Date(),
            expiresAt: nil,
            repostOfId: repostOfId,
            originalRepostOfId: originalRepostOfId,
            visibility: visibility,
            isViewed: false
        )
    }

    private func makeStoryItemWithMedia() -> StoryItem {
        let media = FeedMedia(
            id: "m1",
            type: .image,
            url: "/api/v1/attachments/file/test.jpg"
        )
        return makeStoryItem(id: "story-with-media", media: [media])
    }
}
