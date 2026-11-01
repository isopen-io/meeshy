import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Annuler puis Rétablir redonne l'état exact, famille par famille** (#14208).
///
/// Les témoins n'appellent PAS `pushHistorySnapshot()` entre l'action et
/// l'annulation : le doigt qui touche ↶ juste après une action n'attend pas la
/// capture débouncée. Annuler doit défaire CETTE action, jamais la précédente.
@MainActor
final class StoryComposerHistoryFamiliesTests: XCTestCase {

    private func composer(media: Bool = false) -> StoryComposerViewModel {
        let vm = StoryComposerViewModel()
        var effects = vm.currentEffects
        effects.textObjects = [StoryTextObject(id: "t", text: "Bonjour", x: 0.5, y: 0.5)]
        if media {
            effects.mediaObjects = [StoryMediaObject(id: "m", mediaType: "image", aspectRatio: 1, zIndex: 1)]
        }
        vm.currentEffects = effects
        vm.seedHistory()
        return vm
    }

    private func etat(_ vm: StoryComposerViewModel) -> Data? {
        StoryComposerViewModel.encodeHistorySnapshot(vm.slides)
    }

    private func allerRetour(media: Bool = false, file: StaticString = #filePath, line: UInt = #line,
                             _ action: (StoryComposerViewModel) -> Void) {
        let vm = composer(media: media)
        let avant = etat(vm)
        action(vm)
        let apres = etat(vm)
        XCTAssertNotEqual(avant, apres, "l'action doit changer le document", file: file, line: line)
        XCTAssertTrue(vm.canUndoGlobal, "↶ paraît dès l'action", file: file, line: line)
        XCTAssertTrue(vm.undoGlobal(), file: file, line: line)
        XCTAssertEqual(etat(vm), avant, "annuler redonne l'état d'avant", file: file, line: line)
        XCTAssertFalse(vm.canUndoGlobal, "rien d'autre à annuler", file: file, line: line)
        XCTAssertTrue(vm.canRedoGlobal, file: file, line: line)
        XCTAssertTrue(vm.redoGlobal(), file: file, line: line)
        XCTAssertEqual(etat(vm), apres, "rétablir redonne l'état d'après", file: file, line: line)
        XCTAssertFalse(vm.canRedoGlobal, file: file, line: line)
    }

    private func modifierTexte(_ vm: StoryComposerViewModel, _ change: (inout StoryTextObject) -> Void) {
        var effects = vm.currentEffects
        change(&effects.textObjects[0])
        vm.currentEffects = effects
    }

    private func modifierMedia(_ vm: StoryComposerViewModel, _ change: (inout StoryMediaObject) -> Void) {
        var effects = vm.currentEffects
        var medias = effects.mediaObjects ?? []
        change(&medias[0])
        effects.mediaObjects = medias
        vm.currentEffects = effects
    }

    // MARK: - Familles

    func test_ajout() { allerRetour { _ = $0.addText() } }
    func test_suppression() { allerRetour { $0.deleteElement(id: "t") } }
    func test_deplacement() { allerRetour { vm in self.modifierTexte(vm) { $0.x = 0.2; $0.y = 0.8 } } }
    func test_redimensionnement() { allerRetour { vm in self.modifierTexte(vm) { $0.scale = 2.4 } } }
    func test_rotation() { allerRetour { vm in self.modifierTexte(vm) { $0.rotation = 35 } } }
    func test_premierPlan() {
        allerRetour(media: true) { vm in
            if let devant = vm.currentEffects.broughtToFront("t") { vm.currentEffects = devant }
        }
    }
    func test_texte() { allerRetour { vm in self.modifierTexte(vm) { $0.text = "Bonsoir" } } }
    func test_style() {
        allerRetour { vm in self.modifierTexte(vm) { $0.textColor = "FF0000"; $0.fontSize = 140; $0.textStyle = "neon" } }
    }
    func test_filtre() { allerRetour(media: true) { vm in self.modifierMedia(vm) { $0.filter = "noir" } } }
    func test_coupe() {
        allerRetour(media: true) { vm in
            self.modifierMedia(vm) { $0.crop = MediaCropRect(x: 0.1, y: 0.1, width: 0.5, height: 0.5) }
        }
    }
    func test_son() {
        allerRetour { vm in
            var effects = vm.currentEffects
            effects.audioPlayerObjects = [StoryAudioPlayerObject(id: "a", postMediaId: "p")]
            vm.currentEffects = effects
        }
    }
    func test_fond() { allerRetour { $0.applyBackground(hex: "#123456") } }
    func test_diapoAjoutee() { allerRetour { $0.addSlide() } }
    func test_diapoSupprimee() {
        let vm = composer()
        vm.addSlide()
        vm.pushHistorySnapshot()
        let avant = etat(vm)
        vm.removeSlide(at: 1)
        let apres = etat(vm)
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertEqual(etat(vm), avant)
        XCTAssertTrue(vm.redoGlobal())
        XCTAssertEqual(etat(vm), apres)
    }
    func test_diapoReordonnee() {
        let vm = composer()
        vm.addSlide()
        vm.pushHistorySnapshot()
        let avant = etat(vm)
        vm.moveSlide(from: 0, to: 2)
        let apres = etat(vm)
        XCTAssertNotEqual(avant, apres)
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertEqual(etat(vm), avant)
        XCTAssertTrue(vm.redoGlobal())
        XCTAssertEqual(etat(vm), apres)
    }
    func test_reglages() {
        allerRetour { $0.setSlideTransitions(opening: .fade, closing: .zoom) }
    }

    // MARK: - Ce qui voyage à côté du document

    func test_annulerUneTransition_remetLesMiroirsDuCarrousel() {
        let vm = composer()
        vm.setSlideTransitions(opening: .fade, closing: .zoom)
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertNil(vm.openingEffect)
        XCTAssertNil(vm.closingEffect)
        XCTAssertTrue(vm.redoGlobal())
        XCTAssertEqual(vm.openingEffect, .fade)
        XCTAssertEqual(vm.closingEffect, .zoom)
    }

    // MARK: - Un geste = un pas

    func test_unGesteContinu_compteUnSeulPas() {
        let vm = composer()
        let avant = etat(vm)
        NotificationCenter.default.post(name: .storyCanvasManipulationDidChange, object: nil,
                                        userInfo: [StoryCanvasManipulation.activeKey: true])
        for x in stride(from: 0.5, to: 0.9, by: 0.1) {
            modifierTexte(vm) { $0.x = x }
            vm.pushHistorySnapshot()
        }
        NotificationCenter.default.post(name: .storyCanvasManipulationDidChange, object: nil,
                                        userInfo: [StoryCanvasManipulation.activeKey: false])
        XCTAssertTrue(vm.canUndoGlobal)
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertEqual(etat(vm), avant, "un seul annuler défait tout le glissé")
        XCTAssertFalse(vm.canUndoGlobal)
    }

    // MARK: - Une nouvelle action efface la branche de rétablissement

    func test_nouvelleAction_effaceLaBrancheDeRetablissement() {
        let vm = composer()
        modifierTexte(vm) { $0.text = "Un" }
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertTrue(vm.canRedoGlobal)
        modifierTexte(vm) { $0.text = "Deux" }
        XCTAssertFalse(vm.canRedoGlobal, "↷ disparaît dès la nouvelle action")
        XCTAssertFalse(vm.redoGlobal())
        XCTAssertEqual(vm.currentEffects.textObjects.first?.text, "Deux")
    }

    // MARK: - Jusqu'au bout de l'historique

    /// Chaque `pushHistorySnapshot()` tient la place de la capture débouncée qui
    /// part entre deux actions ; la dernière n'est pas capturée avant ↶.

    func test_plusieursPas_annulesPuisRetablisJusquAuBout() {
        let vm = composer()
        let e0 = etat(vm)
        modifierTexte(vm) { $0.text = "A" }
        vm.pushHistorySnapshot()
        let e1 = etat(vm)
        modifierTexte(vm) { $0.x = 0.1 }
        vm.pushHistorySnapshot()
        let e2 = etat(vm)
        _ = vm.addText()
        let e3 = etat(vm)
        XCTAssertTrue(vm.undoGlobal()); XCTAssertEqual(etat(vm), e2)
        XCTAssertTrue(vm.undoGlobal()); XCTAssertEqual(etat(vm), e1)
        XCTAssertTrue(vm.undoGlobal()); XCTAssertEqual(etat(vm), e0)
        XCTAssertFalse(vm.undoGlobal())
        XCTAssertTrue(vm.redoGlobal()); XCTAssertEqual(etat(vm), e1)
        XCTAssertTrue(vm.redoGlobal()); XCTAssertEqual(etat(vm), e2)
        XCTAssertTrue(vm.redoGlobal()); XCTAssertEqual(etat(vm), e3)
        XCTAssertFalse(vm.redoGlobal())
    }
}
