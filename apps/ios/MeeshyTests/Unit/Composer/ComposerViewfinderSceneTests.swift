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
        effets.textObjects = texts > 0 ? (0..<texts).map { StoryTextObject(id: "t\($0)", text: "Bonjour") } : []
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
        XCTAssertTrue(ComposerViewfinderScene.showsSceneObjects(stage: .armed, cropFrames: false,
                                                                effects: effects(texts: 1, stickers: 1),
                                                                replacesBackground: false))
        XCTAssertTrue(ComposerViewfinderScene.showsSceneObjects(stage: .recording, cropFrames: false,
                                                                effects: effects(stickers: 1),
                                                                replacesBackground: false),
                      "on filme sous ce qu'on a posé")
    }

    func test_showsSceneObjects_offOrCropping_hidesThem() {
        let posee = effects(texts: 1)
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .off, cropFrames: false, effects: posee,
                                                                 replacesBackground: false))
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .armed, cropFrames: true, effects: posee,
                                                                 replacesBackground: false),
                       "le recadrage pose la prise dans un cadre : les objets n'y sont plus à leur place")
    }

    func test_showsSceneObjects_emptyScene_mountsNothing() {
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .armed, cropFrames: false, effects: effects(),
                                                                 replacesBackground: false),
                       "rien à poser : aucun second canvas")
    }

    func test_showsSceneObjects_existingBackgroundKept_hidesThem_butReplacedBackground_showsThem() {
        let avecFond = effects(texts: 1, background: true)
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .armed, cropFrames: false, effects: avecFond,
                                                                 replacesBackground: false),
                       "la prise ne sera pas le fond : la montrer sous les objets mentirait")
        XCTAssertTrue(ComposerViewfinderScene.showsSceneObjects(stage: .armed, cropFrames: false, effects: avecFond,
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

    /// #18654 : le sticker posé depuis la colonne de retouche se voit sur la prise ; #18712 : il s'y
    /// déplace au doigt, un toucher à vide cadrant toujours la prise.
    func test_retouching_showsSceneObjects_andTheyMoveUnderTheFinger() {
        XCTAssertTrue(ComposerViewfinderScene.showsSceneObjects(stage: .armed, cropFrames: false,
                                                                effects: effects(stickers: 1), replacesBackground: false))
        XCTAssertTrue(ComposerViewfinderScene.objectsTakeTouches(stage: .armed, holding: false),
                      "en retouche aussi, un objet posé se déplace")
        XCTAssertFalse(ComposerViewfinderScene.showsSceneObjects(stage: .armed, cropFrames: true,
                                                                 effects: effects(stickers: 1), replacesBackground: false),
                       "pendant le recadrage, les objets ne se montrent pas")
    }

    // MARK: - Glisser un objet posé : la poubelle en bas, la copie en haut (#18712)

    private func cibles() -> [MeeshyDragTarget: CGPoint] {
        MeeshyDragTargetsRule.centers(size: CGSize(width: 390, height: 844), safeTop: 47, safeBottom: 34,
                                      topSlot: nil, bottomSlot: nil, offered: [.duplicate, .remove])
    }

    func test_dragTargets_copyAtTheTop_trashAtTheBottom() throws {
        let centres = cibles()
        let copie = try XCTUnwrap(centres[.duplicate])
        let poubelle = try XCTUnwrap(centres[.remove])
        XCTAssertLessThan(copie.y, 844 / 3, "la copie paraît en haut")
        XCTAssertGreaterThan(poubelle.y, 844 * 2 / 3, "la poubelle paraît en bas")
    }

    func test_dragTargets_inside_outside_andAHoverThatHoldsAtTheEdge() throws {
        let centres = cibles()
        let poubelle = try XCTUnwrap(centres[.remove])
        XCTAssertEqual(MeeshyDragTargetsRule.hovered(finger: poubelle, centers: centres, previous: nil), .remove, "dans")
        XCTAssertNil(MeeshyDragTargetsRule.hovered(finger: CGPoint(x: 195, y: 422), centers: centres, previous: nil),
                     "au milieu de la scène, aucune cible")
        let bord = CGPoint(x: poubelle.x,
                           y: poubelle.y - CGFloat(MeeshyDragTargetsRecipe.captureRadius + MeeshyDragTargetsRecipe.releaseRadius) / 2)
        XCTAssertNil(MeeshyDragTargetsRule.hovered(finger: bord, centers: centres, previous: nil),
                     "entre les deux rayons, on n'entre pas")
        XCTAssertEqual(MeeshyDragTargetsRule.hovered(finger: bord, centers: centres, previous: .remove), .remove,
                       "survolée, la zone s'agrandit : elle tient à la frontière")
    }

    func test_drop_trashRemoves_copyDuplicatesAndBringsTheOriginalBack() {
        var journal: [String] = []
        let actions = ComposerSceneDragDrop.Actions(
            remove: { journal.append("retire \($0)") },
            move: { id, place in journal.append("ramène \(id) à \(place.x),\(place.y)") },
            duplicate: { journal.append("duplique \($0)") })
        let glisse = ComposerSceneDragDrop.Dragged(id: "t1", start: CGPoint(x: 0.25, y: 0.5))
        ComposerSceneDragDrop.drop(.remove, dragged: glisse, actions: actions)
        XCTAssertEqual(journal, ["retire t1"])
        journal = []
        ComposerSceneDragDrop.drop(.duplicate, dragged: glisse, actions: actions)
        XCTAssertEqual(journal, ["ramène t1 à 0.25,0.5", "duplique t1"], "l'original revient à sa place, puis se copie")
    }

    func test_dragDrop_followsTheGesture_andACancelledDragDropsNothing() {
        let glisser = ComposerSceneDragDrop()
        glisser.feed(.began(id: "s1", finger: CGPoint(x: 100, y: 300), start: CGPoint(x: 0.3, y: 0.4)))
        XCTAssertTrue(glisser.targets.isActive, "les cibles paraissent pendant le glisser")
        XCTAssertEqual(glisser.dragged, ComposerSceneDragDrop.Dragged(id: "s1", start: CGPoint(x: 0.3, y: 0.4)))
        glisser.feed(.cancelled)
        XCTAssertFalse(glisser.targets.isActive)
        XCTAssertNil(glisser.dragged, "annulé : rien n'est lâché")
        glisser.feed(.began(id: "s1", finger: .zero, start: .zero))
        glisser.feed(.ended(finger: CGPoint(x: 195, y: 422)))
        XCTAssertFalse(glisser.targets.isActive, "lâché hors des cibles, l'objet reste où le doigt l'a mené")
        XCTAssertNil(glisser.dragged)
    }

    func test_canvas_saysItsDrags_andTheChromeMountsTheTargets() throws {
        let geste = try ComposerCaptureTakesTests.code("../../packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Gestures.swift")
        XCTAssertTrue(geste.contains("onItemDragged?(.began(id: id, finger: convert(location, to: nil), start: CGPoint(x: sx, y: sy)))"))
        XCTAssertTrue(geste.contains("onItemDragged?(.moved(finger: convert(location, to: nil)))"))
        XCTAssertTrue(geste.contains("onItemDragged?(recognizer.state == .ended ? .ended(finger: convert(location, to: nil)) : .cancelled)"))
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("MeeshyDragTargets(state: sceneDrag.targets,"),
                      "le kit des cibles, jamais une jumelle")
        XCTAssertTrue(chrome.contains("topSlot: emplacements?.top, bottomSlot: emplacements?.bottom"),
                      "les cibles se posent hors de la scène (#18787)")
        XCTAssertTrue(chrome.contains("sceneObjects.feeding(sceneDrag)"))
        let toile = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerViewfinderSceneCanvas.swift")
        XCTAssertTrue(toile.contains("onItemDragged: onItemDragged)"))
        XCTAssertTrue(toile.contains("host.retractMedia(objectIds: [id])"), "la poubelle retire comme le rail")
    }

    /// VoiceOver garde Retirer et Dupliquer : le canvas les offre en actions sur tout objet posé.
    func test_voiceOver_keepsRemoveAndDuplicate_onAPlacedObject() {
        let offertes = StoryCanvasContextAction.offered(isLocked: false, isBackground: false,
                                                        sharesPlaneWithAnother: false, hasEditor: false)
        XCTAssertTrue(offertes.contains(.delete))
        XCTAssertTrue(offertes.contains(.duplicate))
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

    // MARK: - Le rail bas gauche : la scène, un séparateur, les looks

    func test_separatesLooks_onlyWhenBothGroupsAreOnTheRail() {
        XCTAssertTrue(ComposerViewfinderColumn.separatesLooks(sceneEntries: [.text, .sticker], offersLooks: true))
        XCTAssertFalse(ComposerViewfinderColumn.separatesLooks(sceneEntries: [], offersLooks: true))
        XCTAssertFalse(ComposerViewfinderColumn.separatesLooks(sceneEntries: [.text], offersLooks: false))
    }

    func test_bottomRow_drawsTheSeparator_betweenSceneEntriesAndLooks() throws {
        let rangee = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureBottomRow.swift")
        let scene = try XCTUnwrap(rangee.range(of: "ComposerViewfinderColumnView("))
        let trait = try XCTUnwrap(rangee.range(of: "ComposerViewfinderRailSeparator("))
        let looks = try XCTUnwrap(rangee.range(of: "ComposerLookRail(open:"))
        XCTAssertLessThan(scene.lowerBound, trait.lowerBound)
        XCTAssertLessThan(trait.lowerBound, looks.lowerBound)
    }

    // MARK: - Le texte se saisit SUR le viseur vivant (#18638)

    func test_typesOnViewfinder_onlyTheTextEntry_whenTheCaptureWillBeTheBackground() {
        XCTAssertTrue(ComposerViewfinderColumn.typesOnViewfinder(entry: .text, captureFoundsBackground: true))
        XCTAssertFalse(ComposerViewfinderColumn.typesOnViewfinder(entry: .text, captureFoundsBackground: false),
                       "sous un fond média, les objets ne se montrent pas sur l'aperçu : le texte s'écrit sur la scène")
        XCTAssertFalse(ComposerViewfinderColumn.typesOnViewfinder(entry: .background, captureFoundsBackground: true))
        XCTAssertFalse(ComposerViewfinderColumn.typesOnViewfinder(entry: .sticker, captureFoundsBackground: true))
    }

    func test_yieldsToScene_neverForATextTypedOnTheViewfinder() {
        XCTAssertFalse(ComposerViewfinderColumn.yieldsToScene(toolPresentsSheet: false, typesOnViewfinder: true),
                       "le viseur reste affiché : le clavier monte, la saisie se pose sur l'aperçu")
        XCTAssertTrue(ComposerViewfinderColumn.yieldsToScene(toolPresentsSheet: false, typesOnViewfinder: false),
                      "la bande du cadre s'édite toujours sur la scène")
    }

    func test_typedTextId_belongsToTheViewfinder_onlyWhileItShowsTheSceneObjects() {
        XCTAssertEqual(ComposerViewfinderScene.typedTextId(showsViewfinder: true, showsSceneObjects: true, editingTextId: "t1"), "t1")
        XCTAssertNil(ComposerViewfinderScene.typedTextId(showsViewfinder: false, showsSceneObjects: true, editingTextId: "t1"),
                     "un viseur éteint ou qui a cédé la scène laisse la saisie à la scène")
        XCTAssertNil(ComposerViewfinderScene.typedTextId(showsViewfinder: true, showsSceneObjects: false, editingTextId: "t1"))
        XCTAssertNil(ComposerViewfinderScene.typedTextId(showsViewfinder: true, showsSceneObjects: true, editingTextId: nil))
    }

    func test_route_whileTyping_anEmptyTouchEndsTheTyping_andNeverShoots() {
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: false, objectsTakeTouches: true, typing: true),
                       .endTyping)
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: true, objectsTakeTouches: true, typing: true),
                       .sceneObject)
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: true, onSceneObject: false, objectsTakeTouches: true, typing: true),
                       .chrome)
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: false, objectsTakeTouches: true),
                       .capture, "hors frappe, une zone vide photographie")
    }

    func test_typingFloor_isTheKeyboardTop_andNothingWithoutAKeyboard() {
        XCTAssertEqual(ComposerViewfinderScene.typingFloor(keyboardEndFrame: CGRect(x: 0, y: 490, width: 402, height: 384),
                                                           screenHeight: 874), 490)
        XCTAssertEqual(ComposerViewfinderScene.typingFloor(keyboardEndFrame: CGRect(x: 0, y: 874, width: 402, height: 384),
                                                           screenHeight: 874), .greatestFiniteMagnitude,
                       "un clavier sorti de l'écran ne borne rien")
        XCTAssertEqual(ComposerViewfinderScene.typingFloor(keyboardEndFrame: .zero, screenHeight: 874), .greatestFiniteMagnitude)
    }

    func test_objectsFrame_holdsTheCardPlace_whileTyping() {
        let carte = CGRect(x: 0, y: 62, width: 402, height: 714)
        let reduite = CGRect(x: 100, y: 62, width: 200, height: 356)
        XCTAssertEqual(ComposerViewfinderScene.objectsFrame(card: reduite, heldWhileTyping: carte, typing: true), carte,
                       "la scène couverte se réduit pour le clavier ; les objets posés sur l'aperçu ne bougent pas")
        XCTAssertEqual(ComposerViewfinderScene.objectsFrame(card: reduite, heldWhileTyping: nil, typing: true), reduite)
        XCTAssertEqual(ComposerViewfinderScene.objectsFrame(card: carte, heldWhileTyping: reduite, typing: false), carte,
                       "hors frappe, la carte fait foi")
    }

    func test_servesCaptureControls_retireWhileTyping() {
        XCTAssertFalse(ComposerViewfinderScene.servesCaptureControls(typing: true),
                       "le déclencheur, le rail et la phrase du geste cèdent au clavier")
        XCTAssertTrue(ComposerViewfinderScene.servesCaptureControls(typing: false))
    }

    func test_host_textEntry_readsTheLaw_andTheSceneYieldsTheTypingToTheViewfinder() throws {
        let viseur = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(viseur.contains("ComposerViewfinderTyping.yieldsToScene(self, after: entree)"), "l'entrée lit la loi")
        let surfaces = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(surfaces.contains("editingTextId: ComposerViewfinderTyping.sceneTextId(self)"),
                      "un seul canvas saisit : la scène couverte se tait pendant que le viseur écrit")
        XCTAssertTrue(surfaces.contains("ComposerViewfinderTyping.textId(self) == nil ? keyboardDock.link : nil"),
                      "la barre collée au clavier ne s'accroche qu'au canvas qui saisit")
        let toile = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerViewfinderSceneCanvas.swift")
        XCTAssertTrue(toile.contains("ComposerViewfinderColumn.typesOnViewfinder("))
        XCTAssertTrue(toile.contains("inlineEditInputLink: typing?.inputLink"), "la barre s'accroche au canvas du viseur")
        XCTAssertTrue(toile.contains("editingTextId: typing?.textId,"),
                      "la saisie part au toucher : le canvas l'ouvre dès que la calque du texte existe")
        XCTAssertFalse(toile.contains("mountedTextId"),
                       "aucune passe d'attente entre le toucher sur Texte et le clavier (#18735)")
    }

    func test_chrome_whileTyping_retiresTheCaptureControls_andCatchesTheEmptyTouch() throws {
        let code = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(code.contains("ComposerViewfinderScene.servesCaptureControls(typing: typing)"))
        XCTAssertTrue(code.contains("typingTouchCatcher"), "un toucher à vide termine la saisie")
    }

    // MARK: - La galerie ouverte : un toucher sur le viseur la referme (#18709)

    func test_route_whileTheLibraryIsOpen_anyViewfinderTouchClosesIt_andNeverShoots() {
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: false, objectsTakeTouches: true,
                                                     libraryOpen: true), .closeLibrary,
                       "ni photo, ni vidéo, ni zoom : la feuille se referme")
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: true, objectsTakeTouches: true,
                                                     libraryOpen: true), .closeLibrary,
                       "un objet sous la feuille ouverte ne prend pas le doigt")
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: true, onSceneObject: false, objectsTakeTouches: true,
                                                     libraryOpen: true), .chrome, "un contrôle du viseur passe avant")
        XCTAssertEqual(ComposerViewfinderScene.route(onChrome: false, onSceneObject: false, objectsTakeTouches: true,
                                                     libraryOpen: false), .capture)
    }

    func test_chrome_whileTheLibraryIsOpen_catchesTheTouch_aboveTheObjects_belowTheControls() throws {
        let code = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        let objets = try XCTUnwrap(code.range(of: "            sceneObjectsLayer\n", options: .regularExpression))
        let voile = try XCTUnwrap(code.range(of: "            libraryTouchCatcher\n", options: .regularExpression),
                                  "un toucher sur le viseur referme la galerie")
        let chrome = try XCTUnwrap(code.range(of: "topRow.opacity(showsTopRow"))
        XCTAssertLessThan(objets.lowerBound, voile.lowerBound, "la galerie ouverte, les objets ne prennent rien")
        XCTAssertLessThan(voile.lowerBound, chrome.lowerBound, "la croix et le rail restent au-dessus")
        XCTAssertTrue(code.contains("ComposerViewfinderScene.route(onChrome: false, onSceneObject: false, objectsTakeTouches: false, libraryOpen: true)"),
                      "le voile lit la loi du toucher")
        let montage = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerSceneViewfinderMount.swift")
        XCTAssertTrue(montage.contains(".environment(\\.composerViewfinderClosesLibrary"),
                      "le composer dit au viseur comment refermer sa galerie")
        let toile = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerViewfinderSceneCanvas.swift")
        XCTAssertTrue(toile.contains("libraryOpen: host.showsOpeningLibrary"), "les objets se taisent sous la galerie ouverte")
    }

    // MARK: - En retouche, la colonne d'outils reste à gauche (#18638)

    func test_editRail_isTheLeadingColumnOfTheViewfinder_notABottomRow() throws {
        let rangee = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertFalse(rangee.contains("axis: .horizontal"), "plus de rangée d'outils en bas")
        XCTAssertFalse(rangee.contains("ComposerEditRailFit("))
        let debut = try XCTUnwrap(rangee.range(of: "private var editRail"))
        let fin = try XCTUnwrap(rangee.range(of: "private var familyRow", range: debut.upperBound..<rangee.endIndex))
        XCTAssertTrue(rangee[debut.upperBound..<fin.lowerBound].contains("items: ComposerRetouchRail.items(composesScene: sceneEntry != nil, tools: session.editTools)"),
                      "les outils de retouche prennent la colonne du viseur")
        XCTAssertTrue(rangee[debut.upperBound..<fin.lowerBound].contains("alignment: .leading"))
        XCTAssertTrue(rangee.contains("ComposerEditRailGate(board: session.retouchTexts) { editRail }"),
                      "la colonne cède le bas à la barre du texte pendant sa saisie")
    }

    func test_editRail_column_reservesNothingUnderTheCropFrame() {
        XCTAssertEqual(ComposerEditScene.bottomReserve([]), ComposerEditScene.gap * 2,
                       "la colonne se pose sur la prise : aucune rangée ne retient de hauteur")
        let ecran = CGSize(width: 402, height: 778)
        let scene = ComposerEditScene.rect(aspect: 9.0 / 16.0,
                                           in: ComposerEditScene.area(container: ecran, top: 0, bottom: 0, panels: []))
        let formats = ComposerEditPresetsLayout.frame(scene: scene)
        XCTAssertGreaterThanOrEqual(formats.minX, ComposerEditScene.railColumnWidth,
                                    "« Annuler » et les formats commencent à droite de la colonne")
        XCTAssertEqual(formats.maxX, ecran.width, accuracy: 0.01)
    }

    // MARK: - #18786 — toucher un texte du viseur ouvre sa saisie

    func test_tap_onAText_opensItsTyping() {
        XCTAssertEqual(ComposerViewfinderScene.tapOutcome(kind: .text), .editText)
    }

    func test_tap_onAnotherObject_selectsIt() {
        for kind in [StoryCanvasUIView.CanvasItemKind.media, .sticker, .place, .audio] {
            XCTAssertEqual(ComposerViewfinderScene.tapOutcome(kind: kind), .select, "\(kind)")
        }
        XCTAssertEqual(ComposerViewfinderScene.tapOutcome(kind: nil), .select)
    }

    // MARK: - #18787 — pendant le glisser, rien d'autre que l'objet et ses cibles

    func test_dragDrop_publishesThatAnObjectIsDragged() {
        let glisser = ComposerSceneDragDrop()
        XCTAssertFalse(glisser.isDragging)
        glisser.feed(.began(id: "s1", finger: .zero, start: .zero))
        XCTAssertTrue(glisser.isDragging, "le chrome se retire")
        glisser.feed(.moved(finger: CGPoint(x: 10, y: 10)))
        XCTAssertTrue(glisser.isDragging)
        glisser.feed(.ended(finger: .zero))
        XCTAssertFalse(glisser.isDragging, "lâché : le chrome revient")
        glisser.feed(.began(id: "s1", finger: .zero, start: .zero))
        glisser.feed(.cancelled)
        XCTAssertFalse(glisser.isDragging)
    }

    func test_chrome_isWithdrawnWhileDragging() {
        XCTAssertFalse(ComposerViewfinderScene.showsChrome(dragging: true))
        XCTAssertTrue(ComposerViewfinderScene.showsChrome(dragging: false))
    }

    /// **Les cibles hors de la scène** : la copie dans la bande du haut, la poubelle
    /// dans celle du bas — la scène entière reste libre pour poser l'objet.
    func test_targetSlots_sitInTheBandsOutsideTheScene() throws {
        let conteneur = CGSize(width: 440, height: 956)
        let scene = CGRect(x: 0, y: 87, width: 440, height: 782)
        let emplacements = ComposerSceneDragTargetSlots(scene: scene, container: conteneur)
        let centres = MeeshyDragTargetsRule.centers(size: conteneur, safeTop: 0, safeBottom: 0,
                                                    topSlot: emplacements.top, bottomSlot: emplacements.bottom,
                                                    offered: [.duplicate, .remove])
        let rayon = CGFloat(MeeshyDragTargetsRecipe.diameter) / 2
        let copie = try XCTUnwrap(centres[.duplicate])
        let poubelle = try XCTUnwrap(centres[.remove])
        XCTAssertLessThanOrEqual(copie.y + rayon, scene.minY, "la copie ne mord pas sur la scène")
        XCTAssertGreaterThanOrEqual(copie.y - rayon, 0)
        XCTAssertGreaterThanOrEqual(poubelle.y - rayon, scene.maxY, "la poubelle ne mord pas sur la scène")
        XCTAssertLessThanOrEqual(poubelle.y + rayon, conteneur.height)
        XCTAssertEqual(copie.x, scene.midX)
        XCTAssertEqual(poubelle.x, scene.midX)
    }

    func test_targetSlots_tooNarrowABand_staysOnScreen() throws {
        let conteneur = CGSize(width: 440, height: 800)
        let scene = CGRect(x: 0, y: 10, width: 440, height: 780)
        let emplacements = ComposerSceneDragTargetSlots(scene: scene, container: conteneur)
        let centres = MeeshyDragTargetsRule.centers(size: conteneur, safeTop: 0, safeBottom: 0,
                                                    topSlot: emplacements.top, bottomSlot: emplacements.bottom,
                                                    offered: [.duplicate, .remove])
        let rayon = CGFloat(MeeshyDragTargetsRecipe.diameter) / 2
        XCTAssertGreaterThanOrEqual(try XCTUnwrap(centres[.duplicate]).y - rayon, 0)
        XCTAssertLessThanOrEqual(try XCTUnwrap(centres[.remove]).y + rayon, conteneur.height)
    }
}
