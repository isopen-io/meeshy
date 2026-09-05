import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le verbe de déplacement qui manquait au SDK** (#5018).
///
/// Le SDK expose un vocabulaire de verbes et garde son état — `currentEffects`
/// est `public internal(set)`. Aucun verbe ne disait « pose cet objet là », et
/// l'absence était masquée par `beginDrag`/`updateDrag`/`endDrag`, qui ne
/// portent qu'un état éphémère : `endDrag()` remet `activeDrag` à `nil` sans
/// rien commiter. Ces témoins tiennent le verbe ET cette distinction.
@MainActor
final class StoryComposerViewModelPlacementTests: XCTestCase {

    private func composer(with build: (inout StoryEffects) -> Void) -> StoryComposerViewModel {
        let vm = StoryComposerViewModel()
        var effets = StoryEffects()
        build(&effets)
        vm.currentEffects = effets
        return vm
    }

    private func audio(_ id: String) -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.id = id
        return son
    }

    func test_moveElement_placesAnAudioObject() {
        let vm = composer { $0.audioPlayerObjects = [audio("a1")] }
        vm.moveElement(id: "a1", to: CGPoint(x: 0.2, y: 0.8))
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.first?.x ?? -1, 0.2, accuracy: 0.0001)
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.first?.y ?? -1, 0.8, accuracy: 0.0001)
    }

    func test_moveElement_placesATextObject_soTheVerbIsNotAudioOnly() {
        let vm = composer { $0.textObjects = [StoryTextObject(id: "t1", text: "salut")] }
        vm.moveElement(id: "t1", to: CGPoint(x: 0.9, y: 0.1))
        XCTAssertEqual(vm.currentEffects.textObjects.first?.x ?? -1, 0.9, accuracy: 0.0001)
    }

    /// **Un objet posé hors cadre est injoignable — pire que mal placé.**
    ///
    /// Le témoin s'écrit sur la valeur REFUSÉE, pas sur une valeur licite : une
    /// borne qui ne borne pas rend le même résultat qu'une borne juste tant
    /// qu'on ne lui donne que des valeurs déjà bonnes.
    func test_moveElement_clampsOutsideTheFrame_becauseAnUnreachableObjectIsWorse() {
        let vm = composer { $0.audioPlayerObjects = [audio("a1")] }
        vm.moveElement(id: "a1", to: CGPoint(x: 4.2, y: -3))
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.first?.x ?? -1, 1.0, accuracy: 0.0001)
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.first?.y ?? -1, 0.0, accuracy: 0.0001)
    }

    func test_moveElement_onAnUnknownId_changesNothing() {
        let vm = composer { $0.audioPlayerObjects = [audio("a1")] }
        vm.moveElement(id: "inconnu", to: CGPoint(x: 0.1, y: 0.1))
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.first?.x ?? -1, 0.5, accuracy: 0.0001)
    }

    /// La distinction que ce lot a rendue visible : le glissement ne COMMITE
    /// rien. Si `endDrag()` se mettait un jour à écrire la position, ce témoin
    /// tomberait — et ce serait le bon moment pour se demander si `moveElement`
    /// a encore lieu d'être, plutôt que d'avoir deux chemins d'écriture.
    func test_endDrag_commitsNoPosition_whichIsWhyTheVerbExists() {
        let vm = composer { $0.audioPlayerObjects = [audio("a1")] }
        vm.beginDrag(elementId: "a1", position: CGPoint(x: 0.9, y: 0.9), size: CGSize(width: 10, height: 10))
        vm.updateDrag(position: CGPoint(x: 0.1, y: 0.1))
        vm.endDrag()
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.first?.x ?? -1, 0.5, accuracy: 0.0001,
                       "le trio de glissement ne porte qu'un état éphémère")
    }
}
