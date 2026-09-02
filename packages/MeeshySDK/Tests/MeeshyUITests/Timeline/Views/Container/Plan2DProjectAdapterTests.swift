import Testing
import Foundation
@testable import MeeshySDK
@testable import MeeshyUI

/// `Plan2DLayout.tracks(from:)` (D1, gelé) lit un `StoryEffects` — le RUNTIME
/// du composer. `TimelineViewModel.project` est un `TimelineProject`, pas un
/// `StoryEffects` : ce pont pur les FAMILLES que `TimelineProject` porte
/// réellement (texte / sticker / média / audio) — jamais `CanvasV3` (Global
/// Constraints, D3).
///
/// `background` / `locationObjects` / `drawingStrokes` / `backgroundAudioId`
/// n'existent PAS sur `TimelineProject` (ils vivent uniquement sur
/// `slide.effects`, hors de ce que `TimelineViewModel` porte) : l'adaptateur
/// les laisse à leur défaut plutôt que de les fabriquer — un `StoryEffects`
/// honnête sur ce qu'il sait, pas un repli qui inventerait un fond.
@Suite("Plan2DProjectAdapter — TimelineProject vers StoryEffects")
struct Plan2DProjectAdapterTests {

    @Test("Les quatre familles portées par TimelineProject traversent intactes")
    func effects_carriesTheFourProjectFamilies() {
        var media = StoryMediaObject(id: "m1", postMediaId: "pm-1", kind: .video, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = 3
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pm-2")
        let text = StoryTextObject(id: "t1", text: "Salut")
        let sticker = StorySticker(id: "s1", emoji: "☺")

        let project = TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [media], audioPlayerObjects: [audio],
            textObjects: [text], stickerObjects: [sticker],
            clipTransitions: []
        )

        let effects = Plan2DProjectAdapter.effects(from: project)

        #expect(effects.mediaObjects?.map(\.id) == ["m1"])
        #expect(effects.audioPlayerObjects?.map(\.id) == ["a1"])
        #expect(effects.textObjects.map(\.id) == ["t1"])
        #expect(effects.stickerObjects?.map(\.id) == ["s1"])
    }

    @Test("Un projet vide ne fabrique aucune famille — tableaux vides, jamais nil-par-défaut déguisé en donnée")
    func effects_emptyProject_carriesEmptyFamilies() {
        let project = TimelineProjectFactory.emptyProject()
        let effects = Plan2DProjectAdapter.effects(from: project)
        #expect(effects.mediaObjects?.isEmpty ?? true)
        #expect(effects.audioPlayerObjects?.isEmpty ?? true)
        #expect(effects.textObjects.isEmpty)
        #expect(effects.stickerObjects?.isEmpty ?? true)
    }

    @Test("Ce que TimelineProject ne porte pas (fond, dessin, son de fond) reste à son défaut — jamais fabriqué")
    func effects_omitsFamiliesTimelineProjectDoesNotCarry() {
        let effects = Plan2DProjectAdapter.effects(from: TimelineProjectFactory.emptyProject())
        #expect(effects.background == nil)
        #expect(effects.drawingStrokes == nil)
        #expect(effects.backgroundAudioId == nil)
    }

    /// **Le lieu a quitté cette liste le 2026-08-31** (directive porteur, #4591).
    ///
    /// > Le témoin ci-dessus l'y rangeait, et il serait resté VERT après la
    /// > correction : sur un projet VIDE, « le lieu ne traverse pas » et « le
    /// > lieu traverse, il n'y en a aucun » rendent le même verdict. Un témoin
    /// > écrit sur le cas vide ne peut pas distinguer une omission d'une
    /// > absence — il faut un lieu POSÉ pour que la question se pose.
    @Test("Une pastille de lieu TRAVERSE l'adaptateur — sa fenêtre atteint le plan")
    func effects_carriesLocationObjects_withTheirWindow() {
        var lieu = StoryLocationObject(id: "l1",
                                       place: SharedPlace(latitude: 48.85, longitude: 2.35,
                                                          name: "Paris"))
        lieu.startTime = 2
        lieu.duration = 3
        let project = TimelineProject(slideId: "s1", slideDuration: 10, locationObjects: [lieu])

        let effects = Plan2DProjectAdapter.effects(from: project)
        #expect(effects.locationObjects.map(\.id) == ["l1"])
        #expect(effects.locationObjects.first?.startTime == Double(2))
        #expect(effects.locationObjects.first?.duration == Double(3))
    }

    @Test("Le pont vers Plan2DLayout.tracks produit le MÊME plan qu'un StoryEffects construit à la main")
    func effects_feedsPlan2DLayout_producingTheSameTracksAsAHandBuiltStoryEffects() {
        var media = StoryMediaObject(id: "m1", postMediaId: "pm-1", kind: .video, aspectRatio: 1.0)
        media.startTime = 1
        media.duration = 2
        let project = TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [media], audioPlayerObjects: [],
            textObjects: [], clipTransitions: []
        )

        let viaAdapter = Plan2DLayout.tracks(from: Plan2DProjectAdapter.effects(from: project),
                                             slideDuration: 10)
        let handBuilt = Plan2DLayout.tracks(from: StoryEffects(mediaObjects: [media]),
                                            slideDuration: 10)
        #expect(viaAdapter == handBuilt)
    }

    @Test("Un média de FOND reste verrouillé après le pont — l'adaptateur ne filtre ni ne réécrit isBackground/id")
    func effects_preservesIsBackground_soDownstreamLockDerivationStillWorks() {
        let fond = StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true)
        let project = TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [fond], audioPlayerObjects: [],
            textObjects: [], clipTransitions: []
        )

        let track = Plan2DLayout.tracks(from: Plan2DProjectAdapter.effects(from: project),
                                        slideDuration: 10).first
        #expect(track?.isLocked == true)
    }
}
