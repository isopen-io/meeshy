import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #13918 (R6) — **toucher un objet posé le fait passer au premier plan**, sur
/// le canvas comme dans le modèle du compositeur ; une seule étape d'annulation
/// par toucher, aucune quand l'objet était déjà devant.
@MainActor
final class StoryCanvasTouchBringsToFrontTests: XCTestCase {

    private func effects() -> StoryEffects {
        var effets = StoryEffects()
        effets.locationObjects = [StoryLocationObject(id: "lieu",
                                                      place: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Gare"),
                                                      zIndex: 1)]
        effets.textObjects = [StoryTextObject(id: "texte", text: "salut", zIndex: 0)]
        effets.stickerObjects = [StorySticker(id: "sticker", emoji: "🔥", zIndex: 2)]
        return effets
    }

    private func dessus(_ effets: StoryEffects) -> String? {
        effets.sceneObjects.filter { !$0.isBackground }.last?.id
    }

    // MARK: - Le canvas

    /// Le lieu n'avait pas de branche : le toucher le laissait sous le sticker.
    func test_toucherUnLieu_lePasseDevant() {
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "s", effects: effects()), mode: .edit)
        var ecrit: StorySlide?
        canvas.onItemModified = { ecrit = $0 }

        canvas.bringForegroundToFront(id: "lieu")

        XCTAssertEqual(dessus(canvas.slide.effects), "lieu")
        XCTAssertEqual(ecrit.map { dessus($0.effects) }, "lieu", "la slide écrite remonte à l'hôte")
    }

    /// À rang égal, le texte touché restait sous le sticker du même rang.
    func test_toucherUnTexteAuMemeRangQuUnSticker_lePasseDevant() {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "texte", text: "salut", zIndex: 0)]
        effets.stickerObjects = [StorySticker(id: "sticker", emoji: "🔥", zIndex: 0)]
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "s", effects: effets), mode: .edit)

        canvas.bringForegroundToFront(id: "texte")

        XCTAssertEqual(dessus(canvas.slide.effects), "texte")
    }

    // MARK: - Le modèle du compositeur

    /// Le relais de la sélection écrit la règle dans le modèle : l'historique
    /// en fait UNE étape, qui s'annule et se rétablit.
    func test_leToucherEcritDansLeModele_uneEtapeDAnnulation() throws {
        let vm = StoryComposerViewModel()
        vm.currentEffects = effects()
        vm.seedHistory()

        vm.currentSlide.effects = try XCTUnwrap(vm.currentSlide.effects.broughtToFront("texte"))
        vm.pushHistorySnapshot()

        XCTAssertEqual(dessus(vm.currentEffects), "texte")
        XCTAssertTrue(vm.undoGlobal(), "le toucher s'annule")
        XCTAssertEqual(dessus(vm.currentEffects), "sticker")
        XCTAssertFalse(vm.canUndoGlobal, "une seule étape pour un toucher")
        XCTAssertTrue(vm.redoGlobal(), "et se rétablit")
        XCTAssertEqual(dessus(vm.currentEffects), "texte")
    }

    /// **Le canvas écrit le rang par la slide, sans passer par le modèle** : un
    /// objet posé ensuite doit quand même arriver devant l'objet touché, et non
    /// le rejoindre au même rang.
    func test_unObjetPoseApresUnToucherDuCanvas_arriveDevant() throws {
        let vm = StoryComposerViewModel()
        vm.currentEffects = effects()
        var touchee = vm.currentEffects
        touchee.textObjects[0].zIndex = 9
        vm.currentEffects = touchee

        let neuf = try XCTUnwrap(vm.addText())

        XCTAssertEqual(dessus(vm.currentEffects), neuf.id)
    }
}
