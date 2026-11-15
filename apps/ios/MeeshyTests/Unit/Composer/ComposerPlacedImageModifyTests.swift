import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Image posée › Modifier ouvre N1 puis N2 dans le bas, en direct** (#13974,
/// lot I-E3, grammaire d'édition § 1). N1 vient de l'arbre partagé
/// (`media.placed.edit`, le niveau qu'Android décode aussi) : Recadrer ·
/// Filtres · Cadres · Réglages · Effets · Pivoter · Description · Mettre en
/// fond (ou Remplacer le fond) · Faire un sticker. Réglages et Effets posent
/// leur N2 par-dessus, comme pour le fond ; un réglage ouvre N3, le curseur
/// seul, dans la feuille basse. L'image se retouche sans quitter la scène.
@MainActor
final class ComposerPlacedImageModifyTests: XCTestCase {

    private func served(background: ComposerPlacedBackgroundOffer = .set,
                        makesSticker: Bool = true,
                        tree: ComposerEditTree = .shared) -> [ComposerBackgroundModifyEntry] {
        ComposerBackgroundModify.servedPlaced(isVideo: false, hasTrimmableSource: false, background: background,
                                              makesSticker: makesSticker, tree: tree)
    }

    // MARK: - N1, lu dans l'arbre

    func test_placedImage_N1_isCropFiltersFramesAdjustEffectsRotateDescriptionBackgroundSticker() {
        XCTAssertEqual(served(), [.crop, .filters, .frames, .adjust, .effects, .rotate, .description,
                                  .setAsBackground, .makeSticker])
    }

    func test_placedImage_withABackgroundAlready_replacesIt_neverBoth() {
        let entrees = served(background: .replace)
        XCTAssertTrue(entrees.contains(.replaceBackground))
        XCTAssertFalse(entrees.contains(.setAsBackground), "une seule des deux entrées est servie")
        XCTAssertFalse(served(background: .none).contains(.setAsBackground),
                       "un objet qui ne peut devenir le fond ne l'offre pas")
        XCTAssertFalse(served(background: .none).contains(.replaceBackground))
    }

    func test_placedImage_withoutSubjectLift_doesNotOfferASticker() {
        XCTAssertFalse(served(makesSticker: false).contains(.makeSticker), "absente plutôt qu'inerte (loi 4)")
    }

    func test_placedImage_neverOffersFramingTrimSoundNorTheOrder() {
        let entrees = Set(served())
        XCTAssertTrue(entrees.isDisjoint(with: [.framing, .trim, .sound, .loop]),
                      "le Cadrage est celui du fond ; Couper et Son sont la vidéo")
        let ids = ComposerEditTree.shared.level(.mediaPlacedEdit)?.entries.map(\.id) ?? []
        for ordre in ["bring-forward", "send-backward", "plan", "order"] {
            XCTAssertFalse(ids.contains(ordre), "le toucher fait passer au premier plan (#13918)")
        }
    }

    func test_N1_followsTheOrderOfTheTree() throws {
        let niveau = try XCTUnwrap(ComposerEditTree.shared.level(.mediaPlacedEdit))
        XCTAssertEqual(niveau.entries.map(\.id),
                       ["crop", "trim", "filters", "frames", "adjust", "effects", "sound", "rotate", "description",
                        "set-as-background", "replace-background", "make-sticker"],
                       "les identifiants d'Android, l'ordre de la spec")
        let inverse = ComposerEditTree(schemaVersion: 1, levels: [
            ComposerEditTree.Level(id: niveau.id, kind: niveau.kind, title: niveau.title,
                                   entries: niveau.entries.reversed())])
        XCTAssertEqual(served(tree: inverse), [.makeSticker, .setAsBackground, .description, .rotate, .effects,
                                               .adjust, .frames, .filters, .crop])
    }

    // MARK: - Ce que chaque entrée ouvre

    func test_backgroundAndSticker_actAtOnce_theOthersOpenTheirLevelOrSheet() {
        let ouvert = ComposerBackgroundModify.tapped(.crop, in: .closed)
        XCTAssertTrue(ComposerBackgroundModify.propertiesAreOpen(ouvert), "Recadrer ouvre la feuille basse")
        for immediat in [ComposerBackgroundModifyEntry.setAsBackground, .replaceBackground, .makeSticker, .rotate] {
            XCTAssertEqual(ComposerBackgroundModify.opening(immediat), .action, "\(immediat)")
            XCTAssertEqual(ComposerBackgroundModify.tapped(immediat, in: ouvert), ouvert, "\(immediat)")
        }
        XCTAssertEqual(ComposerBackgroundModify.levels(ComposerBackgroundModify.tapped(.adjust, in: .closed)),
                       [.backgroundAdjust(.tone)])
        XCTAssertEqual(ComposerBackgroundModify.levels(ComposerBackgroundModify.tapped(.effects, in: .closed)),
                       [.backgroundAdjust(.effect)])
        let description = ComposerBackgroundModify.tapped(.description, in: .closed)
        XCTAssertTrue(ComposerBackgroundModify.propertiesAreOpen(description), "Description passe en feuille")
    }

    /// Les réglages de N2 d'une image posée sont ceux que son calque PEINT.
    func test_N2_ofAPlacedImage_servesWhatItsLayerPaints() {
        XCTAssertEqual(ComposerBackgroundModify.adjustments(.tone, isVideo: false),
                       AdjustmentKind.served(for: .image, in: .tone))
        XCTAssertEqual(ComposerBackgroundModify.adjustments(.effect, isVideo: false),
                       AdjustmentKind.served(for: .image, in: .effect))
    }

    // MARK: - L'édition en place tient un chemin

    func test_begin_aPlacedImageModifyHoldsItsPath_neverASection() throws {
        let recadrage = try XCTUnwrap(ComposerInlineEditing.begin(
            objectId: "img", family: .image, onSceneSurface: true, requested: .media(.crop),
            hasTrimmableSource: false))
        XCTAssertNil(recadrage.openSection, "l'image posée ne monte plus le panneau de sections")
        XCTAssertEqual(recadrage.modifyPath, ComposerBackgroundModifyPath(entry: .crop, adjustment: nil))
        var reglant = recadrage
        reglant.modifyPath = ComposerBackgroundModifyPath(entry: .adjust, adjustment: .contrast)
        let rouvert = try XCTUnwrap(ComposerInlineEditing.begin(
            objectId: "img", family: .image, onSceneSurface: true, requested: nil, hasTrimmableSource: false,
            kept: reglant))
        XCTAssertEqual(rouvert.modifyPath, reglant.modifyPath, "rouvrir l'image garde où l'on était")
    }

    func test_begin_theTimeOfAPlacedImage_keepsItsSections() throws {
        let temps = try XCTUnwrap(ComposerInlineEditing.begin(
            objectId: "img", family: .image, onSceneSurface: true, requested: nil, hasTrimmableSource: false,
            purpose: .time))
        XCTAssertEqual(temps.openSection, .timing, "Temps garde sa fenêtre, hors de ce lot")
        XCTAssertEqual(temps.modifyPath, .closed)
    }

    func test_onlyTheBackgroundAndThePlacedMedia_modifyInLevels() {
        XCTAssertTrue(ComposerInlineFamily.image.modifiesInLevels)
        XCTAssertTrue(ComposerInlineFamily.video.modifiesInLevels, "la vidéo posée, lot I-E4")
        XCTAssertTrue(ComposerInlineFamily.background(isVideo: true).modifiesInLevels)
        XCTAssertTrue(ComposerInlineFamily.audio.modifiesInLevels, "le son posé, #14048")
        for famille in [ComposerInlineFamily.text, .sticker, .place] {
            XCTAssertFalse(famille.modifiesInLevels, "\(famille) : son lot viendra")
        }
    }

    // MARK: - La pile et le rail

    func test_theStack_ofAPlacedImage_isItsFlatRailThenN2_neverAModifyLevel() {
        let pile = ComposerEditRailStack.of(family: .image, editing: .modify, typing: false,
                                            above: [.backgroundAdjust(.tone)])
        XCTAssertEqual(pile.levels, [.actions, .backgroundAdjust(.tone)], "aucun niveau « Modifier » (#14048)")
        XCTAssertEqual(pile.railBack(), .popLevel, "Retour descend d'UN niveau")
        XCTAssertEqual(ComposerEditRailStack.of(family: .image, editing: .modify, typing: false).railBack(),
                       .leaveEditing)
    }

    func test_railItems_areTheToolsFlat_thenDuplicateTimeRemove_neverModifyNorTheOldSections() {
        let entrees = ComposerEditRailItems.items(for: .actions, actions: [.modify, .duplicate, .time, .remove],
                                                  sections: [.media(.adjust)], extras: [.setAsBackground],
                                                  keyframes: false,
                                                  backgroundEntries: [.crop, .setAsBackground, .makeSticker])
        XCTAssertEqual(entrees, [.backgroundEntry(.crop), .backgroundEntry(.setAsBackground),
                                 .backgroundEntry(.makeSticker), .action(.duplicate), .action(.time),
                                 .action(.remove)])
        XCTAssertEqual(ComposerEditRailItems.items(for: .actions, actions: [.modify, .remove], sections: [],
                                                   extras: [], keyframes: false),
                       [.action(.modify), .action(.remove)], "une famille sans outils à plat garde Modifier")
    }

    func test_railWords_areThoseOfTheTree_andOfTheScene() {
        XCTAssertEqual(ComposerEditRailCopy.label(.backgroundEntry(.setAsBackground)),
                       StoryCanvasContextAction.setAsBackground.title, "la clé story.canvas.action.setAsBackground")
        XCTAssertEqual(ComposerEditRailCopy.label(.backgroundEntry(.replaceBackground)),
                       StoryCanvasContextAction.replaceBackground.title)
        XCTAssertEqual(ComposerEditRailCopy.label(.backgroundEntry(.makeSticker)),
                       ComposerSelectionCopy.label(.makeSticker))
        XCTAssertEqual(ComposerEditRailCopy.symbol(.backgroundEntry(.setAsBackground)), "photo.on.rectangle")
        XCTAssertEqual(ComposerEditRailCopy.symbol(.backgroundEntry(.makeSticker)), "person.crop.square.badge.camera")
        XCTAssertEqual(ComposerEditRailCopy.label(.backgroundEntry(.crop)),
                       String(localized: "composer.object.editor.crop", bundle: .main))
    }

    // MARK: - En direct, sans quitter la scène

    func test_aN3SliderOfAPlacedImage_writesTheViewModel_atEveryValue() {
        let vm = StoryComposerViewModel()
        var slide = vm.currentSlide
        slide.effects.mediaObjects = [StoryMediaObject(id: "img", kind: .image, aspectRatio: 0.75)]
        vm.currentSlide = slide
        let curseur = ComposerMediaAdjustPanel.sliderBinding(viewModel: vm, mediaId: "img", kind: .exposure)
        for valeur in [-0.4, 0.2, 0.7] {
            curseur.wrappedValue = valeur
            XCTAssertEqual(Double(vm.mediaObjectAdjustments(id: "img")[.exposure]), valeur, accuracy: 0.0001)
        }
    }

    /// Retoucher une image posée ne quitte jamais la scène : ni retouche plein
    /// écran, ni plaque en haut à droite, ni menu.
    func test_modifyingAPlacedImage_neverLeavesTheScene() throws {
        let colonnes = try composer("MeeshyComposerHost+SceneColumns.swift")
        XCTAssertTrue(colonnes.contains("case.media,.sticker,.place:sceneSelectionRelay.modifySceneItem(id)"))
        for fichier in ["ComposerBackgroundModify.swift", "ComposerBackgroundModifySheet.swift",
                        "MeeshyComposerHost+BackgroundModify.swift", "MeeshyComposerHost+Selection.swift"] {
            let code = try composer(fichier)
            for interdit in ["fullScreenCover", "ComposerSceneMediaRetouchCover", "requestSceneMediaRetouch",
                             "ComposerTrailingOptionsPlate", "Menu{"] {
                XCTAssertFalse(code.contains(interdit), "\(fichier) : \(interdit)")
            }
        }
    }

    private func composer(_ nom: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Composer/\(nom)"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }
}
