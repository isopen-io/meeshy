import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Fond › Modifier ouvre N1 puis N2 dans le bas, en direct** (#13974, lot
/// I-E2, grammaire d'édition § 1). N1 vient de l'arbre partagé
/// (`background.media.edit`, le niveau qu'Android décode aussi) ; Réglages,
/// Effets et Son posent leur N2 par-dessus ; un réglage choisi ouvre N3, le
/// curseur seul, dans la feuille basse. Rien en haut à droite, aucune retouche
/// plein écran.
@MainActor
final class ComposerBackgroundModifyTests: XCTestCase {

    // MARK: - N1, lu dans l'arbre

    func test_imageBackground_N1_isFramingCropFiltersFramesAdjustEffectsRotateDescription() {
        XCTAssertEqual(ComposerBackgroundModify.served(isVideo: false, hasTrimmableSource: false),
                       [.framing, .crop, .filters, .frames, .adjust, .effects, .rotate, .description])
    }

    /// Boucle est dans l'arbre, mais le lecteur iOS boucle TOUJOURS un fond
    /// vidéo (`StoryRenderer`, `looping: true`) : l'interrupteur serait inerte,
    /// donc il n'est pas servi (loi 4). Cadres l'est (offre `look`) : le
    /// peintre d'iOS pose les cadres de l'appel sur une vidéo comme sur une
    /// image, le fond vidéo les avait déjà.
    func test_videoBackground_N1_isFramingTrimFiltersFramesAdjustSoundRotateDescription() {
        XCTAssertEqual(ComposerBackgroundModify.served(isVideo: true, hasTrimmableSource: true),
                       [.framing, .trim, .filters, .frames, .adjust, .sound, .rotate, .description])
        XCTAssertEqual(ComposerBackgroundModify.served(isVideo: true, hasTrimmableSource: false),
                       [.framing, .filters, .frames, .adjust, .sound, .rotate, .description],
                       "sans durée de source connue, Couper n'a rien à rogner")
    }

    func test_N1_followsTheOrderOfTheTree() throws {
        let niveau = try XCTUnwrap(ComposerEditTree.shared.level(.backgroundMediaEdit))
        let inverse = ComposerEditTree(schemaVersion: 1, levels: [
            ComposerEditTree.Level(id: niveau.id, kind: niveau.kind, title: niveau.title,
                                   entries: niveau.entries.reversed())])
        XCTAssertEqual(ComposerBackgroundModify.served(isVideo: false, hasTrimmableSource: false, tree: inverse),
                       [.description, .rotate, .effects, .adjust, .frames, .filters, .crop, .framing])
        XCTAssertEqual(ComposerBackgroundEdit.entry(.modify)?.next, niveau.id, "Modifier pose CE niveau")
    }

    // MARK: - N2 et N3

    func test_adjust_posesN2OfItsKinds_aKindOpensTheSliderAlone() {
        let n2 = ComposerBackgroundModify.tapped(.adjust, in: .closed)
        XCTAssertEqual(ComposerBackgroundModify.levels(n2), [.backgroundAdjust(.tone)])
        XCTAssertFalse(ComposerBackgroundModify.propertiesAreOpen(n2), "N2 est un rail, pas une feuille")
        let n3 = ComposerBackgroundModify.tapped(adjustment: .contrast, in: n2)
        XCTAssertTrue(ComposerBackgroundModify.propertiesAreOpen(n3), "N3 : le curseur seul, en bas")
        XCTAssertEqual(n3.adjustment, .contrast)
        XCTAssertEqual(ComposerBackgroundModify.tapped(adjustment: .contrast, in: n3).adjustment, nil,
                       "retoucher le réglage ouvert range son curseur")
        XCTAssertEqual(ComposerBackgroundModify.levels(ComposerBackgroundModify.tapped(.effects, in: .closed)),
                       [.backgroundAdjust(.effect)])
        XCTAssertEqual(ComposerBackgroundModify.levels(ComposerBackgroundModify.tapped(.sound, in: .closed)),
                       [.backgroundSound])
    }

    func test_sheetEntries_openTheBottomSheet_actionsLeaveThePathAlone() {
        for entree in [ComposerBackgroundModifyEntry.framing, .crop, .trim, .filters, .frames, .description] {
            let chemin = ComposerBackgroundModify.tapped(entree, in: .closed)
            XCTAssertTrue(ComposerBackgroundModify.propertiesAreOpen(chemin), "\(entree)")
            XCTAssertEqual(ComposerBackgroundModify.levels(chemin), [], "\(entree)")
            XCTAssertEqual(ComposerBackgroundModify.tapped(entree, in: chemin), .closed, "le retoucher la range")
        }
        let ouvert = ComposerBackgroundModify.tapped(.filters, in: .closed)
        XCTAssertEqual(ComposerBackgroundModify.tapped(.rotate, in: ouvert), ouvert, "Pivoter agit tout de suite")
    }

    func test_back_descendsOneLevelAtATime() {
        let n3 = ComposerBackgroundModify.tapped(adjustment: .exposure,
                                                 in: ComposerBackgroundModify.tapped(.adjust, in: .closed))
        let n2 = ComposerBackgroundModify.back(n3)
        XCTAssertEqual(n2, ComposerBackgroundModify.tapped(.adjust, in: .closed))
        XCTAssertEqual(ComposerBackgroundModify.back(n2), .closed)
    }

    func test_theStack_carriesN2AboveModify_andTheRailBackPopsIt() {
        let pile = ComposerEditRailStack.of(family: .background(isVideo: false), editing: .modify, typing: false,
                                            above: [.backgroundAdjust(.tone)])
        XCTAssertEqual(pile.levels, [.background, .options(.modify), .backgroundAdjust(.tone)])
        XCTAssertEqual(pile.railBack(), .popLevel)
        XCTAssertEqual(ComposerEditRailStack.of(family: .background(isVideo: false), editing: nil, typing: false,
                                                above: [.backgroundSound]).levels, [.background],
                       "sans Modifier, aucun N2")
    }

    func test_railItems_ofEachLevel_openWithBack() {
        XCTAssertEqual(ComposerEditRailItems.items(for: .options(.modify), actions: [], sections: [], extras: [],
                                                   keyframes: false, backgroundEntries: [.framing, .rotate]),
                       [.back, .backgroundEntry(.framing), .backgroundEntry(.rotate)])
        XCTAssertEqual(ComposerEditRailItems.items(for: .backgroundAdjust(.effect), actions: [], sections: [],
                                                   extras: [], keyframes: false, adjustments: [.bloom, .grain]),
                       [.back, .adjustment(.bloom), .adjustment(.grain)])
        XCTAssertEqual(ComposerEditRailItems.items(for: .backgroundSound, actions: [], sections: [], extras: [],
                                                   keyframes: false),
                       [.back, .mute])
        let cles = [ComposerEditRailLevel.backgroundAdjust(.tone), .backgroundAdjust(.effect), .backgroundSound,
                    .options(.modify)].map(ComposerEditRailStack.levelKey)
        XCTAssertEqual(Set(cles).count, 4)
    }

    func test_railWords_comeFromTheTree() {
        XCTAssertEqual(ComposerEditRailCopy.symbol(.backgroundEntry(.crop)), "crop")
        XCTAssertEqual(ComposerEditRailCopy.label(.backgroundEntry(.adjust)), ComposerAdjustCopy.title)
        XCTAssertEqual(ComposerEditRailCopy.label(.adjustment(.contrast)), ComposerAdjustCopy.label(.contrast))
    }

    /// Une porte qui nomme un sous-outil (le rognage de la frise) ouvre
    /// l'entrée de N1 qui lui répond ; rouvrir le même fond garde son chemin.
    func test_begin_aBackgroundHoldsItsPath_neverASection() throws {
        let rognage = try XCTUnwrap(ComposerInlineEditing.begin(
            objectId: "bg", family: .background(isVideo: true), onSceneSurface: true,
            requested: .media(.trim), hasTrimmableSource: true))
        XCTAssertNil(rognage.openSection, "aucune section : le fond ne monte jamais l'ancien panneau")
        XCTAssertEqual(rognage.modifyPath, ComposerBackgroundModifyPath(entry: .trim, adjustment: nil))
        var reglant = rognage
        reglant.modifyPath = ComposerBackgroundModifyPath(entry: .adjust, adjustment: .contrast)
        let rouvert = try XCTUnwrap(ComposerInlineEditing.begin(
            objectId: "bg", family: .background(isVideo: true), onSceneSurface: true,
            requested: nil, hasTrimmableSource: true, kept: reglant))
        XCTAssertEqual(rouvert.modifyPath, reglant.modifyPath)
    }

    // MARK: - En direct

    /// **Un réglage N2 écrit le viewModel à chaque valeur** : le curseur ne
    /// tamponne rien, la scène peint ce que le modèle porte au fil du geste.
    func test_aN2Setting_writesTheViewModel_atEveryValue() {
        let vm = StoryComposerViewModel()
        var slide = vm.currentSlide
        slide.effects.mediaObjects = [StoryMediaObject(id: "fond", kind: .image, aspectRatio: 0.75, isBackground: true)]
        vm.currentSlide = slide
        let curseur = ComposerMediaAdjustPanel.sliderBinding(viewModel: vm, mediaId: "fond", kind: .contrast)
        for valeur in [0.6, 0.9, 1.2, 1.4] {
            curseur.wrappedValue = valeur
            XCTAssertEqual(Double(vm.mediaObjectAdjustments(id: "fond")[.contrast]), valeur, accuracy: 0.0001)
            XCTAssertEqual(curseur.wrappedValue, valeur, accuracy: 0.0001)
        }
    }

    // MARK: - Ce qui disparaît

    /// Le fond ne passe ni par une retouche plein écran, ni par la plaque du
    /// haut à droite, ni par la colonne droite : tout se règle en bas.
    func test_theBackground_neverOpensAFullScreenRetouch_norTheTrailingPlate() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
        for fichier in ["ComposerBackgroundModify.swift", "ComposerBackgroundModifySheet.swift",
                        "MeeshyComposerHost+BackgroundEdit.swift", "MeeshyComposerHost+BackgroundModify.swift"] {
            let code = try String(contentsOf: racine.appendingPathComponent("Meeshy/Features/Composer/\(fichier)"),
                                  encoding: .utf8)
            for interdit in ["fullScreenCover", "requestSceneMediaRetouch", "ComposerTrailingOptionsPlate",
                             "ComposerTrailingColumn", "presentedPortal", "Menu {"] {
                XCTAssertFalse(code.contains(interdit), "\(fichier) : \(interdit)")
            }
        }
    }
}
