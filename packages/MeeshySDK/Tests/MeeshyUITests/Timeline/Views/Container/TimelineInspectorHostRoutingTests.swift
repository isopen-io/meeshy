import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Guards the unified-timeline inspector routing: the floating inspector host
/// (extracted from the former Pro container) must surface the right inspector
/// for the current selection, and the SINGLE timeline view (Quick design)
/// must host it — selection in the unified view can no longer be a dead end.
///
/// `selection.selectedClipId` is a shared bus — `KeyframeMarkerView` and
/// `TransitionBadge` push their own ids through `selectClip(id:)`, so the
/// host can't assume the selected id is a clip. These tests exercise the
/// pure resolution helpers + the `SelectionKind` dispatcher so we don't have
/// to drive SwiftUI gestures.
@MainActor
final class TimelineInspectorHostRoutingTests: XCTestCase {

    // MARK: - Fixtures

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func projectWithKeyframe(
        clipId: String = "media-1",
        clipStart: Double = 1.0,
        keyframeId: String = "kf-1",
        keyframeRelativeTime: Float = 0.5
    ) -> TimelineProject {
        let keyframe = StoryKeyframe(
            id: keyframeId,
            time: keyframeRelativeTime,
            x: 0.4, y: 0.6, scale: 1.2, opacity: 0.9,
            easing: .linear
        )
        var media = StoryMediaObject(
            id: clipId, postMediaId: "post-\(clipId)",
            kind: .image, aspectRatio: 1.0
        )
        media.startTime = clipStart
        media.duration = 3
        media.keyframes = [keyframe]
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    /// Un keyframe AUDIO — la seule famille dont le losange n'a jamais eu de
    /// géométrie x/y/scale/opacity à animer, seulement un volume, déjà réglable
    /// à la courbe de la fiche CLIP existante (`volumeKeyframes`).
    private func projectWithAudioKeyframe(
        audioId: String = "aud-1",
        audioStart: Float = 2.0,
        keyframeId: String = "kf-vol",
        keyframeRelativeTime: Float = 0.5,
        keyframeVolume: Float = 0.4
    ) -> TimelineProject {
        let keyframe = StoryKeyframe(id: keyframeId, time: keyframeRelativeTime, volume: keyframeVolume)
        var audio = StoryAudioPlayerObject(id: audioId, postMediaId: "post-\(audioId)")
        audio.startTime = audioStart
        audio.duration = 4
        audio.keyframes = [keyframe]
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            audioPlayerObjects: [audio],
            textObjects: []
        )
    }

    private func projectWithTransition(
        transitionId: String = "trans-1",
        fromClipId: String = "media-a",
        toClipId: String = "media-b",
        kind: StoryTransitionKind = .crossfade,
        duration: Float = 0.5
    ) -> TimelineProject {
        var fromMedia = StoryMediaObject(id: fromClipId, postMediaId: "post-a",
                                         kind: .video, aspectRatio: 1.0)
        fromMedia.startTime = 0
        fromMedia.duration = 4
        var toMedia = StoryMediaObject(id: toClipId, postMediaId: "post-b",
                                       kind: .video, aspectRatio: 1.0)
        toMedia.startTime = 4
        toMedia.duration = 4
        let transition = StoryClipTransition(
            id: transitionId,
            fromClipId: fromClipId,
            toClipId: toClipId,
            kind: kind,
            duration: duration,
            easing: .linear
        )
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [fromMedia, toMedia],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: [transition]
        )
    }

    private func projectWithClip(clipId: String = "media-1") -> TimelineProject {
        var media = StoryMediaObject(id: clipId, postMediaId: "post-\(clipId)",
                                     kind: .video, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = 4
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    // MARK: - Dispatcher routing (SelectionKind)

    func test_resolveSelectionKind_clipSelection_returnsClip() {
        let vm = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        vm.selectClip(id: "clip-1")
        guard case .clip(let snapshot) = TimelineInspectorHost.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .clip selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "clip-1")
        XCTAssertEqual(snapshot.kind, .video)
    }

    func test_resolveSelectionKind_keyframeSelection_returnsKeyframe() {
        let vm = makeViewModel(project: projectWithKeyframe(keyframeId: "kf-1"))
        vm.selectClip(id: "kf-1")
        guard case .keyframe(let snapshot, let clipId) =
                TimelineInspectorHost.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .keyframe selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "kf-1")
        XCTAssertEqual(clipId, "media-1")
    }

    func test_resolveSelectionKind_transitionSelection_returnsTransition() {
        let vm = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        vm.selectClip(id: "trans-1")
        guard case .transition(let snapshot) =
                TimelineInspectorHost.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .transition selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "trans-1")
        XCTAssertEqual(snapshot.kind, .crossfade)
    }

    func test_resolveSelectionKind_noSelection_returnsNil() {
        let vm = makeViewModel(project: projectWithClip())
        XCTAssertNil(TimelineInspectorHost.resolveSelectionKind(viewModel: vm))
    }

    func test_resolveSelectionKind_unknownId_returnsNil() {
        let vm = makeViewModel(project: projectWithClip(clipId: "real-clip"))
        vm.selectClip(id: "ghost-id")
        XCTAssertNil(TimelineInspectorHost.resolveSelectionKind(viewModel: vm))
    }

    // MARK: - resolveKeyframeSnapshot

    func test_resolveKeyframeSnapshot_validId_returnsSnapshot() {
        let vm = makeViewModel(project: projectWithKeyframe(
            clipId: "media-1",
            clipStart: 1.0,
            keyframeId: "kf-1",
            keyframeRelativeTime: 0.5
        ))
        vm.selectClip(id: "kf-1")
        guard let resolved = TimelineInspectorHost.resolveKeyframeSnapshot(viewModel: vm) else {
            XCTFail("Expected a keyframe snapshot")
            return
        }
        XCTAssertEqual(resolved.snapshot.id, "kf-1")
        XCTAssertEqual(resolved.clipId, "media-1")
        XCTAssertEqual(resolved.snapshot.absoluteTime, 1.5, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.x, 0.4, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.y, 0.6, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.scale, 1.2, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.opacity, 0.9, accuracy: 0.001)
    }

    func test_resolveKeyframeSnapshot_clipSelection_returnsNil() {
        let vm = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        vm.selectClip(id: "clip-1")
        XCTAssertNil(TimelineInspectorHost.resolveKeyframeSnapshot(viewModel: vm))
    }

    // MARK: - Un losange AUDIO route vers SON CLIP — jamais un cul-de-sac
    // (revue Opus, constat 1 / addendum rev. 2, arbitrage 3). L'audio n'a pas
    // de KeyframeInspector : la seule fiche qui régle son volume est déjà
    // celle du clip (section volume/courbe existante).

    func test_resolveSelectionKind_audioKeyframeSelection_returnsOwningAudioClip() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        vm.selectClip(id: "kf-vol")
        guard case .clip(let snapshot) = TimelineInspectorHost.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Un keyframe AUDIO doit router vers l'inspecteur de SON clip — jamais un cul-de-sac")
            return
        }
        XCTAssertEqual(snapshot.id, "aud-1")
        XCTAssertEqual(snapshot.kind, .audio)
    }

    func test_resolveKeyframeSnapshot_audioKeyframeId_returnsNil() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        vm.selectClip(id: "kf-vol")
        XCTAssertNil(TimelineInspectorHost.resolveKeyframeSnapshot(viewModel: vm),
                     "L'audio n'a pas de KeyframeInspector dédié — ce keyframe route vers le clip, jamais vers ici")
    }

    // MARK: - La normalisation au BUS

    /// La fiche qu'un losange audio ouvre — interrogée sur l'id TAPÉ, comme
    /// le fait la garde d'ouverture avant toute normalisation.
    func test_selectionKind_audioKeyframeId_resolvesToTheOwningClip() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        guard case .clip(let snapshot) = TimelineInspectorHost.selectionKind(for: "kf-vol", viewModel: vm) else {
            XCTFail("Un losange audio doit résoudre vers la fiche de SON clip")
            return
        }
        XCTAssertEqual(snapshot.id, "aud-1")
        XCTAssertEqual(snapshot.kind, .audio)
    }

    func test_resolvedOwnerId_audioKeyframeId_returnsTheOwningClipId() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        XCTAssertEqual(TimelineInspectorHost.resolvedOwnerId(for: "kf-vol", viewModel: vm), "aud-1",
                       "C'est cet id que le bus doit porter — pas celui du losange")
    }

    /// La normalisation ne connaît QUE les keyframes audio : un losange de
    /// média garde son `KeyframeInspector` propre, son id EST déjà celui que
    /// le bus doit porter — il ne doit jamais se faire rabattre sur son clip.
    func test_resolvedOwnerId_mediaKeyframeId_returnsTheIdItself() {
        let vm = makeViewModel(project: projectWithKeyframe(clipId: "media-1", keyframeId: "kf-1"))
        XCTAssertEqual(TimelineInspectorHost.resolvedOwnerId(for: "kf-1", viewModel: vm), "kf-1")
    }

    /// Ni un id de clip, ni un id inconnu : la normalisation est l'identité
    /// partout ailleurs.
    func test_resolvedOwnerId_clipIdAndUnknownId_returnTheIdItself() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        XCTAssertEqual(TimelineInspectorHost.resolvedOwnerId(for: "aud-1", viewModel: vm), "aud-1")
        XCTAssertEqual(TimelineInspectorHost.resolvedOwnerId(for: "nope", viewModel: vm), "nope")
    }

    func test_presentedSelection_audioKeyframeTap_opensTheClipInspector_neverADeadEnd() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        TimelineInspectorHost.inspectIfResolvable(id: "kf-vol", viewModel: vm)
        guard case .clip(let snapshot) = TimelineInspectorHost.presentedSelection(viewModel: vm) else {
            XCTFail("Un tap sur un losange audio doit ouvrir la fiche du clip — avant ce correctif la sheet ne s'ouvrait jamais")
            return
        }
        XCTAssertEqual(snapshot.id, "aud-1")
    }

    // MARK: - La sélection n'est posée QUE si un inspecteur va s'ouvrir
    // (addendum rév. 2, arbitrage 3 — second volet du constat 1 : le tap qui
    // ne résout rien n'ouvrait aucune fiche ET écrasait la sélection en
    // cours, sans laisser à l'utilisateur le moindre signal.)

    func test_inspectIfResolvable_idNoInspectorResolves_leavesTheCurrentSelectionIntact() {
        let vm = makeViewModel(project: projectWithClip(clipId: "media-1"))
        vm.inspectClip(id: "media-1")

        TimelineInspectorHost.inspectIfResolvable(id: Plan2DLayout.drawingTrackID, viewModel: vm)

        XCTAssertEqual(vm.selection.selectedClipId, "media-1",
                       "Un id qu'aucun résolveur ne connaît ne doit pas emporter la sélection en cours")
        XCTAssertEqual(vm.selection.inspectedClipId, "media-1",
                       "La fiche ouverte ne doit pas se refermer sur un tap qui n'ouvre rien")
        guard case .clip(let snapshot) = TimelineInspectorHost.presentedSelection(viewModel: vm) else {
            XCTFail("La fiche du clip consulté doit rester à l'écran")
            return
        }
        XCTAssertEqual(snapshot.id, "media-1")
    }

    /// Le losange audio ouvre la fiche de son clip — et le BUS de sélection
    /// porte l'id de ce clip, pas celui du losange. Router au seul niveau de
    /// la PRÉSENTATION laissait `selectedClipId` sur `kf-vol` : la fiche
    /// montrait `aud-1` pendant que les commandes, l'anneau du plan et les
    /// poignées de bord visaient un id qu'aucune piste ne porte (revue DoD
    /// de D6c, constat 1 — la divergence bus/fiche).
    func test_inspectIfResolvable_audioKeyframeId_posesTheOwningClipOnTheSelectionBus() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))

        TimelineInspectorHost.inspectIfResolvable(id: "kf-vol", viewModel: vm)

        XCTAssertEqual(vm.selection.selectedClipId, "aud-1",
                       "Le bus doit porter l'id du PORTEUR — c'est lui que lisent addKeyframeAtPlayhead, splitSelectedAtPlayhead, l'anneau du plan et les poignées de bord")
        XCTAssertEqual(vm.selection.inspectedClipId, "aud-1",
                       "L'invariant inspectedClipId == selectedClipId ne souffre aucune exception")
        guard case .clip(let snapshot) = TimelineInspectorHost.presentedSelection(viewModel: vm) else {
            XCTFail("Le losange audio doit ouvrir la fiche de SON clip")
            return
        }
        XCTAssertEqual(snapshot.id, "aud-1")
    }

    /// Ce que la seule comparaison de `snapshot.id` ne pouvait pas voir : le
    /// bouton « Point de volume » — la SEULE surface d'édition de la courbe,
    /// celle qui justifie tout l'arbitrage 3 — appelle
    /// `addKeyframeAtPlayhead(volume:)`, qui lit `selectedClipId`. Un bus
    /// resté sur l'id du losange le rendait INERTE, sans effet ni message.
    func test_addVolumePoint_afterTappingAnAudioKeyframe_landsOnTheOwningClip() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        TimelineInspectorHost.inspectIfResolvable(id: "kf-vol", viewModel: vm)
        vm.scrub(to: 3.0, precise: true)

        vm.addKeyframeAtPlayhead(volume: 0.7)

        XCTAssertEqual(vm.project.audioPlayerObjects.first?.keyframes?.count, 2,
                       "Le point de volume doit se poser sur aud-1 — la commande vise selectedClipId, pas la fiche rendue")
    }

    /// Les deux autres surfaces bornées par la même égalité : le plan
    /// surligne `track.id == selectedTrackId` et ne pose ses poignées de bord
    /// que là. Un id de keyframe ne désigne AUCUNE piste — la piste consultée
    /// perdait son anneau, la piste audio n'en gagnait pas, et le rognage de
    /// ce clip devenait impossible.
    func test_inspectIfResolvable_audioKeyframeId_selectsATrackThePlanCanHighlightAndTrim() {
        let vm = makeViewModel(project: projectWithAudioKeyframe(audioId: "aud-1", keyframeId: "kf-vol"))
        TimelineInspectorHost.inspectIfResolvable(id: "kf-vol", viewModel: vm)

        let tracks = Plan2DLayout.tracks(from: Plan2DProjectAdapter.effects(from: vm.project),
                                         slideDuration: Double(vm.project.slideDuration))
        XCTAssertTrue(tracks.contains { $0.id == vm.selection.selectedClipId },
                      "La sélection doit désigner une PISTE du plan — sinon l'anneau ne se dessine nulle part")
        let zones = Plan2DView.edgeHandleZones(tracks: tracks,
                                               selectedTrackId: vm.selection.selectedClipId,
                                               zoom: .fit, laneWidth: 300,
                                               slideDuration: Double(vm.project.slideDuration))
        XCTAssertEqual(Set(zones.map(\.trackId)), ["aud-1"],
                       "Les poignées de bord doivent se poser sur la piste audio — son rognage reste possible")
    }

    /// Le clip SYNTHÉTIQUE reste sélectionnable : il RÉSOUT (`.clip`), c'est
    /// `shouldShowClipInspector` qui décide ensuite de ne pas ouvrir de sheet
    /// vide. La garde ne coupe que ce qu'AUCUN résolveur ne connaît — sinon
    /// elle emporterait avec elle l'anneau de sélection du fond, délibérément
    /// conservé.
    func test_inspectIfResolvable_syntheticClipId_stillMovesTheSelection() {
        let syntheticId = "\(StoryComposerViewModel.syntheticTimelineClipIdPrefix)slide-1"
        let vm = makeViewModel(project: projectWithClip(clipId: syntheticId))

        TimelineInspectorHost.inspectIfResolvable(id: syntheticId, viewModel: vm)

        XCTAssertEqual(vm.selection.selectedClipId, syntheticId,
                       "Un fond synthétique se sélectionne toujours — seule sa sheet reste fermée")
        XCTAssertNil(TimelineInspectorHost.presentedSelection(viewModel: vm),
                     "Et aucune fiche vide ne s'ouvre pour lui")
    }

    // MARK: - resolveTransitionSnapshot

    func test_resolveTransitionSnapshot_validId_returnsSnapshot() {
        let vm = makeViewModel(project: projectWithTransition(
            transitionId: "trans-1",
            fromClipId: "a",
            toClipId: "b",
            kind: .dissolve,
            duration: 0.75
        ))
        vm.selectClip(id: "trans-1")
        guard let snapshot = TimelineInspectorHost.resolveTransitionSnapshot(viewModel: vm) else {
            XCTFail("Expected a transition snapshot")
            return
        }
        XCTAssertEqual(snapshot.id, "trans-1")
        XCTAssertEqual(snapshot.fromClipId, "a")
        XCTAssertEqual(snapshot.toClipId, "b")
        XCTAssertEqual(snapshot.kind, .dissolve)
        XCTAssertEqual(snapshot.duration, 0.75, accuracy: 0.001)
    }

    func test_resolveTransitionSnapshot_unknownId_returnsNil() {
        let vm = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        vm.selectClip(id: "trans-ghost")
        XCTAssertNil(TimelineInspectorHost.resolveTransitionSnapshot(viewModel: vm))
    }

    // MARK: - Unified view hosts the inspector (no more dead-end selection)

    /// The SINGLE timeline view (Quick design) must evaluate its body without
    /// crashing for every selection kind — clip, keyframe AND transition —
    /// because the inspector host now overlays it. Before the merge, selecting
    /// a transition in the quick view surfaced nothing at all.
    func test_quickView_bodyDoesNotCrash_forEachSelectionKind() {
        let clipVM = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        clipVM.selectClip(id: "clip-1")
        _ = StoryTimelineView(viewModel: clipVM).body

        let kfVM = makeViewModel(project: projectWithKeyframe(keyframeId: "kf-1"))
        kfVM.selectClip(id: "kf-1")
        _ = StoryTimelineView(viewModel: kfVM).body

        let transVM = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        transVM.selectClip(id: "trans-1")
        _ = StoryTimelineView(viewModel: transVM).body
    }

    /// Host view itself renders standalone for each branch.
    func test_hostBody_doesNotCrash_forEachSelectionKind() {
        let clipVM = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        clipVM.selectClip(id: "clip-1")
        _ = TimelineInspectorHost(viewModel: clipVM).body

        let transVM = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        transVM.selectClip(id: "trans-1")
        _ = TimelineInspectorHost(viewModel: transVM).body
    }
}
