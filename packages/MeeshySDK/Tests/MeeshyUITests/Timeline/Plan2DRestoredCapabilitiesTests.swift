import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Quatre capacités que le passage au plan 2D (D3) avait laissées sans
/// surface, et que la revue DoD réclame de rendre de nouveau atteignables :
/// le mute PAR CLIP, les échos d'un fond qui boucle, l'accessibilité PAR
/// PISTE, et le déplacement temporel d'une piste au doigt.
///
/// Chacune est testée par son CALCUL (pur, hors vue) ; le câblage est ancré
/// par les gardes de source de `Plan2DIntegrationGuardTests`.

// MARK: - Mute par clip

@MainActor
final class ClipInspectorMuteTests: XCTestCase {

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func videoProject() -> TimelineProject {
        var video = StoryMediaObject(id: "v1", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        video.startTime = 0
        video.duration = 5
        return TimelineProject(slideId: "s1", slideDuration: 10,
                               mediaObjects: [video], audioPlayerObjects: [],
                               textObjects: [], clipTransitions: [])
    }

    private func inspector(for vm: TimelineViewModel, clipId: String) -> ClipInspector {
        ClipInspector(
            presentation: .sheet,
            clip: ClipInspector.ClipSnapshot(
                id: clipId, displayName: clipId, kind: .video,
                startTime: 0, duration: 5, volume: 1,
                fadeInDuration: 0, fadeOutDuration: 0,
                isLooping: false, isBackground: false
            ),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {},
            onToggleMute: { [vm] in vm.toggleClipMute(id: clipId) }
        )
    }

    func test_muteAction_silencesTheClip() {
        let vm = makeViewModel(project: videoProject())

        inspector(for: vm, clipId: "v1").simulateMuteToggle()

        XCTAssertEqual(vm.project.mediaObjects.first(where: { $0.id == "v1" })?.volume, 0,
                       "Le mute par clip doit redevenir atteignable depuis la fiche d'édition")
    }

    func test_muteAction_isUndoable_andRestoresTheAuthorLevel() {
        let vm = makeViewModel(project: videoProject())
        vm.setClipVolume(id: "v1", volume: 0.4)

        inspector(for: vm, clipId: "v1").simulateMuteToggle()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0)

        vm.undo()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0.4,
                       "Annuler un mute doit rendre le niveau QUITTÉ, jamais 1.0 forcé")
    }

    /// Le son se coupe et se rétablit : deux appels ramènent le niveau de départ.
    func test_muteAction_toggles() {
        let vm = makeViewModel(project: videoProject())
        vm.setClipVolume(id: "v1", volume: 0.8)

        inspector(for: vm, clipId: "v1").simulateMuteToggle()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0)

        inspector(for: vm, clipId: "v1").simulateMuteToggle()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0.8)
    }
}

// MARK: - Échos d'un fond qui boucle

@MainActor
final class StoryTimelineHostLoopEchoTests: XCTestCase {

    private static func tracks(_ ids: [String]) -> [Plan2DTrack] {
        ids.map { Plan2DTrack(id: $0, label: $0, plane: .bg, z: 0, bar: .ghost) }
    }

    private func project(media: [StoryMediaObject] = [],
                         audio: [StoryAudioPlayerObject] = []) -> TimelineProject {
        TimelineProject(slideId: "s1", slideDuration: 10,
                        mediaObjects: media, audioPlayerObjects: audio,
                        textObjects: [], clipTransitions: [])
    }

    func test_loopingBackgroundVideo_getsEchoesOnItsOwnRow() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = true
        bg.startTime = 0
        bg.duration = 3

        let echoes = StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                  tracks: Self.tracks(["other", "bg"]))

        XCTAssertEqual(echoes.map(\.trackId), ["bg"])
        XCTAssertEqual(echoes.first?.rowIndex, 1, "L'écho se dessine sur la RANGÉE de son clip")
        XCTAssertEqual(echoes.first?.nativeDuration, 3)
        XCTAssertEqual(echoes.first?.clipStartTime, 0)
    }

    func test_aBackgroundThatDoesNotLoop_hasNoEcho() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = false
        bg.startTime = 0
        bg.duration = 3

        XCTAssertTrue(StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                   tracks: Self.tracks(["bg"])).isEmpty)
    }

    func test_aLoopingCarrierClip_hasNoEcho_onlyTheBackgroundFillsTheSlide() {
        var carrier = StoryMediaObject(id: "clip", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        carrier.isBackground = false
        carrier.loop = true
        carrier.startTime = 0
        carrier.duration = 3

        XCTAssertTrue(StoryTimelineHost.loopEchoes(project: project(media: [carrier]),
                                                   tracks: Self.tracks(["clip"])).isEmpty)
    }

    func test_loopingBackgroundAudio_alsoGetsEchoes() {
        let sound = StoryAudioPlayerObject(id: "snd", postMediaId: "m2",
                                           isBackground: true,
                                           startTime: 1, duration: 2, loop: true)

        let echoes = StoryTimelineHost.loopEchoes(project: project(audio: [sound]),
                                                  tracks: Self.tracks(["snd"]))

        XCTAssertEqual(echoes.map(\.trackId), ["snd"])
        XCTAssertEqual(echoes.first?.clipStartTime, 1)
        XCTAssertEqual(echoes.first?.nativeDuration, 2)
    }

    func test_aLoopingClipWithoutARowInThePlan_isSkipped() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = true
        bg.startTime = 0
        bg.duration = 3

        XCTAssertTrue(StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                   tracks: Self.tracks(["autre"])).isEmpty)
    }

    /// Les tuiles réellement dessinées viennent du composant EXISTANT — le
    /// calcul de tuilage n'est pas réinventé ici.
    func test_echoesFeedTheExistingLoopRepeatOverlayTiling() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = true
        bg.startTime = 0
        bg.duration = 3

        guard let echo = StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                      tracks: Self.tracks(["bg"])).first else {
            return XCTFail("Un fond qui boucle doit produire un écho")
        }
        XCTAssertEqual(
            LoopRepeatOverlay.repeatStartTimes(nativeDuration: echo.nativeDuration,
                                               clipStartTime: echo.clipStartTime,
                                               slideDuration: 10),
            [3, 6, 9]
        )
    }
}

// MARK: - Accessibilité par piste

final class Plan2DTrackAccessibilityTests: XCTestCase {

    func test_label_prefixesTheTrackWithItsPlane() {
        let track = Plan2DTrack(id: "t", label: "Aa \"Salut\"", plane: .bg, z: 0,
                                bar: .timed(start: 1, end: 4))
        let label = Plan2DView.accessibilityLabel(for: track)

        XCTAssertTrue(label.hasPrefix(Plan2DView.planeLabel(.bg)),
                      "La section (le plan) doit PRÉCÉDER le nom de la piste — got: \(label)")
        XCTAssertTrue(label.contains("Aa \"Salut\""), "Le nom de la piste doit rester audible — got: \(label)")
    }

    /// Le plan du FOND réutilise la clé de section de l'ancien conteneur
    /// (`story.timeline.track.section.bg.a11y`) — une seule source, pas un
    /// second libellé qui dériverait.
    func test_backgroundPlane_announcesTheSameSectionWordAsTheOldContainer() {
        let label = Plan2DView.planeLabel(.bg).lowercased()
        XCTAssertTrue(label.contains("fond") || label.contains("background"),
                      "Locale fr « Fond » / en « Background » — got: \(Plan2DView.planeLabel(.bg))")
    }

    func test_eachPlaneHasItsOwnSectionWord() {
        let words = [Plan2DView.planeLabel(.fg),
                     Plan2DView.planeLabel(.content),
                     Plan2DView.planeLabel(.bg)]
        XCTAssertEqual(Set(words).count, 3, "Trois plans, trois annonces distinctes — got: \(words)")
        XCTAssertFalse(words.contains(where: \.isEmpty))
    }

    func test_timedTrack_announcesWhatItOccupiesInTime() {
        let track = Plan2DTrack(id: "t", label: "Voix", plane: .content, z: 0,
                                bar: .timed(start: 1, end: 4))
        XCTAssertTrue(Plan2DView.accessibilityLabel(for: track)
            .contains(TrackBarView<AnyView>.formatTrackDuration(3)),
                      "Une durée choisie doit s'entendre — got: \(Plan2DView.accessibilityLabel(for: track))")
    }

    func test_ghostTrack_announcesThatItFollowsTheSlide() {
        let track = Plan2DTrack(id: "t", label: "☺", plane: .fg, z: 0, bar: .ghost)
        let label = Plan2DView.accessibilityLabel(for: track).lowercased()
        XCTAssertTrue(label.contains("suit") || label.contains("follow"),
                      "Un fantôme n'a pas de durée : il SUIT la slide, et le dit — got: \(label)")
    }
}

// MARK: - Déplacement temporel d'une piste au doigt

final class Plan2DClipMoveGestureTests: XCTestCase {

    private static let timed = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                           bar: .timed(start: 0, end: 4))
    private static let ghost = Plan2DTrack(id: "g", label: "g", plane: .fg, z: 0, bar: .ghost)

    private func delta(_ translation: CGSize, edge: Plan2DView.Edge? = nil,
                       armed: Bool = true, track: Plan2DTrack = Plan2DClipMoveGestureTests.timed) -> Double? {
        Plan2DView.moveDelta(translation: translation, gestureEdge: edge, isReorderArmed: armed,
                             track: track, zoom: .fit, laneWidth: 300, slideDuration: 10)
    }

    func test_armedHorizontalDrag_movesTheTrackInTime() {
        // 300 pt pour 10 s ⇒ 30 px/s : 60 pt valent 2 s.
        XCTAssertEqual(delta(CGSize(width: 60, height: 0)) ?? .nan, 2, accuracy: 0.0001)
        XCTAssertEqual(delta(CGSize(width: -30, height: 0)) ?? .nan, -1, accuracy: 0.0001)
    }

    func test_theDeltaIsCumulative_notIncremental() {
        // Deux lectures successives du MÊME geste : la seconde vaut la
        // translation totale, pas son incrément — c'est l'appelant qui
        // reconstruit depuis l'origine capturée (parade anti-dérive).
        XCTAssertEqual(delta(CGSize(width: 30, height: 0)) ?? .nan, 1, accuracy: 0.0001)
        XCTAssertEqual(delta(CGSize(width: 90, height: 0)) ?? .nan, 3, accuracy: 0.0001)
    }

    func test_anUnarmedDrag_neverMoves_itScrolls() {
        XCTAssertNil(delta(CGSize(width: 60, height: 0), armed: false),
                     "Le glissement NU appartient au scroller — déplacer exige l'armement (M11)")
    }

    func test_anEdgeDrag_trimsInsteadOfMoving() {
        XCTAssertNil(delta(CGSize(width: 60, height: 0), edge: .start),
                     "Une poignée de bord rogne : elle ne déplace pas")
    }

    func test_aGhostTrackIsNeverMoved() {
        XCTAssertNil(delta(CGSize(width: 60, height: 0), track: Self.ghost),
                     "Un fantôme n'a pas de fenêtre à déplacer — lui en fabriquer une convertirait un défaut en choix (O4)")
    }

    func test_aPurelyVerticalDrag_producesNoTimeMove() {
        XCTAssertNil(delta(CGSize(width: 0, height: 120)),
                     "Réordonner verticalement ne doit pas décaler la piste dans le temps")
    }
}
