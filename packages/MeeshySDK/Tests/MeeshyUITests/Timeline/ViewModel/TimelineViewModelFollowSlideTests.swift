import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// « Suivre la slide » (revue totale U9, D3) : symétrique d'un bord tiré —
/// qui convertit implicitement un fantôme (`timing == nil`, O4) en durée
/// explicite. `followSlide(id:)` fait le chemin inverse : remet `startTime`
/// ET `duration` à `nil`, sur les quatre familles temporisées (média, audio,
/// texte, sticker).
///
/// Mutation DIRECTE du projet, PAS de `SetClipPropertyCommand` : `AnyEditCommand`
/// (StoryModels.swift, hors `Timeline/**`) est un enum FERMÉ sans variante
/// « timing nil » — l'ajouter appartient au Modèle du SDK, hors ownership de
/// ce lot. Contrepartie assumée et testée ici : `canUndo` NE bouge PAS.
@MainActor
final class TimelineViewModelFollowSlideTests: XCTestCase {

    private func makeSUT(project: TimelineProject) -> TimelineViewModel {
        let sut = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    func test_followSlide_video_resetsStartAndDurationToNil() async {
        var media = StoryMediaObject(id: "clip-1", postMediaId: "clip-1", kind: .video, aspectRatio: 1.0)
        media.startTime = 1
        media.duration = 3
        let project = TimelineProject(slideId: "slide-1", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.followSlide(id: "clip-1")

        XCTAssertNil(sut.project.mediaObjects[0].startTime)
        XCTAssertNil(sut.project.mediaObjects[0].duration)
    }

    func test_followSlide_audio_resetsStartAndDurationToNil() async {
        var audio = StoryAudioPlayerObject(id: "audio-1", postMediaId: "audio-1")
        audio.startTime = 2
        audio.duration = 4
        let project = TimelineProject(slideId: "slide-1", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [audio],
                                      textObjects: [], clipTransitions: [])
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.followSlide(id: "audio-1")

        XCTAssertNil(sut.project.audioPlayerObjects[0].startTime)
        XCTAssertNil(sut.project.audioPlayerObjects[0].duration)
    }

    func test_followSlide_text_resetsStartAndDurationToNil() async {
        var text = StoryTextObject(id: "text-1", text: "Salut")
        text.startTime = 1
        text.duration = 2
        let project = TimelineProject(slideId: "slide-1", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [],
                                      textObjects: [text], clipTransitions: [])
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.followSlide(id: "text-1")

        XCTAssertNil(sut.project.textObjects[0].startTime)
        XCTAssertNil(sut.project.textObjects[0].duration)
    }

    func test_followSlide_sticker_resetsStartAndDurationToNil() async {
        var sticker = StorySticker(id: "sticker-1", emoji: "☺")
        sticker.startTime = 1
        sticker.duration = 2
        let project = TimelineProject(slideId: "slide-1", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [],
                                      textObjects: [], stickerObjects: [sticker],
                                      clipTransitions: [])
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.followSlide(id: "sticker-1")

        XCTAssertNil(sut.project.stickerObjects[0].startTime)
        XCTAssertNil(sut.project.stickerObjects[0].duration)
    }

    func test_followSlide_alreadyGhost_isNoOp() async {
        let media = StoryMediaObject(id: "clip-1", postMediaId: "clip-1", kind: .video, aspectRatio: 1.0)
        let project = TimelineProject(slideId: "slide-1", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.followSlide(id: "clip-1")

        XCTAssertNil(sut.project.mediaObjects[0].startTime)
        XCTAssertNil(sut.project.mediaObjects[0].duration)
        XCTAssertFalse(sut.canUndo, "déjà fantôme : aucun changement, donc rien à empiler")
    }

    func test_followSlide_unknownId_doesNothing() async {
        let sut = makeSUT(project: TimelineProjectFactory.emptyProject())
        await sut.awaitConfigured()

        sut.followSlide(id: "does-not-exist")

        XCTAssertFalse(sut.canUndo)
    }

    /// Contrepartie assumée du contournement de `AnyEditCommand` (hors
    /// ownership Timeline/** — cf. doc-comment de `followSlide`) : cette
    /// action ne pousse RIEN sur la pile d'annulation.
    func test_followSlide_isNotUndoable() async {
        var media = StoryMediaObject(id: "clip-1", postMediaId: "clip-1", kind: .video, aspectRatio: 1.0)
        media.startTime = 1
        media.duration = 3
        let project = TimelineProject(slideId: "slide-1", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.followSlide(id: "clip-1")

        XCTAssertFalse(sut.canUndo)
    }

    /// AGGRAVANT explicitement consigné et testé (revue DoD) : `followSlide`
    /// termine par `recomputeSlideDuration()` — le MÊME recalcul qu'un bord
    /// tiré ou une suppression — qui retombe sur la durée dérivée du CONTENU
    /// restant, jamais plancher par une valeur PRÉCÉDENTE. Quand le clip
    /// redevenu fantôme était la SEULE source de la durée courante (aucune
    /// marge « +10 s » posée via `extendSlideDuration`, donc
    /// `authoredSlideDuration == nil`), la slide RACCOURCIT. Combiné à
    /// `test_followSlide_isNotUndoable` ci-dessus : cette perte de durée est
    /// IRRÉVERSIBLE au clavier — aucune entrée d'annulation ne la restaure,
    /// l'auteur doit ré-étirer le bord à la main pour la retrouver.
    func test_followSlide_recomputesSlideDuration_canShrinkItIrreversibly() async {
        var media = StoryMediaObject(id: "clip-1", postMediaId: "clip-1", kind: .video, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = 10
        // `slideDuration` EXACTEMENT dérivée de ce clip (10 − 10 = 0 ≤ 0,05,
        // cf. `authoredDuration(in:)`) : aucune marge d'auteur ne plancher la
        // durée une fois le clip redevenu fantôme.
        let project = TimelineProject(slideId: "slide-1", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()
        XCTAssertNil(sut.authoredSlideDuration, "précondition : rien ne plancher la durée courante")

        sut.followSlide(id: "clip-1")

        XCTAssertLessThan(
            sut.project.slideDuration, 10,
            "« Suivre la slide » peut RACCOURCIR la slide (recompute sur le contenu restant) sans qu'aucun undo ne rattrape la perte"
        )
    }
}
