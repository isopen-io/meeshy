// packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryCanvasContextOrderingTests.swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// « Mettre au premier plan » / « Mettre à l'arrière » du menu long-press
/// doivent réellement changer l'ordre d'empilement.
///
/// Ils ne le faisaient pas. `contextBringForward` échangeait deux positions
/// dans le TABLEAU `mediaObjects` (`swapAt`), alors que le rendu trie
/// exclusivement par `zIndex` (`StoryRenderer` : `allItems.sorted(by:
/// { $0.zIndex < $1.zIndex })`). L'action était donc un no-op visuel complet —
/// et elle ignorait de surcroît textes et stickers.
///
/// La version correcte existait déjà à côté, `bringForward` / `sendBackward` :
/// elle raisonne sur les `zIndex` de TOUS les types d'éléments et sait casser
/// une égalité fortuite. Elle était testée… et n'avait aucun appelant.
@MainActor
final class StoryCanvasContextOrderingTests: XCTestCase {

    private func makeCanvas() -> StoryCanvasUIView {
        let back = StoryTextObject(id: "back", text: "derrière", zIndex: 0)
        let front = StoryTextObject(id: "front", text: "devant", zIndex: 1)
        let slide = StorySlide(id: UUID().uuidString,
                               effects: StoryEffects(textObjects: [back, front]),
                               duration: 6,
                               order: 0)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    private func zIndex(_ view: StoryCanvasUIView, _ id: String) -> Int {
        view.slide.effects.textObjects.first(where: { $0.id == id })?.zIndex ?? .min
    }

    /// Le critère est l'ORDRE DE RENDU — donc les `zIndex` —, pas la position
    /// dans un tableau que personne ne lit pour dessiner.
    func test_contextBringForward_raisesTheItemAboveItsNeighbour() {
        let view = makeCanvas()
        XCTAssertLessThan(zIndex(view, "back"), zIndex(view, "front"), "Préalable")

        view.contextBringForward(id: "back")

        XCTAssertGreaterThan(zIndex(view, "back"), zIndex(view, "front"),
                             "« Mettre au premier plan » n'a rien changé à l'ordre de rendu.")
    }

    func test_contextSendBackward_lowersTheItemBelowItsNeighbour() {
        let view = makeCanvas()

        view.contextSendBackward(id: "front")

        XCTAssertLessThan(zIndex(view, "front"), zIndex(view, "back"),
                          "« Mettre à l'arrière » n'a rien changé à l'ordre de rendu.")
    }

    /// L'ancienne version ne traitait QUE `mediaObjects` : sur une slide de
    /// textes — le cas le plus courant — elle sortait sans rien faire.
    func test_ordering_appliesToTexts_notOnlyToMedia() {
        let view = makeCanvas()
        let before = (zIndex(view, "back"), zIndex(view, "front"))

        view.contextBringForward(id: "back")

        XCTAssertNotEqual((zIndex(view, "back"), zIndex(view, "front")) == before, true,
                          "Les textes doivent être concernés par l'ordre d'empilement.")
    }
}
