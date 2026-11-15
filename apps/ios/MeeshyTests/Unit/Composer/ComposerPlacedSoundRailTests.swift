import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Un son posé : ses outils À PLAT dans le rail** (porteur 2026-10-31,
/// #14048 : « pour les images/vidéo/audio sur la scène en front on doit avoir
/// la même logique de mettre les tools sur le rail ET NON PAS dans une feuille
/// à ouvrir »). Couper (quand sa source est connue), Volume et Muet — les mots
/// de l'arbre partagé —, puis Dupliquer · Temps · Retirer ; plus de
/// « Modifier » dans le rail. Couper et Volume ouvrent leur réglage en bas,
/// en direct ; Muet bascule dans le rail ; Retour descend d'un niveau.
@MainActor
final class ComposerPlacedSoundRailTests: XCTestCase {

    private func viewModel(_ son: StoryAudioPlayerObject) -> StoryComposerViewModel {
        let vm = StoryComposerViewModel()
        var slide = vm.currentSlide
        slide.effects.audioPlayerObjects = [son]
        vm.currentSlide = slide
        return vm
    }

    private func volume(_ vm: StoryComposerViewModel, _ id: String) -> Float? {
        vm.currentEffects.audioPlayerObjects?.first { $0.id == id }?.volume
    }

    // MARK: - Les outils

    func test_aPlacedSound_railsItsToolsInLevels_trimOnlyWhenItsSourceIsKnown() {
        XCTAssertTrue(ComposerInlineFamily.audio.modifiesInLevels)
        XCTAssertEqual(ComposerBackgroundModify.servedSound(hasTrimmableSource: true), [.trim])
        XCTAssertEqual(ComposerBackgroundModify.servedSound(hasTrimmableSource: false), [],
                       "absente plutôt qu'inerte (loi 4)")
    }

    func test_theFlatRail_ofAPlacedSound_isTrimVolumeMute_thenDuplicateTimeRemove_neverModify() {
        XCTAssertEqual(ComposerEditRailStack.of(family: .audio, editing: .modify, typing: false).levels, [.actions],
                       "aucun niveau « Modifier »")
        let actions: [ComposerSelectionAction] = [.modify, .duplicate, .time, .remove]
        XCTAssertEqual(ComposerEditRailItems.items(for: .actions, actions: actions, sections: [], extras: [],
                                                   keyframes: false, backgroundEntries: [.trim],
                                                   sound: ComposerMediaSound.served()),
                       [.backgroundEntry(.trim), .volume, .mute, .action(.duplicate), .action(.time),
                        .action(.remove)])
        XCTAssertEqual(ComposerEditRailItems.items(for: .actions, actions: actions, sections: [], extras: [],
                                                   keyframes: false, sound: ComposerMediaSound.served()),
                       [.volume, .mute, .action(.duplicate), .action(.time), .action(.remove)],
                       "sans source connue, Modifier ne revient pas pour autant")
    }

    func test_trim_opensItsBandBelow_andBackClosesIt() throws {
        let rognage = try XCTUnwrap(ComposerInlineEditing.begin(
            objectId: "son", family: .audio, onSceneSurface: true, requested: .media(.trim),
            hasTrimmableSource: true))
        XCTAssertNil(rognage.openSection, "le son ne monte plus le panneau de sections")
        XCTAssertEqual(rognage.modifyPath, ComposerBackgroundModifyPath(entry: .trim, adjustment: nil))
        XCTAssertTrue(ComposerBackgroundModify.propertiesAreOpen(rognage.modifyPath), "sa bande s'ouvre en bas")
        XCTAssertEqual(ComposerBackgroundModify.back(rognage.modifyPath), .closed)
    }

    func test_time_ofASound_isItsWindowAndPlan_itsTrimLivesOnTheRail() {
        let sections = ComposerInlineEditing.sections(for: .audio, hasTrimmableSource: true)
        XCTAssertEqual(ComposerInlineEditing.chips(.time, family: .audio, served: sections), [.timing, .plan])
    }

    // MARK: - Volume et Muet

    func test_theVolumeDial_ofASound_writesItsVolume_from0To100Percent() {
        let vm = viewModel(StoryAudioPlayerObject(id: "son", postMediaId: "pm", name: "Voix"))
        XCTAssertEqual(ComposerMediaVolume.range(viewModel: vm, id: "son"), 0...1, "un son plafonne à 100 %")
        let curseur = ComposerMediaVolume.sliderBinding(viewModel: vm, mediaId: "son")
        curseur.wrappedValue = 0.4
        XCTAssertEqual(volume(vm, "son") ?? -1, 0.4, accuracy: 0.0001)
        XCTAssertEqual(curseur.wrappedValue, 0.4, accuracy: 0.0001)
        curseur.wrappedValue = 1.5
        XCTAssertEqual(volume(vm, "son") ?? -1, 1, accuracy: 0.0001)
    }

    func test_theVolumeDial_ofAVideo_keepsItsRangeTo200Percent() {
        let vm = StoryComposerViewModel()
        var slide = vm.currentSlide
        slide.effects.mediaObjects = [StoryMediaObject(id: "vid", kind: .video, aspectRatio: 0.56)]
        vm.currentSlide = slide
        XCTAssertEqual(ComposerMediaVolume.range(viewModel: vm, id: "vid"), 0...Double(StoryVolume.maxGain))
    }

    /// **Toucher Volume ouvre SON curseur en bas**, pour un son, une vidéo
    /// posée ou un fond vidéo — le témoin rougit si la branche du Volume de la
    /// feuille se tait (loi ou vue).
    func test_volume_opensItsDialInTheSheet_forEveryFamily() throws {
        let volume = ComposerBackgroundModify.tappedVolume(in: .closed)
        XCTAssertTrue(ComposerBackgroundModify.propertiesAreOpen(volume))
        for fond in [false, true] {
            XCTAssertEqual(ComposerBackgroundModifySheet.Content.of(volume, isBackground: fond), .volume)
        }
        let cadrage = ComposerBackgroundModifyPath(entry: .framing, adjustment: nil, volume: true)
        XCTAssertEqual(ComposerBackgroundModifySheet.Content.of(cadrage, isBackground: true), .volume,
                       "le curseur ouvert prime sur la bande de l'entrée")
        XCTAssertEqual(ComposerBackgroundModifySheet.Content.of(ComposerBackgroundModify.back(volume),
                                                                 isBackground: false), .entry(nil))
        let feuille = try AppSourceGuard.unit("Meeshy/Features/Composer/ComposerBackgroundModifySheet.swift")
        XCTAssertTrue(feuille.contains("case .volume: ComposerMediaVolumeDial(viewModel: viewModel, mediaId: mediaId)"),
                      "la feuille monte le curseur du Volume")
    }

    func test_mute_ofASound_togglesTheModel_andGivesBackTheLevelItLeft() {
        let vm = viewModel(StoryAudioPlayerObject(id: "son", postMediaId: "pm", name: "Voix"))
        vm.setAudioVolume(audioId: "son", volume: 0.6)
        vm.toggleAudioMute(id: "son")
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.first?.isMuted, true)
        vm.toggleAudioMute(id: "son")
        XCTAssertEqual(volume(vm, "son") ?? -1, 0.6, accuracy: 0.0001)
    }

    /// Muet, dans le rail d'un son, coupe CE son — jamais une vidéo.
    func test_theMuteOfTheRail_reachesTheSound() throws {
        let relais = try AppSourceGuard.unit("Meeshy/Features/Composer/MeeshyComposerHost+Selection.swift")
        XCTAssertTrue(relais.contains("toggleAudioMute(id:"), "le rail coupe le son posé")
    }
}
