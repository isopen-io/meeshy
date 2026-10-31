import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **Un élément sélectionné : une seule barre d'actions libellées** (#13839, L5,
/// maquette validée le 2026-10-30, état 3).
///
/// Modifier · Ordre · Dupliquer · Temps · Retirer, servies par famille par une
/// loi pure : une action sans effet n'est pas servie (loi 4), et le menu d'appui
/// long n'en est qu'un raccourci.
final class ComposerSelectionActionsTests: XCTestCase {

    private let toutesLesActions: [StoryCanvasContextAction] =
        [.edit, .trim, .duplicate, .bringForward, .sendBackward, .setAsBackground, .delete]

    // MARK: - La barre, par famille

    func test_served_textAmongOthers_servesTheFiveActionsInOrder() {
        let actions = ComposerSelectionActions.served(family: .text,
                                                      offered: [.edit, .duplicate, .bringForward, .sendBackward, .delete],
                                                      isLocked: false)
        XCTAssertEqual(actions, [.modify, .order, .duplicate, .time, .remove])
    }

    func test_served_textAloneOnTheScene_servesNoOrder() {
        let actions = ComposerSelectionActions.served(family: .text, offered: [.edit, .duplicate, .delete],
                                                      isLocked: false)
        XCTAssertFalse(actions.contains(.order), "rien à mettre devant ni derrière : Ordre n'aurait aucun effet")
        XCTAssertEqual(actions.last, .remove, "Retirer reste à l'autre bout de la barre")
    }

    func test_served_lockedRepostBadge_servesOnlyTheOrder() {
        let actions = ComposerSelectionActions.served(family: .text, offered: [.bringForward, .sendBackward],
                                                      isLocked: true)
        XCTAssertEqual(actions, [.order], "le badge d'attribution ne se modifie, ne se copie, ni ne se retire")
    }

    func test_served_background_servesModifyOrderAndRemoveOnly() {
        let actions = ComposerSelectionActions.served(family: .background(isVideo: false),
                                                      offered: [.duplicate, .delete], isLocked: false)
        XCTAssertEqual(actions, [.modify, .order, .remove],
                       "un fond dure la slide entière et ne se duplique pas en second fond")
    }

    func test_served_stickerWithEditor_servesModify() {
        let actions = ComposerSelectionActions.served(family: .sticker, offered: toutesLesActions, isLocked: false)
        XCTAssertEqual(actions, [.modify, .order, .duplicate, .time, .remove])
    }

    // MARK: - Ordre

    func test_order_foregroundImageOverABackground_offersFrontBackAndBackground() {
        let ordre = ComposerSelectionActions.order(family: .image,
                                                   offered: [.edit, .bringForward, .sendBackward,
                                                             .replaceBackground, .delete])
        XCTAssertEqual(ordre, [.forward, .backward, .makeBackground(replacing: true)])
    }

    func test_order_background_offersToComeForward() {
        XCTAssertEqual(ComposerSelectionActions.order(family: .background(isVideo: true), offered: []),
                       [.foreground])
    }

    func test_order_leaveSceneOffered_comesLast() {
        let ordre = ComposerSelectionActions.order(family: .image,
                                                   offered: [.leaveScene, .bringForward, .setAsBackground])
        XCTAssertEqual(ordre, [.forward, .makeBackground(replacing: false), .leaveScene])
    }

    // MARK: - Modifier, par famille

    func test_modifyRoute_eachFamilyOpensItsOwnEditor() {
        XCTAssertEqual(ComposerSelectionActions.modifyRoute(.text), .typing)
        XCTAssertEqual(ComposerSelectionActions.modifyRoute(.image), .mediaSheet)
        XCTAssertEqual(ComposerSelectionActions.modifyRoute(.video), .mediaSheet)
        XCTAssertEqual(ComposerSelectionActions.modifyRoute(.background(isVideo: false)), .mediaSheet)
        XCTAssertEqual(ComposerSelectionActions.modifyRoute(.sticker), .stickerSheet)
        XCTAssertEqual(ComposerSelectionActions.modifyRoute(.audio), .soundSheet)
        XCTAssertEqual(ComposerSelectionActions.modifyRoute(.place), .placeSheet)
    }

    func test_mediaSheetExtras_backgroundPhotoWithCamera_offersRetakeAndSticker() {
        XCTAssertEqual(ComposerSelectionActions.mediaExtras(family: .background(isVideo: false),
                                                            cameraTakesPhotos: true, subjectLiftAvailable: true),
                       [.makeSticker, .retakePhoto])
    }

    func test_mediaSheetExtras_video_offersNeither() {
        XCTAssertEqual(ComposerSelectionActions.mediaExtras(family: .video, cameraTakesPhotos: true,
                                                            subjectLiftAvailable: true), [])
    }

    func test_mediaSheetExtras_foregroundImageWithoutLift_offersNothing() {
        XCTAssertEqual(ComposerSelectionActions.mediaExtras(family: .image, cameraTakesPhotos: true,
                                                            subjectLiftAvailable: false), [])
    }

    // MARK: - Le menu d'appui long n'est qu'un raccourci

    func test_shortcutMenu_isASubsetOfTheBar() {
        for famille: ComposerInlineFamily in [.text, .image, .video, .sticker, .place, .audio] {
            let barre = ComposerSelectionActions.served(family: famille, offered: toutesLesActions, isLocked: false)
            let menu = ComposerSelectionActions.menuActions(family: famille, offered: toutesLesActions, isLocked: false)
            for action in menu {
                let porte = ComposerSelectionActions.shortcut(action)
                XCTAssertNotNil(porte, "\(action) n'a pas de jumelle dans la barre")
                XCTAssertTrue(porte.map(barre.contains) ?? false, "\(action) ouvre ce que la barre ne sert pas")
            }
        }
    }

    func test_shortcutMenu_dropsTrim_whichLivesInModify() {
        XCTAssertNil(ComposerSelectionActions.shortcut(.trim))
        XCTAssertFalse(ComposerSelectionActions.menuActions(family: .video, offered: toutesLesActions,
                                                            isLocked: false).contains(.trim))
    }

    // MARK: - Après Dupliquer, la copie est sélectionnée

    /// **La copie prend la sélection** : le modèle la sélectionne, le cadre et
    /// la barre la suivent. Restés sur la source, ils désignaient l'objet du
    /// dessous pendant que l'auteur saisissait celui du dessus.
    func test_selectionAfterDuplicate_copyOnTheSlide_selectsTheCopy() {
        var avant = StorySlide()
        let source = StoryTextObject(text: "Bonjour")
        avant.effects.textObjects = [source]
        var apres = avant
        let copie = StoryTextObject(text: "Bonjour")
        apres.effects.textObjects = [source, copie]
        XCTAssertEqual(ComposerSelectionActions.selectionAfterDuplicate(source: source.id, before: avant, after: apres),
                       copie.id)
    }

    /// Rien copié (plafond atteint, badge verrouillé) : la source reste sélectionnée.
    func test_selectionAfterDuplicate_nothingCopied_keepsTheSource() {
        var slide = StorySlide()
        let source = StoryTextObject(text: "Bonjour")
        slide.effects.textObjects = [source]
        XCTAssertEqual(ComposerSelectionActions.selectionAfterDuplicate(source: source.id, before: slide, after: slide),
                       source.id)
    }

    // MARK: - Toucher l'objet dont la feuille est ouverte

    /// **Toucher l'objet qu'on règle ne referme pas sa feuille** : on touche
    /// l'image pour la voir, pas pour quitter son filtre.
    func test_editAfterSelecting_theEditedObject_keepsItsSheet() {
        let edition = ComposerInlineEdit(objectId: "img", family: .image, openSection: .media(.filter))
        XCTAssertEqual(ComposerInlineEditing.edit(edition, afterSelecting: "img"), edition)
    }

    func test_editAfterSelecting_anotherObject_closesTheSheet() {
        let edition = ComposerInlineEdit(objectId: "img", family: .image, openSection: .media(.filter))
        XCTAssertNil(ComposerInlineEditing.edit(edition, afterSelecting: "texte"))
        XCTAssertNil(ComposerInlineEditing.edit(nil, afterSelecting: "img"))
    }

    // MARK: - Toucher la scène à vide

    func test_emptyTap_withASelection_deselectsAndNeverArmsTheViewfinder() {
        XCTAssertEqual(ComposerSceneEmptyTap.outcome(hadSelection: true, effectIsOpen: false,
                                                     quickCaptureOffered: true, backgroundMediaId: "bg"),
                       .deselect)
    }

    func test_emptyTap_blankSceneNothingSelected_armsTheViewfinder() {
        XCTAssertEqual(ComposerSceneEmptyTap.outcome(hadSelection: false, effectIsOpen: false,
                                                     quickCaptureOffered: true, backgroundMediaId: nil),
                       .armViewfinder)
    }

    func test_emptyTap_mediaBackgroundNothingSelected_selectsTheBackground() {
        XCTAssertEqual(ComposerSceneEmptyTap.outcome(hadSelection: false, effectIsOpen: false,
                                                     quickCaptureOffered: false, backgroundMediaId: "bg"),
                       .selectBackground("bg"))
    }

    func test_emptyTap_openEffectCarousel_closesItFirst() {
        XCTAssertEqual(ComposerSceneEmptyTap.outcome(hadSelection: false, effectIsOpen: true,
                                                     quickCaptureOffered: false, backgroundMediaId: "bg"),
                       .closeEffect)
    }

    // MARK: - Le repos cède à la sélection

    func test_restChrome_withASelection_hidesTheToolColumnAndKeepsTheTopRow() {
        let etat = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                            bottomPanelIsOpen: false, timelineIsOpen: false, objectIsSelected: true)
        XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(etat), "les outils se retirent")
        XCTAssertTrue(ComposerRestChrome.topRowIsShown(etat), "✕ et ↶ ↷ restent")
        XCTAssertTrue(ComposerRestChrome.selectionBarIsShown(etat))
    }

    func test_restChrome_atRest_showsNoSelectionBar() {
        let etat = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                            bottomPanelIsOpen: false, timelineIsOpen: false)
        XCTAssertFalse(ComposerRestChrome.selectionBarIsShown(etat))
        XCTAssertTrue(ComposerRestChrome.toolColumnIsShown(etat))
    }

    // MARK: - Temps

    func test_timeSheet_offersKeyframesOnlyOnAnAnimatedScene() {
        XCTAssertTrue(ComposerObjectTimeSheetRule.offersKeyframes(animated: true))
        XCTAssertFalse(ComposerObjectTimeSheetRule.offersKeyframes(animated: false))
    }
}

/// **Le sticker se pose À CÔTÉ de ce qui existe, et se remplace EN PLACE**
/// (#13839, L5, inventaire H5 et H6).
@MainActor
final class SceneStickerSelectionTests: XCTestCase {

    func test_spot_sceneWithATextAtTheCentre_avoidsIt() {
        let point = SceneStickerSpot.spot(avoiding: [CGPoint(x: 0.5, y: 0.5)])
        let ecart = hypot(point.x - 0.5, point.y - 0.5)
        XCTAssertGreaterThanOrEqual(ecart, SceneStickerSpot.clearance)
    }

    func test_spot_emptyScene_isTheCentre() {
        XCTAssertEqual(SceneStickerSpot.spot(avoiding: []), CGPoint(x: 0.5, y: 0.5))
    }

    func test_spot_crowdedScene_takesTheFarthestCandidate() {
        let partout = SceneStickerSpot.candidates
        let point = SceneStickerSpot.spot(avoiding: partout)
        XCTAssertTrue(partout.contains(point), "à défaut de place libre, une place connue plutôt qu'un point au hasard")
    }

    func test_pose_emojiOverACentredText_landsOffTheText() throws {
        let vm = StoryComposerViewModel()
        let texte = try XCTUnwrap(vm.addText())
        let id = try XCTUnwrap(SceneStickerPose.pose(.emoji("😎"), on: vm))
        let sticker = try XCTUnwrap(vm.currentEffects.stickerObjects?.first { $0.id == id })
        let ecart = hypot(sticker.x - texte.x, sticker.y - texte.y)
        XCTAssertGreaterThanOrEqual(ecart, Double(SceneStickerSpot.clearance) - 0.001,
                                    "le sticker ne se pose plus par-dessus le texte")
    }

    func test_replacing_keepsPlacementAndTimingOfTheOldSticker() throws {
        var ancien = StorySticker(emoji: "😎", x: 0.2, y: 0.7)
        ancien.scale = 3
        ancien.rotation = 0.4
        ancien.zIndex = 7
        ancien.startTime = 1
        ancien.duration = 2
        let neuf = StorySticker(emoji: "🔥", x: 0.5, y: 0.5)
        var slide = StorySlide(id: "s")
        slide.effects.stickerObjects = [ancien, neuf]

        let remplacee = SceneStickerReplacement.replacing(ancien.id, with: neuf.id, in: slide)

        let stickers = try XCTUnwrap(remplacee.effects.stickerObjects)
        XCTAssertEqual(stickers.count, 1, "l'ancien part, le nouveau prend sa place")
        let pose = try XCTUnwrap(stickers.first)
        XCTAssertEqual(pose.emoji, "🔥")
        XCTAssertEqual(pose.x, 0.2)
        XCTAssertEqual(pose.y, 0.7)
        XCTAssertEqual(pose.scale, 3)
        XCTAssertEqual(pose.rotation, 0.4)
        XCTAssertEqual(pose.zIndex, 7)
        XCTAssertEqual(pose.startTime, 1)
        XCTAssertEqual(pose.duration, 2)
    }

    func test_replacing_unknownNewSticker_leavesTheSlideIntact() {
        var slide = StorySlide(id: "s")
        let ancien = StorySticker(emoji: "😎", x: 0.2, y: 0.7)
        slide.effects.stickerObjects = [ancien]
        XCTAssertEqual(SceneStickerReplacement.replacing(ancien.id, with: "absent", in: slide).effects.stickerObjects?.map(\.id),
                       [ancien.id])
    }

    func test_repointing_aPlaceBadge_keepsItsPlacementAndStyle() throws {
        var badge = StoryLocationObject(place: SharedPlace(latitude: 1, longitude: 2, name: "Avant"),
                                        x: 0.3, y: 0.6, styleId: "ticket")
        badge.rotation = 0.2
        var slide = StorySlide(id: "s")
        slide.locationObjects = [badge]
        let nouveau = SharedPlace(latitude: 48.88, longitude: 2.35, name: "Gare du Nord")

        let repointee = ComposerPlaceRepoint.repointing(badge.id, to: nouveau, in: slide)

        let lieu = try XCTUnwrap(repointee.locationObjects.first)
        XCTAssertEqual(lieu.place, nouveau)
        XCTAssertEqual(lieu.id, badge.id)
        XCTAssertEqual(lieu.x, 0.3)
        XCTAssertEqual(lieu.styleId, "ticket")
        XCTAssertEqual(lieu.rotation, 0.2)
    }
}
