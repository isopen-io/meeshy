import AVFoundation
import CoreMedia
import XCTest
import UIKit
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// **Les outils du mode édition d'une prise** (#9754, directives porteur
/// 2026-10-09) : Crop, Trim, Son — COMPOSABLES et actifs d'office, chacun se
/// retire d'un toucher sans fermer les autres — et la frame exacte sous la règle.
@MainActor
final class ComposerEditToolsTests: XCTestCase {

    private static func clip() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("clip_\(UUID().uuidString).mov")
    }

    private func videoSession(hasAudio: Bool = true) async -> (ComposerCaptureSession, MockComposerLoopPlayer) {
        let lecteur = MockComposerLoopPlayer(duration: 6, hasAudio: hasAudio)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        return (session, lecteur)
    }

    // MARK: - Ce que chaque prise offre, ACTIF D'OFFICE (porteur 2026-10-09)

    func test_offered_photoCrops_videoCropsTrimsAndSounds_audioTrimsAndSounds() {
        XCTAssertEqual(ComposerEditTools.offered(.photo), [.crop])
        XCTAssertEqual(ComposerEditTools.offered(.video(hasAudio: false)), [.crop, .trim])
        XCTAssertEqual(ComposerEditTools.offered(.video(hasAudio: true)), [.crop, .trim, .sound])
        XCTAssertEqual(ComposerEditTools.offered(.audio), [.trim, .sound], "un son ne se recadre pas")
    }

    /// **Le rail est là dès l'entrée, AUCUN outil ouvert** (porteur 2026-10-20 :
    /// « afficher immédiatement les touches d'édition » ; en vidéo, « Couper »
    /// n'est plus présélectionné).
    func test_initial_noToolIsOpenOnEntry() {
        XCTAssertEqual(ComposerEditTools.initial(.photo), [])
        XCTAssertEqual(ComposerEditTools.initial(.video(hasAudio: true)), [])
        XCTAssertEqual(ComposerEditTools.initial(.audio), [])
    }

    /// **(x) et « Terminé » cèdent la place aux éléments d'édition** (porteur
    /// 2026-10-20) : une famille ouverte ou un outil montré les cache ; plus
    /// rien d'ouvert, ils reviennent.
    func test_showsTopRow_onlyWhileNoEditElementIsShown() {
        XCTAssertTrue(ComposerEditTools.showsTopRow(familyOpen: false, shownTools: []))
        XCTAssertFalse(ComposerEditTools.showsTopRow(familyOpen: true, shownTools: []))
        XCTAssertFalse(ComposerEditTools.showsTopRow(familyOpen: false, shownTools: [.crop]))
        XCTAssertFalse(ComposerEditTools.showsTopRow(familyOpen: false, shownTools: [.trim]))
        XCTAssertFalse(ComposerEditTools.showsTopRow(familyOpen: false, shownTools: [.sound]))
    }

    /// **Témoin de COMPORTEMENT, sur l'écran rendu** (recette iPhone 2026-10-20 :
    /// Recadrer ou Filtres ouverts, (x) et « Terminé » restaient affichés).
    func test_theRenderedChrome_hidesDone_whileAnEditElementIsShown() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        let ecran = RenderedScreen(ComposerCaptureChrome(session: session, size: .fullScreen,
                                                         onDisarm: {}, onValidateSegments: {}))
        defer { ecran.dismount() }
        let termine = ComposerCaptureCopy.done
        XCTAssertTrue(Self.settles { ecran.labels.contains(termine) }, "à l'entrée, « Terminé » est là : \(ecran.labels)")
        session.toggleEditTool(.crop)
        XCTAssertTrue(Self.settles { !ecran.labels.contains(termine) }, "Recadrer ouvert : \(ecran.labels)")
        session.toggleEditTool(.crop)
        XCTAssertTrue(Self.settles { ecran.labels.contains(termine) }, "Recadrer refermé : \(ecran.labels)")
        session.toggleFamily(.filters)
        XCTAssertTrue(Self.settles { !ecran.labels.contains(termine) }, "Filtres ouverts : \(ecran.labels)")
    }

    /// Le même témoin, à travers LE montage de la barre de conversation
    /// (`ComposerViewfinder` → `ComposerCaptureMount`), là où la recette l'a vu.
    func test_theMountedViewfinder_hidesDone_whileCropIsOpen() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        let montage = ComposerCaptureMount(session: session, size: .constant(.card), offersSizeToggle: false,
                                           onDisarm: {}, onDeliver: { _ in }) {
            Color.black
                .ignoresSafeArea()
                .anchorPreference(key: ComposerSceneCameraFrameKey.self, value: .bounds) { $0 }
        }
        let ecran = RenderedScreen(montage)
        defer { ecran.dismount() }
        let termine = ComposerCaptureCopy.done
        XCTAssertTrue(Self.settles { ecran.labels.contains(termine) }, "à l'entrée : \(ecran.labels)")
        session.toggleEditTool(.crop)
        XCTAssertTrue(Self.settles { !ecran.labels.contains(termine) }, "Recadrer ouvert : \(ecran.labels)")
    }

    /// **Le toucher qui ferme l'alerte n'atteint pas la prise** (recette iPhone
    /// 2026-10-20 : « Abandonner » touché, les outils se cachaient derrière).
    func test_aTapThatClosesTheAlert_doesNotReachTheTake() throws {
        let maintenant = Date(timeIntervalSinceReferenceDate: 1_000)
        XCTAssertTrue(ComposerCaptureTapRule.belongsToAnAlert(presented: true, closedAt: nil, now: maintenant))
        XCTAssertTrue(ComposerCaptureTapRule.belongsToAnAlert(presented: false, closedAt: maintenant.addingTimeInterval(-0.1),
                                                              now: maintenant), "la levée qui ferme l'alerte")
        XCTAssertFalse(ComposerCaptureTapRule.belongsToAnAlert(presented: false, closedAt: maintenant.addingTimeInterval(-1),
                                                               now: maintenant), "un toucher d'après en est un vrai")
        XCTAssertFalse(ComposerCaptureTapRule.belongsToAnAlert(presented: false, closedAt: nil, now: maintenant))
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("!session.discardPrompt.swallowsTap(now: Date())"),
                      "le toucher de la nappe consulte la question en cours")
    }

    /// **« Abandonner » abandonne la photo** (recette iPhone 2026-10-20 : la
    /// photo restait en retouche). La question vit dans la session ; SwiftUI
    /// peut refermer l'alerte AVANT d'appeler l'action, et l'action trouve
    /// encore ce qu'elle abandonne.
    func test_theDiscardAnswer_abandonsTheTake_evenWhenTheAlertClosedFirst() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        session.discardPrompt.ask(take: true, photo: true)
        XCTAssertTrue(session.discardPrompt.isPresented)
        session.discardPrompt.dismiss()
        XCTAssertFalse(ComposerCaptureDiscardFlow.confirm(session), "la retouche revient viser, le viseur reste")
        XCTAssertFalse(session.phase.isEditing, "la photo est abandonnée")
        XCTAssertNil(session.discardPrompt.request, "la réponse consomme la question")
    }

    func test_continuing_keepsTheTake_andAViewfinderQuestion_closesTheViewfinder() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        session.discardPrompt.ask(take: true, photo: true)
        ComposerCaptureDiscardFlow.keep(session)
        XCTAssertTrue(session.phase.isEditing, "« Continuer » garde la photo")
        XCTAssertFalse(ComposerCaptureDiscardFlow.confirm(session), "une réponse sans question ne fait rien")
        XCTAssertTrue(session.phase.isEditing)
        let viseur = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        viseur.discardPrompt.ask(take: false, photo: false)
        XCTAssertTrue(ComposerCaptureDiscardFlow.confirm(viseur), "une question posée au viseur le range")
    }

    func test_theTapThatClosesTheAlert_isSwallowed() {
        var question = ComposerCaptureDiscardPrompt()
        let maintenant = Date(timeIntervalSinceReferenceDate: 1_000)
        question.ask(take: true, photo: true)
        XCTAssertTrue(question.swallowsTap(now: maintenant), "pendant l'alerte")
        _ = question.answer(now: maintenant)
        XCTAssertTrue(question.swallowsTap(now: maintenant.addingTimeInterval(0.1)), "la levée qui la ferme")
        XCTAssertFalse(question.swallowsTap(now: maintenant.addingTimeInterval(1)), "un toucher d'après")
    }

    private static func settles(_ condition: () -> Bool) -> Bool {
        let fin = Date().addingTimeInterval(3)
        while Date() < fin {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        return condition()
    }

    func test_theTopRow_followsTheLaw_andThePlayback_isAlwaysMountedForAVideo() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("topRow.opacity(showsTopRow ? 1 : 0)"), "(x) et « Terminé » suivent la loi")
        XCTAssertTrue(chrome.contains("ComposerEditTools.showsTopRow(familyOpen: session.openFamily != nil, shownTools: session.shownEditTools)"))
        XCTAssertTrue(chrome.contains("if !finishing, session.offersEditPlayback { editPlayback }"),
                      "lecture et volume ne dépendent ni du chrome ni d'un outil")
    }

    /// **#10930 — seul le recadrage réduit le média**, et seulement quand le
    /// chrome est montré.
    func test_onlyTheCrop_framesTheScene() {
        XCTAssertTrue(ComposerEditTools.framesScene(active: [.crop], chromeShown: true))
        XCTAssertTrue(ComposerEditTools.framesScene(active: [.crop, .trim], chromeShown: true))
        XCTAssertFalse(ComposerEditTools.framesScene(active: [.trim, .sound], chromeShown: true),
                       "la coupe se pose PAR-DESSUS la vidéo, elle ne la réduit pas")
        XCTAssertFalse(ComposerEditTools.framesScene(active: [.crop], chromeShown: false))
    }

    /// Hors recadrage, la scène est le conteneur entier : la prise « fit » le viewport.
    func test_anUnframedScene_isTheWholeContainer() {
        let ecran = CGSize(width: 402, height: 874)
        XCTAssertEqual(ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: [.trim], framed: false),
                       CGRect(origin: .zero, size: ecran))
        let cadre = ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: [.trim], framed: true)
        XCTAssertLessThan(cadre.height, ecran.height, "le recadrage réduit la scène pour libérer ses bords")
    }

    func test_toggled_onlyTheTouchedTool_neverTheOthers() {
        let tout: Set<ComposerEditTool> = [.crop, .trim, .sound]
        XCTAssertEqual(ComposerEditTools.toggled(tout, tapping: .trim, familyOpen: false), [.crop, .sound],
                       "désactiver Couper ne ferme ni Crop ni Son")
        XCTAssertEqual(ComposerEditTools.toggled([.crop, .sound], tapping: .trim, familyOpen: false), tout,
                       "le retoucher le réactive")
        XCTAssertEqual(ComposerEditTools.toggled([], tapping: .crop, familyOpen: false), [.crop])
    }

    func test_toggled_withABandOpen_revealsAFoldedTool_insteadOfDroppingIt() {
        XCTAssertEqual(ComposerEditTools.toggled([.crop, .trim], tapping: .trim, familyOpen: true), [.crop, .trim],
                       "Couper replié sous la bande : le toucher le MONTRE")
        XCTAssertEqual(ComposerEditTools.toggled([.crop, .trim], tapping: .crop, familyOpen: true), [.trim],
                       "les équerres restent visibles sous une bande : toucher Crop les retire")
    }

    func test_panels_stackEveryActiveTool_fromTheProportionsDownToTheCut() {
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.trim, .sound, .crop]),
                       [.presets, .trim],
                       "les proportions sous la scène (porteur 2026-10-20) ; le son se peint sur la coupe (#10356)")
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.sound, .crop]), [.presets, .sound],
                       "Couper retiré : le spectre garde sa propre piste")
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.crop]), [.presets])
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: []), [])
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: true, active: [.crop, .trim, .sound]), [.band],
                       "une bande ouverte replie les panneaux, sans désactiver leurs outils")
    }

    func test_shown_cropStaysOnTheSceneUnderABand_theTracksFold() {
        XCTAssertTrue(ComposerEditTools.isShown(.crop, active: [.crop], familyOpen: true))
        XCTAssertFalse(ComposerEditTools.isShown(.trim, active: [.trim], familyOpen: true))
        XCTAssertTrue(ComposerEditTools.isShown(.trim, active: [.trim], familyOpen: false))
        XCTAssertFalse(ComposerEditTools.isShown(.sound, active: [.trim], familyOpen: false))
    }

    // MARK: - (1) Crop fait paraître et disparaître les équerres

    func test_brackets_followTheCropTool_alone() {
        XCTAssertTrue(ComposerEditTools.showsBrackets(active: [.crop]))
        XCTAssertTrue(ComposerEditTools.showsBrackets(active: [.crop, .trim]))
        XCTAssertFalse(ComposerEditTools.showsBrackets(active: [.trim, .sound]))
        XCTAssertFalse(ComposerEditTools.showsBrackets(active: []))
    }

    func test_theBrackets_areMountedBehindTheCropTool() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("session.showsCropBrackets, let aspect = session.editAspect"))
    }

    func test_aPhoto_opensFullScreen_withItsToolsReachable_andCropsOnTap() {
        let photo = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        photo.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        XCTAssertTrue(photo.editChromeShown, "#10930 : les outils se posent sur la photo dès l'entrée")
        XCTAssertFalse(photo.showsCropBrackets)
        XCTAssertFalse(photo.editFramesScene, "montrer les outils ne réduit pas la photo")
        XCTAssertEqual(photo.editPanels, [])
        photo.toggleEditTool(.crop)
        XCTAssertTrue(photo.showsCropBrackets)
        XCTAssertTrue(photo.editFramesScene, "recadrer réduit la photo pour libérer ses bords")
        XCTAssertEqual(photo.editPanels, [.presets], "les proportions retiennent leur bande sous la scène")
        photo.hideEditChrome()
        XCTAssertFalse(photo.showsCropBrackets)
        XCTAssertFalse(photo.editFramesScene, "le chrome caché, la photo reprend l'écran")
        photo.revealEditChrome()
        XCTAssertTrue(photo.showsCropBrackets, "les outils reviennent comme on les a laissés")
        photo.toggleEditTool(.trim)
        XCTAssertEqual(photo.editTools, [.crop], "une photo ne se coupe pas")
    }

    // MARK: - (3) Les outils d'une vidéo, ensemble et chacun pour soi

    func test_aVideo_opensFullScreen_withTheRailAndNoToolOpen() async {
        let (session, _) = await videoSession()
        XCTAssertTrue(session.editChromeShown, "le rail est atteignable dès l'entrée")
        XCTAssertEqual(session.activeEditTools, [], "porteur 2026-10-20 : aucun outil ouvert")
        XCTAssertEqual(session.editPanels, [])
        XCTAssertFalse(session.showsCropBrackets)
        session.toggleEditTool(.trim)
        session.toggleEditTool(.sound)
        XCTAssertEqual(session.editPanels, [.trim], "le spectre se peint sur la coupe")
        XCTAssertFalse(session.editFramesScene, "la coupe se pose par-dessus la vidéo, qui garde l'écran")
        session.toggleEditTool(.crop)
        XCTAssertTrue(session.editFramesScene)
        XCTAssertEqual(session.editPanels, [.presets, .trim])
        session.toggleEditTool(.trim)
        XCTAssertEqual(session.editPanels, [.presets, .sound], "Couper se retire seul")
        XCTAssertTrue(session.showsCropBrackets, "les équerres restent")
        session.toggleEditTool(.trim)
        session.toggleFamily(.filters)
        XCTAssertEqual(session.editPanels, [.band])
        XCTAssertEqual(session.activeEditTools, [.crop, .trim, .sound], "la bande replie les panneaux, rien ne s'éteint")
        session.toggleFamily(.filters)
        XCTAssertEqual(session.editPanels, [.presets, .trim], "la bande repliée, ils reviennent")
        session.hideEditChrome()
        XCTAssertEqual(session.editPanels, [], "le glissé vers le bas rend tout l'écran à la vidéo")
        XCTAssertFalse(session.editFramesScene)
        session.revealEditChrome()
        XCTAssertEqual(session.activeEditTools, [.crop, .trim, .sound], "les outils reviennent comme on les a laissés")
        session.cancelEditing()
        XCTAssertEqual(session.activeEditTools, [])
        XCTAssertEqual(session.editPanels, [])
        XCTAssertFalse(session.editChromeShown)
    }

    func test_tappingAFoldedTool_closesTheBand_andShowsIt() async {
        let (session, _) = await videoSession()
        session.toggleEditTool(.trim)
        session.toggleFamily(.frames)
        session.toggleEditTool(.sound)
        XCTAssertNil(session.openFamily, "le toucher d'un outil replie la bande")
        XCTAssertEqual(session.activeEditTools, [.trim, .sound])
        XCTAssertEqual(session.editPanels, [.trim])
        XCTAssertTrue(session.shownEditTools.contains(.sound), "le son, lui, se montre sur la coupe")
    }

    // MARK: - #10930 — le glissé vertical montre et cache le chrome

    func test_theEditSwipe_upReveals_downHides_andTheCropKeepsTheFinger() {
        let seuil = ComposerEditSwipe.threshold
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 2, height: -20), zoomed: false, cropping: false),
                       .swipe, "vertical : c'est un glissé de chrome")
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 30, height: 4), zoomed: false, cropping: false),
                       .reframe, "horizontal : le doigt cadre le média")
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 0, height: -40), zoomed: true, cropping: false),
                       .reframe, "un média agrandi se déplace")
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 0, height: -40), zoomed: false, cropping: true),
                       .reframe, "en recadrage, le doigt cadre")
        XCTAssertEqual(ComposerEditSwipe.outcome(translationY: -seuil), .reveal)
        XCTAssertEqual(ComposerEditSwipe.outcome(translationY: seuil), .hide)
        XCTAssertEqual(ComposerEditSwipe.outcome(translationY: seuil / 2), .none, "une hésitation ne décide rien")
    }

    /// **#10930 — un toucher sur la prise montre ou cache ses outils**, comme
    /// dans la visionneuse : en retouche, il visait un objectif qui se repose
    /// et ne faisait RIEN — le geste universel était mort.
    func test_aTapOnTheTake_togglesItsTools() {
        let retouche = ComposerCaptureGestureContext(editing: true)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .tap, context: retouche),
                       .toggleEditChrome)
        let photo = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        photo.perform(.toggleEditChrome, item: nil)
        XCTAssertFalse(photo.editChromeShown, "hors retouche, rien à montrer")
        photo.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        photo.perform(.toggleEditChrome, item: nil)
        XCTAssertFalse(photo.editChromeShown, "le toucher rend tout l'écran à la photo")
        photo.perform(.toggleEditChrome, item: nil)
        XCTAssertTrue(photo.editChromeShown, "le suivant rend les outils")
    }

    /// **Lecture et volume, en haut à droite sous « Terminé »** (porteur
    /// 2026-10-20 ; recette iPhone 18 Pro Max du même jour : posés au coin bas
    /// de la scène plein écran, la pause tombait sur « Couper » et le volume sur
    /// « Son »). Ni le rail, ni la coupe, ni une bande ouverte, ni les crochets
    /// d'une scène recadrée ne les touchent, à 375 comme à 440 pt.
    func test_playbackRow_sitsUnderTheDoneRow_clearOfRailCutAndBrackets_at375And440() {
        let ecrans = [CGSize(width: 375, height: 812 - 47 - 34), CGSize(width: 440, height: 956 - 62 - 34)]
        let panneaux: [[ComposerEditPanel]] = [[], [.trim], [.sound], [.band]]
        for ecran in ecrans {
            for son in [true, false] {
                let rangee = ComposerEditPlaybackLayout.frame(container: ecran, hasAudio: son)
                XCTAssertGreaterThanOrEqual(rangee.minY, ComposerEditScene.topBand, "\(ecran) : sous la ligne de « Terminé »")
                XCTAssertEqual(rangee.maxX, ecran.width - ComposerEditScene.margin, accuracy: 0.001, "\(ecran) : à droite")
                XCTAssertEqual(rangee.height, MeeshyControlSize.tapTarget, "cible de 44 pt")
                for p in panneaux {
                    let bas = ecran.height - ComposerEditScene.bottomReserve(p)
                    XCTAssertLessThanOrEqual(rangee.maxY, bas, "\(ecran) \(p) : ni rail, ni coupe, ni bande")
                    let zone = ComposerEditScene.area(container: ecran, top: 0, bottom: 0, panels: p,
                                                      framed: true, playback: true)
                    let scene = ComposerEditScene.rect(aspect: ComposerEditScene.clampedAspect(ecran.width / ecran.height),
                                                       in: zone)
                    XCTAssertGreaterThanOrEqual(scene.minY, rangee.maxY, "\(ecran) \(p) : la scène recadrée commence dessous")
                }
            }
            let rail = CGRect(x: 0, y: ecran.height - ComposerEditScene.gap - ComposerEditScene.toolsRow,
                              width: ecran.width, height: ComposerEditScene.toolsRow)
            XCTAssertFalse(ComposerEditPlaybackLayout.frame(container: ecran, hasAudio: true).intersects(rail))
        }
    }

    func test_theSceneTap_isRoutedThroughTheTable_inEditing() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureGesture.action(zone: .scene, gesture: .tap, context: context)"),
                      "le toucher de la nappe consulte la table avant de viser")
    }

    /// **Les formats : une bande pleine largeur SOUS la scène** (porteur
    /// 2026-10-20 : « le moins coupés possible […] hors viewport ou hors cadre
    /// de la scène »). D'un bord de l'écran à l'autre, sous le cadre — aucun
    /// crochet ne la coupe —, au-dessus du rail des outils, à 375 et 440 pt.
    func test_thePresetsBand_spansTheScreen_underTheScene_clearOfBracketsAndRail() {
        let ecrans = [CGSize(width: 375, height: 812 - 47 - 34), CGSize(width: 440, height: 956 - 62 - 34)]
        let cible = MeeshyControlSize.tapTarget
        for ecran in ecrans {
            for (panneaux, lecture) in [([ComposerEditPanel.presets], false), ([.presets, .trim], true)] {
                for aspect in [ComposerEditScene.clampedAspect(ecran.width / ecran.height), 1, 16.0 / 9.0] {
                    let zone = ComposerEditScene.area(container: ecran, top: 0, bottom: 0, panels: panneaux,
                                                      framed: true, playback: lecture)
                    let scene = ComposerEditScene.rect(aspect: aspect, in: zone)
                    let bande = ComposerEditPresetsLayout.frame(scene: scene)
                    XCTAssertEqual(bande.minX, 0, accuracy: 0.001, "\(ecran) : la bande part du bord gauche de l'écran")
                    XCTAssertEqual(bande.maxX, ecran.width, accuracy: 0.001, "\(ecran) : jusqu'au bord droit")
                    XCTAssertGreaterThanOrEqual(bande.minY, scene.maxY, "\(ecran) \(aspect) : sous le cadre")
                    let crochetsBas = [CGRect(x: scene.minX, y: scene.maxY - cible, width: cible, height: cible),
                                       CGRect(x: scene.maxX - cible, y: scene.maxY - cible, width: cible, height: cible)]
                    XCTAssertFalse(crochetsBas.contains { $0.intersects(bande) }, "\(ecran) \(aspect) : aucun crochet ne la coupe")
                    let haut = ecran.height - ComposerEditScene.bottomReserve(panneaux.filter { $0 != .presets })
                    XCTAssertLessThanOrEqual(bande.maxY, haut + 0.001,
                                             "\(ecran) \(panneaux) \(aspect) : au-dessus de la coupe et du rail")
                }
            }
        }
    }

    /// **Aucun libellé du rail n'est coupé** (porteur 2026-10-20) : à 375 comme
    /// à 440 pt, chaque entrée du rail d'une vidéo (six outils) garde au moins
    /// la largeur entière de son nom — le rail défile plutôt que de rogner.
    func test_theEditRail_neverTruncatesALabel_at375And440() async {
        let (session, _) = await videoSession()
        let noms = ComposerLookFamily.allCases.map(ComposerCaptureCopy.familyName)
            + session.editTools.map(ComposerCaptureCopy.editToolName)
        for largeur in [CGFloat(375), 440] {
            let ecran = RenderedScreen(ComposerCaptureBottomRow(session: session, context: session.gestureContext)
                                        .frame(width: largeur),
                                       size: CGSize(width: largeur, height: 400))
            for nom in noms {
                let ideal = UIHostingController(rootView: Text(nom)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold)))
                    .sizeThatFits(in: CGSize(width: 1_000, height: 100)).width
                let cadre = ecran.nodes.first { $0.label == nom }?.frame
                XCTAssertNotNil(cadre, "\(largeur) : « \(nom) » est rendu")
                XCTAssertGreaterThanOrEqual(cadre?.width ?? 0, ideal - 0.5, "\(largeur) : « \(nom) » est coupé")
            }
            ecran.dismount()
        }
    }

    func test_theOverlayChrome_isWired() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("session.revealEditChrome()"))
        XCTAssertTrue(chrome.contains("session.hideEditChrome()"))
        XCTAssertTrue(chrome.contains("ComposerCropPresetBar("), "les formats sont posés sur la scène")
        XCTAssertTrue(chrome.contains("ComposerEditPresetsLayout.frame("))
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertFalse(bas.contains("ComposerCropPresetBar("), "plus de rangée de formats sous la scène")
        let montage = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureMount.swift")
        XCTAssertTrue(montage.contains("framed: session.editFramesScene"), "l'image ne se réduit qu'au recadrage")
    }

    // MARK: - (2) Son : spectre, ligne de volume, bouton muet

    /// **#10356 — « Son » ne rétrécit plus la scène.** Le spectre se pose sur
    /// la bande vidéo depuis #10341 ; il ne réserve donc aucune hauteur, et la
    /// scène garde la taille qu'elle a sans lui.
    func test_10356_theSoundTool_reservesNoHeight_whileTheCutIsShown() {
        let avecSon = ComposerEditTools.panels(familyOpen: false, active: [.crop, .trim, .sound])
        let sansSon = ComposerEditTools.panels(familyOpen: false, active: [.crop, .trim])
        XCTAssertEqual(ComposerEditScene.bottomReserve(avecSon), ComposerEditScene.bottomReserve(sansSon))
        let ecran = CGSize(width: 402, height: 874)
        XCTAssertEqual(ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: avecSon),
                       ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: sansSon),
                       "allumer « Son » ne déplace pas la scène")
    }

    func test_10356_playbackRow_hasOneTargetPerButton_andSaysItsAction() {
        let cible = MeeshyControlSize.tapTarget
        let ecran = CGSize(width: 402, height: 790)
        let deux = ComposerEditPlaybackLayout.frame(container: ecran, hasAudio: true)
        XCTAssertEqual(deux.width, cible * 2 + ComposerEditPlaybackLayout.spacing, accuracy: 0.001)
        XCTAssertEqual(ComposerEditPlaybackLayout.frame(container: ecran, hasAudio: false).width, cible, accuracy: 0.001,
                       "un clip muet n'a que la lecture")
        XCTAssertNotEqual(ComposerCaptureCopy.playbackLabel(paused: true),
                          ComposerCaptureCopy.playbackLabel(paused: false), "« Lire » et « Pause »")
    }

    func test_10356_theMuteButton_leftTheBand_forTheScene() throws {
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertFalse(bas.contains("ComposerTakeMuteButton("), "plus de bouton muet sur la bande")
        XCTAssertFalse(bas.contains("toggleTakeMute"))
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerEditPlaybackControls("), "lecture et muet sont montés sur la scène")
        XCTAssertTrue(chrome.contains("onTogglePlayback: { session.toggleEditPlayback() }"))
        XCTAssertTrue(chrome.contains("onToggleMute: { session.toggleTakeMute() }"))
        XCTAssertTrue(chrome.contains("ComposerEditPlaybackLayout.frame(container: proxy.size, hasAudio: session.takeHasAudio)"),
                      "la rangée se pose par la règle que le témoin de géométrie éprouve")
    }

    func test_aSilentClip_offersNoSoundTool() async {
        let (session, _) = await videoSession(hasAudio: false)
        XCTAssertEqual(session.editTools, [.crop, .trim])
        session.toggleEditTool(.trim)
        XCTAssertEqual(session.activeEditTools, [.trim], "« Couper » seul, sans spectre")
        session.toggleEditTool(.sound)
        XCTAssertEqual(session.activeEditTools, [.trim], "un outil que la prise n'offre pas ne s'active pas")
    }

    func test_takeSound_gainFollowsTheLine_andMuteRemembersTheGain() {
        XCTAssertEqual(ComposerTakeSound.gain(atY: 0, height: 52), 2, "en haut 200 % (#10341)")
        XCTAssertEqual(ComposerTakeSound.gain(atY: 52, height: 52), 0, "en bas le silence")
        XCTAssertEqual(ComposerTakeSound.gain(atY: 26, height: 52), 1, accuracy: 0.0001, "100 % au milieu")
        XCTAssertEqual(ComposerTakeSound.gain(atY: -40, height: 52), 2, "borné")
        XCTAssertEqual(ComposerTakeSound.lineY(gain: 1, height: 52), 26, accuracy: 0.0001, "le son intact au milieu")
        XCTAssertEqual(ComposerTakeSound.lineY(gain: 0.5, height: 52), 39, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeSound.percent(2), 200)
        var son = ComposerTakeSound(gain: 0.4)
        XCTAssertEqual(son.effectiveGain, 0.4, accuracy: 0.0001)
        son.muted = true
        XCTAssertEqual(son.effectiveGain, 0)
        son.muted = false
        XCTAssertEqual(son.effectiveGain, 0.4, accuracy: 0.0001, "réactiver rend le gain d'avant")
        XCTAssertTrue(ComposerTakeSound().isUntouched)
        XCTAssertEqual(ComposerTakeSound.stepped(1.95, up: true), 2)
    }

    func test_session_appliesGainAndMuteToThePreview_andResetsWithTheEdit() async {
        let (session, lecteur) = await videoSession()
        session.setTakeGain(0.3)
        XCTAssertEqual(lecteur.volumes.last ?? -1, 0.3, accuracy: 0.0001, "l'aperçu entend le gain")
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last, 0, "muet : plus rien")
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last ?? -1, 0.3, accuracy: 0.0001)
        session.isRenderingLook = true
        session.setTakeGain(1)
        XCTAssertEqual(session.takeSound.gain, 0.3, accuracy: 0.0001, "pendant le rendu, plus rien ne bouge")
        session.isRenderingLook = false
        session.cancelEditing()
        XCTAssertEqual(session.takeSound, ComposerTakeSound(), "la retouche suivante repart du son intact")
    }

    func test_theFinalRender_carriesTheGain_throughTheSingleRecipe() throws {
        let edition = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertTrue(edition.contains("let gain = takeSound.effectiveGain"))
        XCTAssertTrue(edition.contains("declaredSpaceName: espace, audioGain: gain)"),
                      "« Terminé » et ⬇︎ exportent par la même recette, son compris")
        XCTAssertEqual(edition.components(separatedBy: "ComposerLookVideoExporter.export(").count - 1, 1,
                       "une seule recette de rendu vidéo")
        let export = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("|| audioGain != 1"), "un son réglé force le rendu")
        XCTAssertTrue(export.contains("session.audioMix = audioMix"), "le gain part dans le fichier")
        XCTAssertTrue(export.contains("setVolume("))
    }

    // MARK: - Le gain au-delà de 100 % s'entend dans l'aperçu (#10360)

    func test_takeGain_splitsIntoAnAttenuationAndABoost() {
        XCTAssertEqual(ComposerTakeGain.volume(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeGain.boost(0.5), 1, "sous 100 %, rien à amplifier")
        XCTAssertEqual(ComposerTakeGain.volume(1), 1)
        XCTAssertEqual(ComposerTakeGain.boost(1), 1)
        XCTAssertEqual(ComposerTakeGain.volume(1.5), 1, "au-dessus de 100 %, le volume reste plein")
        XCTAssertEqual(ComposerTakeGain.boost(1.5), 1.5, accuracy: 0.0001, "et le tap amplifie le reste")
        XCTAssertEqual(ComposerTakeGain.boost(2), 2)
        XCTAssertEqual(ComposerTakeGain.boost(9), 2, "borné à 200 %")
        XCTAssertEqual(ComposerTakeGain.volume(0), 0, "muet")
        XCTAssertEqual(ComposerTakeGain.volume(.nan), 1)
        XCTAssertEqual(ComposerTakeGain.boost(.nan), 1)
    }

    func test_amplifiedSample_isLinearBelowTheKnee_andSoftClipsAbove() {
        XCTAssertEqual(ComposerTakeGain.amplified(0.7, boost: 1), 0.7, "sans amplification, intact")
        XCTAssertEqual(ComposerTakeGain.amplified(0.1, boost: 2), 0.2, accuracy: 0.0001, "200 % double le son")
        XCTAssertEqual(ComposerTakeGain.amplified(-0.2, boost: 1.5), -0.3, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeGain.amplified(0.4, boost: 2), 0.8, accuracy: 0.0001, "le genou lui-même")
        let fort = ComposerTakeGain.amplified(1, boost: 2)
        XCTAssertGreaterThan(fort, ComposerTakeGain.knee, "au-delà du genou, le son monte encore")
        XCTAssertLessThan(fort, 1, "sans jamais atteindre la pleine échelle : pas de craquement")
        XCTAssertEqual(ComposerTakeGain.amplified(-1, boost: 2), -fort, accuracy: 0.0001, "symétrique")
        XCTAssertLessThan(ComposerTakeGain.amplified(0.6, boost: 2), fort, "monotone")
        XCTAssertEqual(ComposerTakeGain.amplified(0.4001, boost: 2), 0.8002, accuracy: 0.001, "continu au genou")
    }

    func test_boostTap_amplifiesEverySampleOfEveryBuffer() {
        var echantillons: [Float] = [0.1, -0.2, 0.3, 1]
        echantillons.withUnsafeMutableBytes { octets in
            var liste = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(
                mNumberChannels: 1, mDataByteSize: UInt32(octets.count), mData: octets.baseAddress))
            ComposerTakeBoostTap.amplify(&liste, boost: 2)
        }
        XCTAssertEqual(echantillons[0], 0.2, accuracy: 0.0001)
        XCTAssertEqual(echantillons[1], -0.4, accuracy: 0.0001)
        XCTAssertEqual(echantillons[2], 0.6, accuracy: 0.0001)
        XCTAssertEqual(echantillons[3], ComposerTakeGain.amplified(1, boost: 2), accuracy: 0.0001)
        var intacts: [Float] = [0.5, -0.5]
        intacts.withUnsafeMutableBytes { octets in
            var liste = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(
                mNumberChannels: 1, mDataByteSize: UInt32(octets.count), mData: octets.baseAddress))
            ComposerTakeBoostTap.amplify(&liste, boost: 1)
        }
        XCTAssertEqual(intacts, [0.5, -0.5], "à 100 %, le tap ne touche rien")
    }

    func test_boostTap_acceptsOnlyFloat32() {
        var flottant = AudioStreamBasicDescription()
        flottant.mFormatID = kAudioFormatLinearPCM
        flottant.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsNonInterleaved
        flottant.mBitsPerChannel = 32
        XCTAssertTrue(ComposerTakeBoostTap.acceptsFloats(flottant))
        var entier = flottant
        entier.mFormatFlags = kAudioFormatFlagIsSignedInteger
        entier.mBitsPerChannel = 16
        XCTAssertFalse(ComposerTakeBoostTap.acceptsFloats(entier), "un format inattendu passe intact")
    }

    func test_boostTap_mixPutsATapOnEveryTrack_sharingOneLevel() throws {
        let niveau = ComposerTakeBoostLevel()
        XCTAssertNotNil(ComposerTakeBoostTap.make(niveau), "le système crée le tap")
        let mixage = try XCTUnwrap(ComposerTakeBoostTap.audioMix(trackIDs: [1, 2], volume: 1, level: niveau))
        XCTAssertEqual(mixage.inputParameters.map(\.trackID), [1, 2])
        XCTAssertTrue(mixage.inputParameters.allSatisfy { $0.audioTapProcessor != nil })
        XCTAssertNil(ComposerTakeBoostTap.audioMix(trackIDs: [], volume: 1, level: niveau), "sans son, pas de mixage")
        niveau.boost = 1.5
        XCTAssertEqual(niveau.boost, 1.5, accuracy: 0.0001, "le tap lit le niveau qu'on règle, sans se reconstruire")
        niveau.boost = 7
        XCTAssertEqual(niveau.boost, 2)
        XCTAssertEqual(ComposerTakeBoostLevel(boost: 0.3).boost, 1, "un niveau n'atténue jamais")
    }

    func test_session_passesTheGainAbove100_toThePreview() async {
        let (session, lecteur) = await videoSession()
        session.setTakeGain(1.5)
        XCTAssertEqual(lecteur.volumes.last ?? -1, 1.5, accuracy: 0.0001, "l'aperçu reçoit le gain réel, pas 1")
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last, 0)
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last ?? -1, 1.5, accuracy: 0.0001, "rétabli, le son amplifié revient")
    }

    /// Le niveau vit sur le lecteur, et chaque élément qui joue — boucle
    /// reconstruite, frame sous la règle, filet du tick — porte son tap.
    func test_theLoopPlayer_andTheRender_serveTheSameGainLaw() throws {
        let boucle = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerEditSources.swift")
        XCTAssertTrue(boucle.contains("player.volume = ComposerTakeGain.volume(gain)"))
        XCTAssertTrue(boucle.contains("boostLevel.boost = ComposerTakeGain.boost(gain)"))
        XCTAssertFalse(boucle.contains("max(0, min(1, gain))"), "l'aperçu ne borne plus le gain à 100 %")
        XCTAssertGreaterThanOrEqual(boucle.components(separatedBy: "attachBoost(to: element)").count - 1, 3,
                                    "la boucle reconstruite, la règle et le filet portent chacun le tap")
        XCTAssertTrue(boucle.contains("level: boostLevel"), "un seul niveau, partagé par tous les éléments")
        let export = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("ComposerTakeBoostTap.audioMix("), "le rendu amplifie par le même tap")
        XCTAssertTrue(export.contains("ComposerTakeGain.volume(gain)"))
        XCTAssertFalse(export.contains("max(0, min(1, gain))"))
    }

    // MARK: - (4) La frame exacte sous la règle

    func test_seekChase_oneSeekInFlight_thenOnlyTheLatestTarget() {
        var chasse = ComposerSeekChase()
        XCTAssertEqual(chasse.request(1), 1, "rien ne vole : on cherche tout de suite")
        XCTAssertNil(chasse.request(1.5), "une recherche vole : la cible attend")
        XCTAssertNil(chasse.request(2))
        XCTAssertEqual(chasse.completed(), 2, "seule la DERNIÈRE cible part — l'aperçu finit sous le doigt")
        XCTAssertNil(chasse.completed())
        XCTAssertEqual(chasse.request(3), 3)
        XCTAssertEqual(ComposerSeekChase.tolerance, .zero, "tolérance nulle : la frame EXACTE")
    }

    func test_movingAHandle_scrubsToItsBound_andTheEndOfTheGestureRelaunchesTheLoop() async {
        let (session, lecteur) = await videoSession()
        XCTAssertEqual(ComposerTrimRule.scrubTime(handle: .start, range: 1...4), 1)
        XCTAssertEqual(ComposerTrimRule.scrubTime(handle: .end, range: 1...4), 4)
        session.setTrim(0...6, committed: false)
        session.scrubTrim(to: 2.5)
        session.scrubTrim(to: 99)
        XCTAssertEqual(lecteur.scrubs, [2.5, 6], "borné au clip")
        let avant = lecteur.ranges.count
        session.setTrim(0...6, committed: true)
        XCTAssertEqual(lecteur.ranges.count, avant + 1, "même plage : la boucle suspendue repart quand même")
        XCTAssertFalse(session.trimScrubbing)
    }

    func test_theTrack_scrubsWhileAHandleMoves() throws {
        let piste = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerTrimTrack.swift")
        XCTAssertTrue(piste.contains("session.scrubTrim(to: ComposerTrimRule.scrubTime(handle: poignee, range: nouvelle))"))
        let lecteur = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerEditSources.swift")
        XCTAssertTrue(lecteur.contains("toleranceBefore: ComposerSeekChase.tolerance"))
        XCTAssertTrue(lecteur.contains("chase.request("), "une recherche à la fois")
    }

    // MARK: - Le rail : les outils après les familles, qui rebondissent

    func test_theRail_listsTheTakeTools_andEveryEditControlBounces() throws {
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("editTools: session.editTools"))
        XCTAssertTrue(bas.contains("ForEach(session.editPanels, id: \\.self)"), "chaque outil actif a son panneau")
        XCTAssertTrue(bas.contains("ComposerSoundTrack("), "le spectre en couleur")
        let rail = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(rail.contains(".buttonStyle(ComposerBounceButtonStyle())"))
        let son = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSoundTrack.swift")
        XCTAssertTrue(son.contains("accessibilityAdjustableAction"), "VoiceOver règle le volume")
        XCTAssertTrue(son.contains(".buttonStyle(ComposerBounceButtonStyle())"), "lecture et muet rebondissent")
    }
}
