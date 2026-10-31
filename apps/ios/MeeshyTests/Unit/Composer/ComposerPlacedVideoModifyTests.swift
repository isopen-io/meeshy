import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Vidéo posée : ses outils À PLAT dans le rail, Volume et Muet compris**
/// (#13974 lot I-E4, #14048 — porteur 2026-10-31 : les outils sur le rail, ET
/// NON PAS dans une feuille à ouvrir). Les outils viennent de l'arbre partagé
/// (`media.placed.edit`) : Couper · Filtres · Cadres · Réglages · Son ·
/// Pivoter · Description · Mettre en fond ; Son se déplie en Volume · Muet (le
/// niveau `media.sound`), puis Dupliquer · Temps · Retirer. Volume ouvre son
/// curseur seul en bas (N3, de 0 à 200 %), Muet bascule dans le rail. Le
/// curseur écrit le modèle à chaque valeur ; la couche de la vidéo joue à ce
/// volume.
@MainActor
final class ComposerPlacedVideoModifyTests: XCTestCase {

    private func served(trimmable: Bool = true,
                        background: ComposerPlacedBackgroundOffer = .set) -> [ComposerBackgroundModifyEntry] {
        ComposerBackgroundModify.servedPlaced(isVideo: true, hasTrimmableSource: trimmable, background: background,
                                              makesSticker: false)
    }

    private func viewModel(_ media: StoryMediaObject) -> StoryComposerViewModel {
        let vm = StoryComposerViewModel()
        var slide = vm.currentSlide
        slide.effects.mediaObjects = [media]
        vm.currentSlide = slide
        return vm
    }

    private func volume(_ vm: StoryComposerViewModel, _ id: String) -> Float? {
        vm.currentEffects.mediaObjects?.first { $0.id == id }?.volume
    }

    // MARK: - N1

    func test_placedVideo_N1_isTrimFiltersFramesAdjustSoundRotateDescriptionBackground() {
        XCTAssertEqual(served(), [.trim, .filters, .frames, .adjust, .sound, .rotate, .description, .setAsBackground])
        XCTAssertEqual(served(background: .replace).last, .replaceBackground)
    }

    func test_placedVideo_withoutAKnownSource_doesNotOfferTrim_norCropEffectsNorSticker() {
        let entrees = Set(served(trimmable: false))
        XCTAssertFalse(entrees.contains(.trim), "absente plutôt qu'inerte (loi 4)")
        XCTAssertTrue(entrees.isDisjoint(with: [.crop, .effects, .makeSticker, .framing, .loop]))
    }

    func test_placedVideo_modifiesInLevels_andBeginHoldsItsPath() throws {
        XCTAssertTrue(ComposerInlineFamily.video.modifiesInLevels)
        let rognage = try XCTUnwrap(ComposerInlineEditing.begin(
            objectId: "vid", family: .video, onSceneSurface: true, requested: .media(.trim),
            hasTrimmableSource: true))
        XCTAssertNil(rognage.openSection, "la vidéo posée ne monte plus le panneau de sections")
        XCTAssertEqual(rognage.modifyPath, ComposerBackgroundModifyPath(entry: .trim, adjustment: nil))
    }

    // MARK: - N2 « Son », lu dans l'arbre

    func test_sound_opensTheLevelOfTheTree_volumeThenMute() throws {
        for niveau in [ComposerEditTree.LevelID.mediaPlacedEdit, .backgroundMediaEdit] {
            let son = try XCTUnwrap(ComposerEditTree.shared.entry("sound", in: niveau))
            XCTAssertEqual(son.opens, .level)
            XCTAssertEqual(son.next, ComposerEditTree.LevelID.mediaSound.rawValue)
        }
        let son = try XCTUnwrap(ComposerEditTree.shared.level(.mediaSound))
        XCTAssertEqual(son.kind, .rail)
        XCTAssertEqual(son.entries.map(\.id), ["volume", "mute"], "les identifiants d'Android, l'ordre de la spec")
        XCTAssertEqual(son.entries.map(\.opens), [.band, .toggle])
        XCTAssertEqual(ComposerMediaSound.served(), [.volume, .mute])
        let inverse = ComposerEditTree(schemaVersion: 1, levels: [
            ComposerEditTree.Level(id: son.id, kind: son.kind, title: son.title, entries: son.entries.reversed())])
        XCTAssertEqual(ComposerMediaSound.served(tree: inverse), [.mute, .volume], "l'ordre vient du fichier")
    }

    // MARK: - Le rail à plat (#14048)

    func test_theFlatRail_ofAPlacedVideo_isItsTools_soundUnfolded_thenItsActionsWithoutModify() {
        let pile = ComposerEditRailStack.of(family: .video, editing: .modify, typing: false)
        XCTAssertEqual(pile.levels, [.actions], "aucun niveau « Modifier »")
        let rail = ComposerEditRailItems.items(for: .actions, actions: [.modify, .duplicate, .time, .remove],
                                               sections: [.media(.adjust)], extras: [.setAsBackground],
                                               keyframes: false, backgroundEntries: served())
        XCTAssertEqual(rail, [.backgroundEntry(.trim), .backgroundEntry(.filters), .backgroundEntry(.frames),
                              .backgroundEntry(.adjust), .volume, .mute, .backgroundEntry(.rotate),
                              .backgroundEntry(.description), .backgroundEntry(.setAsBackground),
                              .action(.duplicate), .action(.time), .action(.remove)])
        XCTAssertEqual(ComposerEditRailItems.items(for: .backgroundSound, actions: [], sections: [], extras: [],
                                                   keyframes: false),
                       [.back, .volume, .mute])
        XCTAssertEqual(ComposerEditRailCopy.label(.volume),
                       String(localized: "composer.capture.sound.volume", bundle: .main))
        XCTAssertEqual(ComposerEditRailCopy.label(.mute), ComposerObjectEditorCopy.mute)
        XCTAssertEqual(ComposerEditRailCopy.symbol(.volume), "speaker.wave.3")
        XCTAssertEqual(ComposerEditRailCopy.symbol(.mute), "speaker.slash")
        XCTAssertNotEqual(ComposerEditRailItem.volume.identifier, ComposerEditRailItem.mute.identifier)
    }

    // MARK: - N3 « Volume », dans la feuille basse

    func test_volume_opensItsDialBelow_andBackClosesIt() {
        let curseur = ComposerBackgroundModify.tappedVolume(in: .closed)
        XCTAssertTrue(curseur.volume)
        XCTAssertTrue(ComposerBackgroundModify.propertiesAreOpen(curseur), "le curseur seul s'ouvre en bas")
        XCTAssertEqual(ComposerBackgroundModify.levels(curseur), [], "le rail à plat reste dessous")
        XCTAssertEqual(ComposerEditRailStack.of(family: .video, editing: .modify, typing: false,
                                                above: ComposerBackgroundModify.levels(curseur))
                        .back(propertiesAreOpen: true), .closeProperties)
        XCTAssertEqual(ComposerBackgroundModify.back(curseur), .closed, "Retour range le curseur")
        XCTAssertEqual(ComposerBackgroundModify.tappedVolume(in: curseur), .closed, "le retoucher le range")
    }

    func test_onlyOneDialIsOpenAtATime() {
        let curseur = ComposerBackgroundModify.tappedVolume(in: .closed)
        let reglage = ComposerBackgroundModify.tapped(adjustment: .contrast, in: curseur)
        XCTAssertFalse(reglage.volume)
        XCTAssertNil(ComposerBackgroundModify.tappedVolume(in: reglage).adjustment)
    }

    // MARK: - Le nouveau setter

    func test_setMediaVolume_writesTheModel_from0To200Percent() {
        let vm = viewModel(StoryMediaObject(id: "vid", kind: .video, aspectRatio: 0.56))
        vm.setMediaVolume(id: "vid", volume: 0.3)
        XCTAssertEqual(volume(vm, "vid") ?? -1, 0.3, accuracy: 0.0001)
        vm.setMediaVolume(id: "vid", volume: 3)
        XCTAssertEqual(volume(vm, "vid") ?? -1, StoryVolume.maxGain, accuracy: 0.0001, "plafond 200 %")
        vm.setMediaVolume(id: "vid", volume: 0.3)
        vm.setMediaVolume(id: "vid", volume: 0)
        XCTAssertEqual(vm.currentEffects.mediaObjects?.first?.isMuted, true, "0 % vaut Muet")
        vm.toggleMediaMute(id: "vid")
        XCTAssertEqual(volume(vm, "vid") ?? -1, 0.3, accuracy: 0.0001, "Muet rend le niveau quitté")
    }

    func test_setMediaVolume_ignoresAnImage() {
        let vm = viewModel(StoryMediaObject(id: "img", kind: .image, aspectRatio: 0.75))
        vm.setMediaVolume(id: "img", volume: 0.3)
        XCTAssertEqual(volume(vm, "img") ?? -1, 1, accuracy: 0.0001, "une image n'a rien à faire entendre")
    }

    func test_theDial_writesTheViewModel_atEveryValue_andReadsAPercent() {
        let vm = viewModel(StoryMediaObject(id: "vid", kind: .video, aspectRatio: 0.56))
        let curseur = ComposerMediaVolume.sliderBinding(viewModel: vm, mediaId: "vid")
        for valeur in [0.3, 1.5, 0.8] {
            curseur.wrappedValue = valeur
            XCTAssertEqual(Double(volume(vm, "vid") ?? -1), valeur, accuracy: 0.0001)
        }
        XCTAssertEqual(ComposerMediaVolume.range, 0...Double(StoryVolume.maxGain))
        XCTAssertEqual(ComposerMediaVolume.neutral, 1)
        XCTAssertEqual(ComposerMediaVolume.percent(0.3), 30)
        XCTAssertEqual(ComposerMediaVolume.percent(2), 200)
    }

    /// Le volume réglé s'ENTEND : la couche de la vidéo reprend le niveau du
    /// modèle à chaque configuration, et son lecteur le joue.
    func test_theVideoLayer_playsTheVolumeOfTheModel() throws {
        let vm = viewModel(StoryMediaObject(id: "vid", kind: .video, aspectRatio: 0.56))
        vm.setMediaVolume(id: "vid", volume: 0.3)
        let media = try XCTUnwrap(vm.currentEffects.mediaObjects?.first)
        let couche = StoryMediaLayer()
        couche.configure(with: media, geometry: CanvasGeometry(renderSize: CGSize(width: 374, height: 665)),
                         mode: .edit)
        XCTAssertEqual(couche.volume, 0.3, accuracy: 0.0001)
    }

    /// Le Volume ouvre la feuille basse de « Modifier », jamais un écran plein
    /// ni une plaque.
    func test_theVolumeDial_livesInTheModifySheet() throws {
        let feuille = try composer("ComposerBackgroundModifySheet.swift")
        XCTAssertTrue(feuille.contains("ComposerMediaVolumeDial("))
        let cadran = try composer("ComposerMediaVolume.swift")
        for interdit in ["fullScreenCover", "ComposerTrailingOptionsPlate", "Menu{"] {
            XCTAssertFalse(cadran.contains(interdit), interdit)
        }
    }

    private func composer(_ nom: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Composer/\(nom)"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }
}
