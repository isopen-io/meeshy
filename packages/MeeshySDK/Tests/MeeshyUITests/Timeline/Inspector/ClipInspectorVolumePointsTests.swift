import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// La fiche est le seul endroit où l'on pose et retire un point de volume — la
/// piste ne fait que 52 pt et ses gestes servent déjà au déplacement et au
/// rognage. On teste ici la préparation des données, sans monter la vue.
@MainActor
final class ClipInspectorVolumePointsTests: XCTestCase {

    // MARK: - Helpers purs de la fiche

    /// Le modèle garde les points dans l'ordre d'INSERTION : poser un point
    /// avant un autre les afficherait à l'envers dans la liste.
    func test_pointsAreListedInChronologicalOrder() {
        let points = [
            ClipInspector.ClipSnapshot.VolumePoint(id: "b", absoluteTime: 4, volume: 0.2),
            ClipInspector.ClipSnapshot.VolumePoint(id: "a", absoluteTime: 1, volume: 0.9)
        ]
        XCTAssertEqual(ClipInspector.sortedVolumePoints(points).map(\.id), ["a", "b"])
    }

    func test_gainLabel_readsAsAPercentage() {
        XCTAssertEqual(ClipInspector.formatGain(0.75), "75 %")
    }

    /// Le libellé ne masque pas la saturation : au-delà de 100 %, il l'affiche.
    func test_gainLabel_showsGainAboveOneHundred() {
        XCTAssertEqual(ClipInspector.formatGain(StoryVolume.maxGain), "200 %")
    }

    func test_gainLabel_roundsToTheNearestPercent() {
        XCTAssertEqual(ClipInspector.formatGain(0.336), "34 %")
    }

    // MARK: - Résolution depuis le projet

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    /// Le point est stocké RELATIVEMENT au début du clip. L'afficher tel quel
    /// sur un clip qui démarre à 5 s afficherait un instant faux — la fiche
    /// suit la convention de `KeyframeSnapshot.absoluteTime`.
    func test_audioPointsAreExposedInAbsoluteTime() {
        let audio = StoryAudioPlayerObject(
            id: "a1", postMediaId: "m1", startTime: 5,
            keyframes: [StoryKeyframe(time: 2, volume: 0.4)]
        )
        let vm = makeViewModel(project: TimelineProject(slideId: "s1", slideDuration: 20,
                                                        audioPlayerObjects: [audio]))
        vm.selectClip(id: "a1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snapshot?.volumeKeyframes.count, 1)
        XCTAssertEqual(snapshot?.volumeKeyframes.first?.absoluteTime, 7)
        XCTAssertEqual(snapshot?.volumeKeyframes.first?.volume, 0.4)
    }

    /// Un point de POSITION n'a rien à faire dans la liste des volumes.
    func test_keyframesWithoutVolumeAreExcluded() {
        let audio = StoryAudioPlayerObject(
            id: "a1", postMediaId: "m1", startTime: 0,
            keyframes: [StoryKeyframe(time: 1, x: 0.5), StoryKeyframe(time: 2, volume: 0.6)]
        )
        let vm = makeViewModel(project: TimelineProject(slideId: "s1", slideDuration: 20,
                                                        audioPlayerObjects: [audio]))
        vm.selectClip(id: "a1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snapshot?.volumeKeyframes.count, 1)
        XCTAssertEqual(snapshot?.volumeKeyframes.first?.volume, 0.6)
    }

    func test_mediaPointsAreExposedToo() {
        let media = StoryMediaObject(id: "v1", postMediaId: "m1", mediaType: "video",
                                     aspectRatio: 9.0 / 16.0, startTime: 3,
                                     keyframes: [StoryKeyframe(time: 1, volume: 1.5)])
        let vm = makeViewModel(project: TimelineProject(slideId: "s1", slideDuration: 20,
                                                        mediaObjects: [media]))
        vm.selectClip(id: "v1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snapshot?.volumeKeyframes.first?.absoluteTime, 4)
        XCTAssertEqual(snapshot?.volumeKeyframes.first?.volume, 1.5)
    }

    /// Bout-en-bout : poser depuis la fiche, relire depuis la fiche.
    func test_addingAPointFromTheInspectorSurfacesItInTheSnapshot() {
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "m1", startTime: 0)
        let vm = makeViewModel(project: TimelineProject(slideId: "s1", slideDuration: 20,
                                                        audioPlayerObjects: [audio]))
        vm.selectClip(id: "a1")
        vm.scrub(to: 6)
        vm.addKeyframeAtPlayhead(volume: 0.3)

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snapshot?.volumeKeyframes.first?.absoluteTime, 6)

        vm.deleteKeyframe(clipId: "a1", keyframeId: snapshot!.volumeKeyframes.first!.id)
        XCTAssertTrue(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?
            .volumeKeyframes.isEmpty ?? false)
    }
}

/// Le bloc d'automation doit être RÉELLEMENT monté dans la fiche. Les
/// snapshots de `ClipInspectorSnapshotTests` ne l'auraient pas vu : ils ne
/// portent aucun point de volume, donc leur rendu est inchangé.
@MainActor
final class ClipInspectorVolumeSectionMountedTests: XCTestCase {

    private func height(volumeKeyframes: [ClipInspector.ClipSnapshot.VolumePoint],
                        kind: ClipInspector.ClipSnapshot.Kind = .audio) -> CGFloat {
        let clip = ClipInspector.ClipSnapshot(
            id: "c1", displayName: "clip", kind: kind,
            startTime: 0, duration: 5, volume: 1,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: false, isBackground: false,
            volumeKeyframes: volumeKeyframes
        )
        let host = UIHostingController(rootView: ClipInspector(
            presentation: .sheet, clip: clip,
            onVolumeChanged: { _ in }, onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in }, onLoopToggled: { _ in },
            onBackgroundToggled: { _ in }, onAddKeyframe: {}, onDelete: {}
        ).frame(width: 360))
        return host.sizeThatFits(in: CGSize(width: 360,
                                            height: CGFloat.greatestFiniteMagnitude)).height
    }

    /// Chaque point posé ajoute sa ligne : sans montage réel, les deux hauteurs
    /// seraient identiques.
    func test_listedPointsGrowTheInspector() {
        let empty = height(volumeKeyframes: [])
        let two = height(volumeKeyframes: [
            .init(id: "k1", absoluteTime: 1, volume: 0.5),
            .init(id: "k2", absoluteTime: 3, volume: 0.9)
        ])
        XCTAssertGreaterThan(two, empty,
                             "vide=\(empty) deux points=\(two) — la liste n'est pas rendue")
    }

    /// Un clip sans piste audio n'a ni curseur ni automation : lui proposer de
    /// poser un point de volume offrirait un contrôle sans effet.
    func test_imageClipShowsNoVolumeAutomation() {
        XCTAssertFalse(ClipInspector.hasAudioAffordances(kind: .image))
        let withPoints = height(volumeKeyframes: [.init(id: "k1", absoluteTime: 1, volume: 0.5)],
                                kind: .image)
        let without = height(volumeKeyframes: [], kind: .image)
        XCTAssertEqual(withPoints, without, accuracy: 0.5)
    }
}
