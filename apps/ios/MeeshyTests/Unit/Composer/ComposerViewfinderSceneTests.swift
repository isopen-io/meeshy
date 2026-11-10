import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La scène se pose PAR-DESSUS le viseur, et ce que prend le viseur en devient le fond**
/// (#17432, directive porteur 2026-11-10).
@MainActor
final class ComposerViewfinderSceneTests: XCTestCase {

    // MARK: - Fabriques

    private func effects(texts: Int = 0, stickers: Int = 0, background: Bool = false) -> StoryEffects {
        var effets = StoryEffects()
        effets.textObjects = texts > 0 ? (0..<texts).map { StoryTextObject(id: "t\($0)", text: "Bonjour") } : nil
        effets.stickerObjects = stickers > 0 ? (0..<stickers).map { _ in StorySticker(emoji: "🔥", x: 0.3, y: 0.4) } : nil
        effets.mediaObjects = background
            ? [StoryMediaObject(id: "fond", mediaURL: "file:///fond.jpg", mediaType: "image", aspectRatio: 1, isBackground: true)]
            : nil
        return effets
    }

    private func jpeg(_ nom: String) -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("viseur-\(nom).jpg")
        let image = UIGraphicsImageRenderer(size: CGSize(width: 30, height: 40)).image { contexte in
            UIColor.systemTeal.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 30, height: 40))
        }
        try? image.jpegData(compressionQuality: 0.8)?.write(to: url)
        return url
    }

    // MARK: - L'ordre des calques

    func test_layers_withSceneObjects_viewfinderThenObjectsThenChrome() {
        XCTAssertEqual(ComposerViewfinderScene.layers(showsSceneObjects: true),
                       [.viewfinder, .sceneObjects, .chrome],
                       "l'aperçu est le fond, les objets se posent dessus, le chrome du viseur reste au-dessus")
    }

    func test_layers_withoutSceneObjects_viewfinderThenChrome() {
        XCTAssertEqual(ComposerViewfinderScene.layers(showsSceneObjects: false), [.viewfinder, .chrome])
    }

    func test_chrome_mountsSceneObjects_aboveTheGestureSheet_belowTheCaptureChrome() throws {
        let code = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        let nappe = try XCTUnwrap(code.range(of: ".gesture(holdGesture.simultaneously"))
        let objets = try XCTUnwrap(code.range(of: "sceneObjectsLayer"), "la scène est montée dans le chrome du viseur")
        let bas = try XCTUnwrap(code.range(of: "ComposerCaptureBottomRow(session:"))
        XCTAssertLessThan(nappe.lowerBound, objets.lowerBound, "les objets passent AU-DESSUS de la nappe de capture")
        XCTAssertLessThan(objets.lowerBound, bas.lowerBound, "le déclencheur et le rail restent au-dessus des objets")
    }

    // MARK: - Quand la scène se montre sur le viseur

    func test_showsSceneObjects_armedWithObjectsAndNoBackground_showsThem() {
        XCTAssertTrue(ComposerViewfinderScene.showsSceneObjects(stage: .armed, editing: false,
                                                                effects: effects(texts: 1, stickers: 1),
                                                                replacesBackground: false))
        XCTAssertTrue(ComposerViewfinderScene.showsSceneObjects(stage: .recording, editing: false,
                                                                effects: effects(stickers: 1),
                                                                replacesBackground: false),
                      "on filme sous ce qu'on a posé")
    }

    func test_showsSceneObjects_offOrRetouching_hidesThem() {
        let posee = effects(texts: 1)
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .off, editing: false, effects: posee,
                                                                 replacesBackground: false))
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .armed, editing: true, effects: posee,
                                                                 replacesBackground: false),
                       "la retouche est plein écran : elle cadre la prise seule")
    }

    func test_showsSceneObjects_emptyScene_mountsNothing() {
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .armed, editing: false, effects: effects(),
                                                                 replacesBackground: false),
                       "rien à poser : aucun second canvas")
    }

    func test_showsSceneObjects_existingBackgroundKept_hidesThem_butReplacedBackground_showsThem() {
        let avecFond = effects(texts: 1, background: true)
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .armed, editing: false, effects: avecFond,
                                                                 replacesBackground: false),
                       "la prise ne sera pas le fond : la montrer sous les objets mentirait")
        XCTAssertTrue(ComposerViewfinderScene.showsSceneObjects(stage: .armed, editing: false, effects: avecFond,
                                                                replacesBackground: true),
                      "« Reprendre une photo » : le viseur remplace le fond")
    }

    func test_captureFoundsBackground_followsTheSceneBackground() {
        XCTAssertTrue(ComposerViewfinderScene.captureFoundsBackground(effects: effects(texts: 2), replacesBackground: false))
        XCTAssertFalse(ComposerViewfinderScene.captureFoundsBackground(effects: effects(background: true), replacesBackground: false))
        XCTAssertTrue(ComposerViewfinderScene.captureFoundsBackground(effects: effects(background: true), replacesBackground: true))
    }

    // MARK: - La répartition des touches

    func test_route_chromeFirst_thenObject_thenCapture() {
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: true, onSceneObject: true, objectsTakeTouches: true), .chrome)
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: true, objectsTakeTouches: true), .sceneObject)
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: false, objectsTakeTouches: true), .capture,
                       "une zone vide garde le toucher-photo, l'appui long-vidéo et le zoom")
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: true, objectsTakeTouches: false), .capture)
    }

    func test_objectsTakeTouches_onlyArmedAndNotHolding() {
        XCTAssertTrue(ComposerViewfinderScene.objectsTakeTouches(stage: .armed, holding: false))
        XCTAssertFalse(ComposerViewfinderScene.objectsTakeTouches(stage: .armed, holding: true),
                       "une tenue garde son doigt")
        XCTAssertFalse(ComposerViewfinderScene.objectsTakeTouches(stage: .recording, holding: false),
                       "on ne déplace rien pendant qu'on filme")
    }

    func test_canvasClaim_passingThrough_claimsOnlyItsObjects() {
        XCTAssertFalse(StoryCanvasTouchClaim.claims(passesThroughEmpty: true, hitsItem: false, manipulating: false))
        XCTAssertTrue(StoryCanvasTouchClaim.claims(passesThroughEmpty: true, hitsItem: true, manipulating: false))
        XCTAssertTrue(StoryCanvasTouchClaim.claims(passesThroughEmpty: true, hitsItem: false, manipulating: true),
                      "le second doigt d'un pincement en cours reste au canvas")
        XCTAssertTrue(StoryCanvasTouchClaim.claims(passesThroughEmpty: false, hitsItem: false, manipulating: false),
                      "le canvas du composer garde tout son doigt hors du viseur")
    }

    func test_canvasView_passingThrough_releasesAnEmptyPoint() {
        let vue = StoryCanvasUIView(slide: StorySlide(effects: StoryEffects(background: "FF0000")), mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 270, height: 480)
        vue.layoutIfNeeded()
        let centre = CGPoint(x: 135, y: 240)
        XCTAssertTrue(vue.point(inside: centre, with: nil))
        vue.passesThroughEmptyTouches = true
        XCTAssertFalse(vue.point(inside: centre, with: nil), "le toucher vide rejoint la nappe de capture")
    }

    // MARK: - La prise devient le fond, sous les objets intacts

    func test_pose_captureOnAnObjectScene_becomesTheBackground_objectsUntouched() throws {
        let modele = StoryComposerViewModel()
        _ = try XCTUnwrap(modele.addText())
        _ = try XCTUnwrap(modele.addSticker(emoji: "🎉"))
        let avant = modele.currentSlide.effects
        XCTAssertTrue(ComposerViewfinderScene.captureFoundsBackground(effects: avant, replacesBackground: false))

        let poses = modele.applyContentMedia([ComposerContentMedia(sourceURL: jpeg("prise"), kind: .image,
                                                                   mimeType: "image/jpeg")])
        let id = try XCTUnwrap(poses.values.first)
        let apres = modele.currentSlide.effects

        XCTAssertEqual(apres.mediaObjects?.filter { $0.id == id }.first?.isBackground, true, "la prise est le fond")
        XCTAssertEqual(apres.mediaObjects?.count, 1, "un seul média : rien de dupliqué")
        XCTAssertEqual(apres.textObjects, avant.textObjects, "le texte garde sa place et son rang")
        XCTAssertEqual(apres.stickerObjects, avant.stickerObjects, "le sticker garde sa place et son rang")
    }
}
