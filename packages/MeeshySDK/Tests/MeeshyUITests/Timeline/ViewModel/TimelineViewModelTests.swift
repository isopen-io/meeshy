import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TimelineViewModelTests: XCTestCase {

    private func makeSUT(
        project: TimelineProject = TimelineProjectFactory.emptyProject()
    ) -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    // MARK: - Task 7

    func test_loadProject_emptySlide_initEngineEmpty() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()
        XCTAssertEqual(engine.configureCallCount, 1)
        XCTAssertEqual(sut.project.mediaObjects.count, 0)
        XCTAssertEqual(sut.currentTime, 0)
    }

    // MARK: - Task 8

    func test_selectClip_pushesSelection() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip())
        await sut.awaitConfigured()
        sut.selectClip(id: "clip-1")
        XCTAssertEqual(sut.selection.selectedClipId, "clip-1")
    }

    func test_selectClip_unknownId_clearsSelection() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip())
        await sut.awaitConfigured()
        sut.selectClip(id: "clip-1")
        sut.selectClip(id: nil)
        XCTAssertNil(sut.selection.selectedClipId)
    }

    // MARK: - Task 9

    func test_dragClip_pushesMoveCommand_coalesced() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "clip-1")
        for delta in stride(from: Float(0.05), through: 2.0, by: 0.05) {
            sut.dragClipMoved(rawTime: delta, snapCandidates: [])
        }
        sut.endClipDrag()

        XCTAssertTrue(sut.canUndo, "drag should have pushed at least one command")
        XCTAssertNil(sut.selection.activeDrag, "drag must be cleared after end")

        let snapshot = sut.commandHistorySnapshot()
        XCTAssertEqual(snapshot.commands.count, 1,
                       "Multiple drag frames should coalesce into one MoveClipCommand")

        let clip = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertNotNil(clip)
        XCTAssertEqual(clip?.startTime ?? 0, 2.0, accuracy: 0.05)
    }

    // MARK: - Task 10

    func test_undo_revertsLastCommand_emitsUpdate() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "clip-1")
        sut.dragClipMoved(rawTime: 3.0, snapCandidates: [])
        sut.endClipDrag()

        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 3.0, accuracy: 0.001)
        XCTAssertTrue(sut.canUndo)

        sut.undo()
        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 0.0, accuracy: 0.001)
        XCTAssertFalse(sut.canUndo)
        XCTAssertTrue(sut.canRedo)
    }

    func test_redo_reappliesUndoneCommand() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "clip-1")
        sut.dragClipMoved(rawTime: 3.0, snapCandidates: [])
        sut.endClipDrag()
        sut.undo()
        sut.redo()
        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 3.0, accuracy: 0.001)
    }

    // MARK: - Task 11

    func test_splitAtPlayhead_createsTwoClips() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 4))
        await sut.awaitConfigured()
        sut.selectClip(id: "clip-1")
        sut.scrub(to: 1.5)
        sut.splitSelectedAtPlayhead()

        let medias = sut.project.mediaObjects
        XCTAssertEqual(medias.count, 2, "split should produce two clips")
        let totalDuration = medias.reduce(Double(0)) { $0 + ($1.duration ?? 0) }
        XCTAssertEqual(totalDuration, 4, accuracy: 0.001, "total duration preserved")
    }

    // MARK: - Task 12

    func test_addTransition_overlapsClips() async {
        let (sut, engine) = makeSUT(project: TimelineProjectFactory.projectWithTwoContiguousClips())
        await sut.awaitConfigured()
        engine.reset()

        sut.addTransition(fromClipId: "clip-a", toClipId: "clip-b", kind: .crossfade, duration: 0.5)

        XCTAssertEqual(sut.project.clipTransitions.count, 1)
        XCTAssertEqual(sut.project.clipTransitions.first?.kind, .crossfade)
        XCTAssertEqual(sut.project.clipTransitions.first?.duration ?? -1, 0.5, accuracy: 0.001)
        await sut.awaitConfigured()
        XCTAssertGreaterThanOrEqual(engine.configureCallCount, 1, "engine should reconfigure")
    }

    // MARK: - Task 13

    func test_addKeyframe_atPlayhead_capturesCurrentValues() async {
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.selectClip(id: "clip-1")
        sut.scrub(to: 2.0)
        sut.addKeyframeAtPlayhead(x: 0.3, y: 0.5, scale: 1.2, opacity: 1.0)

        let media = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertNotNil(media?.keyframes)
        XCTAssertEqual(media?.keyframes?.count, 1)
        let kf = media?.keyframes?.first
        XCTAssertEqual(Float(kf?.time ?? -1), 2.0, accuracy: 0.01,
                       "Keyframe time must be relative to clip start, not absolute")
        XCTAssertEqual(kf?.x ?? 0, 0.3, accuracy: 0.001)
        XCTAssertEqual(kf?.scale ?? 0, 1.2, accuracy: 0.001)
    }


    func test_toggleSnap_flipsState() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()
        XCTAssertTrue(sut.isSnapEnabled)
        sut.toggleSnap()
        XCTAssertFalse(sut.isSnapEnabled)
        sut.toggleSnap()
        XCTAssertTrue(sut.isSnapEnabled)
    }

    // MARK: - Phase 3+4 VM review fixes

    func test_endClipDrag_skipsCommand_whenDeltaIsZero() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "v1")
        // Don't move — end immediately at origin
        sut.endClipDrag()

        XCTAssertFalse(sut.canUndo, "No-op drag must not push a command")
    }

    func test_splitAtPlayhead_atClipEnd_clampsRightToMinDuration() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.selectClip(id: "v1")
        sut.scrub(to: 5.0) // exact end of clip
        sut.splitSelectedAtPlayhead()

        let durations = sut.project.mediaObjects.map { $0.duration ?? 0 }.sorted()
        XCTAssertEqual(durations.count, 2)
        XCTAssertGreaterThan(durations[0], 0, "Min duration must be > 0 to satisfy AVPlayer")
    }

    func test_addTransition_rejectsSelfLoop() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.addTransition(fromClipId: "v1", toClipId: "v1", kind: .crossfade, duration: 0.5)
        XCTAssertEqual(sut.project.clipTransitions.count, 0)
    }

    func test_addTransition_rejectsMissingClipIds() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.addTransition(fromClipId: "v1", toClipId: "ghost", kind: .crossfade, duration: 0.5)
        XCTAssertEqual(sut.project.clipTransitions.count, 0)
    }

    func test_scrub_NaN_isNoOp() async {
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.scrub(to: .nan)
        XCTAssertEqual(sut.currentTime, 0, "scrub with NaN must remain at 0")
    }

    func test_cancelClipDrag_restoresOriginalStartTime() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 1.0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.beginClipDrag(clipId: "v1")
        sut.dragClipMoved(rawTime: 3.0, snapCandidates: [])
        sut.cancelClipDrag()
        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 1.0, accuracy: 0.001)
        XCTAssertNil(sut.selection.activeDrag)
        XCTAssertFalse(sut.canUndo)
    }

    func test_onError_callback_setsErrorMessage() async {
        let project = TimelineProjectFactory.emptyProject()
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        await sut.awaitConfigured()
        let testError = NSError(domain: "test", code: 42,
                                userInfo: [NSLocalizedDescriptionKey: "boom"])
        engine.onError?(testError)
        XCTAssertEqual(sut.errorMessage, "boom")
    }

    // MARK: - Wave 2: VM edit methods

    func test_setClipVolume_pushesCommand_andUpdatesProject() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.setClipVolume(id: "v1", volume: 0.5)
        XCTAssertTrue(sut.canUndo, "setClipVolume should push a command onto the stack")
        let media = sut.project.mediaObjects.first { $0.id == "v1" }
        XCTAssertEqual(media?.volume ?? -1, 0.5, accuracy: 0.001,
                       "project volume must reflect the new value")
    }

    func test_deleteClip_removesFromProject_andClearsSelection() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.selectClip(id: "v1")
        sut.deleteClip(id: "v1")
        XCTAssertEqual(sut.project.mediaObjects.count, 0, "clip must be removed from project")
        XCTAssertNil(sut.selection.selectedClipId, "selection must be cleared after delete")
        XCTAssertTrue(sut.canUndo, "deleteClip must push a command")
    }

    func test_changeTransition_modifiesKindAndDuration() async {
        let project = TimelineProjectFactory.projectWithTwoContiguousClips()
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.addTransition(fromClipId: "clip-a", toClipId: "clip-b", kind: .crossfade, duration: 0.5)
        guard let transitionId = sut.project.clipTransitions.first?.id else {
            return XCTFail("addTransition must create a transition first")
        }
        sut.changeTransition(transitionId: transitionId, kind: .dissolve, duration: 0.8)
        let updated = sut.project.clipTransitions.first
        XCTAssertEqual(updated?.kind, .dissolve, "transition kind must be updated")
        XCTAssertEqual(updated?.duration ?? -1, 0.8, accuracy: 0.001,
                       "transition duration must be updated")
    }

    func test_removeTransition_clearsFromProject() async {
        let project = TimelineProjectFactory.projectWithTwoContiguousClips()
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()
        sut.addTransition(fromClipId: "clip-a", toClipId: "clip-b", kind: .crossfade, duration: 0.5)
        guard let transitionId = sut.project.clipTransitions.first?.id else {
            return XCTFail("addTransition must create a transition first")
        }
        sut.removeTransition(transitionId: transitionId)
        XCTAssertEqual(sut.project.clipTransitions.count, 0,
                       "removeTransition must remove the transition from the project")
        XCTAssertTrue(sut.canUndo, "removeTransition must push a command")
    }

    // MARK: - Task 15

    func test_restoreDraft_reapplysCommandHistory() async {
        // Session 1 — perform 2 actions, snapshot the stack.
        let (sut1, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut1.awaitConfigured()
        sut1.beginClipDrag(clipId: "clip-1")
        sut1.dragClipMoved(rawTime: 2.0, snapCandidates: [])
        sut1.endClipDrag()
        sut1.selectClip(id: "clip-1")
        sut1.scrub(to: 0.5)
        sut1.splitSelectedAtPlayhead()
        let snapshot = sut1.commandHistorySnapshot()

        // Session 2 — fresh SUT with the original project and the snapshot replayed.
        let (sut2, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut2.awaitConfigured()
        sut2.restoreCommandHistory(snapshot)

        XCTAssertEqual(sut2.project.mediaObjects.count, sut1.project.mediaObjects.count)
        let starts1 = sut1.project.mediaObjects.compactMap { $0.startTime }.sorted().map { Float($0) }
        let starts2 = sut2.project.mediaObjects.compactMap { $0.startTime }.sorted().map { Float($0) }
        assertFloatArraysEqual(starts1, starts2, accuracy: 0.001)
        XCTAssertTrue(sut2.canUndo)
    }
}

// MARK: - Helpers

private func assertFloatArraysEqual(
    _ a: [Float], _ b: [Float], accuracy: Float,
    file: StaticString = #file, line: UInt = #line
) {
    XCTAssertEqual(a.count, b.count, file: file, line: line)
    for (x, y) in zip(a, b) {
        XCTAssertEqual(x, y, accuracy: accuracy, file: file, line: line)
    }
}
