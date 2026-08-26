import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// « Mettre au premier plan » / « Mettre à l'arrière » du menu long-press
/// doivent changer l'ordre d'EMPILEMENT — donc les `zIndex`, seule chose que
/// le rendu lit (`StoryRenderer.render` trie par `zIndex` ; chaque calque
/// d'item pose `zPosition = zIndex`).
///
/// Ils échangeaient deux positions dans le TABLEAU `mediaObjects`, que
/// personne ne lit pour dessiner : un no-op visuel complet, qui ignorait de
/// surcroît textes, stickers et pastilles — le contenu le plus courant d'une
/// slide. `bringForward` / `sendBackward` faisaient le vrai travail sur tous
/// les types d'éléments, sans appelant. Le menu y est routé.
@MainActor
final class StoryCanvasContextOrderingTests: XCTestCase {

    private func makeCanvas(effects: StoryEffects) -> StoryCanvasUIView {
        let slide = StorySlide(id: "s", effects: effects, duration: 6, order: 0)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    private func twoTexts() -> StoryEffects {
        StoryEffects(textObjects: [StoryTextObject(id: "back", text: "derrière", zIndex: 0),
                                   StoryTextObject(id: "front", text: "devant", zIndex: 1)])
    }

    private func textAbove(_ other: StoryEffects) -> StoryEffects {
        var effects = other
        effects.textObjects.append(StoryTextObject(id: "text", text: "au-dessus", zIndex: 1))
        return effects
    }

    private func zIndex(_ view: StoryCanvasUIView, _ id: String) -> Int? {
        let effects = view.slide.effects
        if let text = effects.textObjects.first(where: { $0.id == id }) { return text.zIndex }
        if let media = effects.mediaObjects?.first(where: { $0.id == id }) { return media.zIndex }
        if let sticker = effects.stickerObjects?.first(where: { $0.id == id }) { return sticker.zIndex }
        if let badge = effects.locationObjects.first(where: { $0.id == id }) { return badge.zIndex }
        return nil
    }

    // MARK: - Textes

    func test_performContextAction_bringForwardOnText_raisesItAboveItsNeighbour() throws {
        let view = makeCanvas(effects: twoTexts())

        view.performContextAction(.bringForward, on: "back", kind: .text)

        XCTAssertGreaterThan(try XCTUnwrap(zIndex(view, "back")), try XCTUnwrap(zIndex(view, "front")),
                             "« Mettre au premier plan » n'a rien changé à l'ordre de rendu.")
    }

    func test_performContextAction_sendBackwardOnText_lowersItBelowItsNeighbour() throws {
        let view = makeCanvas(effects: twoTexts())

        view.performContextAction(.sendBackward, on: "front", kind: .text)

        XCTAssertLessThan(try XCTUnwrap(zIndex(view, "front")), try XCTUnwrap(zIndex(view, "back")),
                          "« Mettre à l'arrière » n'a rien changé à l'ordre de rendu.")
    }

    func test_performContextAction_bringForwardOnTopmostText_leavesZIndexesUntouched() {
        let view = makeCanvas(effects: twoTexts())

        view.performContextAction(.bringForward, on: "front", kind: .text)

        XCTAssertEqual(zIndex(view, "front"), 1)
        XCTAssertEqual(zIndex(view, "back"), 0)
    }

    // MARK: - Autres types d'éléments du canvas

    func test_performContextAction_bringForwardOnMedia_raisesItAboveAText() throws {
        let media = StoryMediaObject(id: "media", postMediaId: "media", kind: .image, aspectRatio: 1, zIndex: 0)
        let view = makeCanvas(effects: textAbove(StoryEffects(mediaObjects: [media])))

        view.performContextAction(.bringForward, on: "media", kind: .media)

        XCTAssertGreaterThan(try XCTUnwrap(zIndex(view, "media")), try XCTUnwrap(zIndex(view, "text")))
    }

    func test_performContextAction_bringForwardOnSticker_raisesItAboveAText() throws {
        let sticker = StorySticker(id: "sticker", emoji: "✨", zIndex: 0)
        let view = makeCanvas(effects: textAbove(StoryEffects(stickerObjects: [sticker])))

        view.performContextAction(.bringForward, on: "sticker", kind: .sticker)

        XCTAssertGreaterThan(try XCTUnwrap(zIndex(view, "sticker")), try XCTUnwrap(zIndex(view, "text")))
    }

    func test_performContextAction_bringForwardOnLocationBadge_raisesItAboveAText() throws {
        let badge = StoryLocationObject(id: "badge",
                                        place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Paris"),
                                        zIndex: 0)
        let view = makeCanvas(effects: textAbove(StoryEffects(locationObjects: [badge])))

        view.performContextAction(.bringForward, on: "badge", kind: .location)

        XCTAssertGreaterThan(try XCTUnwrap(zIndex(view, "badge")), try XCTUnwrap(zIndex(view, "text")))
    }

    // MARK: - Propagation et rendu

    /// La primitive propage déjà la slide : le menu ne doit pas la propager
    /// une seconde fois.
    func test_performContextAction_bringForward_notifiesTheHostExactlyOnce() {
        let view = makeCanvas(effects: twoTexts())
        var notifications = 0
        view.onItemModified = { _ in notifications += 1 }

        view.performContextAction(.bringForward, on: "back", kind: .text)

        XCTAssertEqual(notifications, 1)
    }

    /// Le rendu suit : le calque de l'élément remonté est composé au-dessus
    /// de son voisin (`zPosition`, ce que `hitTestItem` et le compositeur
    /// lisent).
    func test_performContextAction_bringForward_reordersTheRenderedLayers() throws {
        let view = makeCanvas(effects: twoTexts())
        view.rebuildLayers()

        view.performContextAction(.bringForward, on: "back", kind: .text)

        let layers = view.itemsContainer.sublayers ?? []
        let back = try XCTUnwrap(layers.first(where: { $0.name == "back" }))
        let front = try XCTUnwrap(layers.first(where: { $0.name == "front" }))
        XCTAssertGreaterThan(back.zPosition, front.zPosition,
                             "L'ordre des calques ne suit pas les zIndex remontés.")
    }
}
