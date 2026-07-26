import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// DurationHandle — le pin direct de la durée de slide (Option A : la
/// timeline peut ÉTENDRE au-delà du contenu ou ROGNER en deçà ; le commit
/// écrit `effects.timelineDuration`).
@MainActor
final class TimelineViewModelSlideDurationTests: XCTestCase {

    private func makeSUT(slideDuration: Float = 6) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: slideDuration,
                                              mediaObjects: [], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_setSlideDuration_extendsBeyondContent() async {
        let vm = await makeSUT(slideDuration: 6)
        vm.setSlideDuration(12)
        XCTAssertEqual(vm.project.slideDuration, 12, accuracy: 0.001)
    }

    func test_setSlideDuration_cropsAndClampsPlayheadInside() async {
        let vm = await makeSUT(slideDuration: 10)
        vm.scrub(to: 8)
        vm.setSlideDuration(4)
        XCTAssertEqual(vm.project.slideDuration, 4, accuracy: 0.001)
        XCTAssertLessThanOrEqual(vm.currentTime, 4,
                                 "Rogner la slide sous le playhead doit ramener le playhead dans la fenêtre")
    }

    func test_setSlideDuration_clampsToSaneRange() async {
        let vm = await makeSUT()
        vm.setSlideDuration(0.2)
        XCTAssertEqual(vm.project.slideDuration, 1, accuracy: 0.001, "Plancher 1 s")
        vm.setSlideDuration(9999)
        XCTAssertEqual(vm.project.slideDuration, 600, accuracy: 0.001, "Plafond 600 s")
    }

    // MARK: - Duration always reflects current content (design doc 2026-07-18)

    private func makeSUT(mediaObjects: [StoryMediaObject]) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let longestWindow = mediaObjects.compactMap { m in m.duration.map { (m.startTime ?? 0) + $0 } }.max() ?? 6
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: Float(max(6, longestWindow)),
                                              mediaObjects: mediaObjects, audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_trimClipEnd_shrinkingBelowSlideDuration_recomputesSlideDuration() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        // Shrink the only clip from 10s to 4s — nothing else on the slide,
        // so the auto rule falls back to the 6s static floor.
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01,
                       "Duration must shrink to the new auto-computed value, not stay pinned at the old 10s.")
    }

    func test_trimClipEnd_recompute_firesDurationDidAutoAdjust_whenValueChanges() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)
        XCTAssertNotNil(sut.durationDidAutoAdjust)
        XCTAssertEqual(sut.durationDidAutoAdjust?.from ?? -1, 10, accuracy: 0.01)
        XCTAssertEqual(sut.durationDidAutoAdjust?.to ?? -1, 6, accuracy: 0.01)
    }

    func test_trimClipEnd_recompute_doesNotFire_whenValueUnchanged() async {
        // Slide already at the auto-computed value (10s from a 10s clip) —
        // a trim that keeps the clip at 10s must not fire a no-op toast.
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: 0.0001) // effectively unchanged after clamping
        XCTAssertNil(sut.durationDidAutoAdjust)
    }

    func test_deleteClip_recomputesSlideDuration() async {
        let long = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let short = StoryMediaObject(id: "m2", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 3)
        let sut = await makeSUT(mediaObjects: [long, short])
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        sut.deleteClip(id: "m1")

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01,
                       "Only the 3s clip remains — auto duration falls back to the 6s static floor.")
    }

    func test_addMedia_extendsSlideDurationToNewLongestWindow() async {
        let sut = await makeSUT(mediaObjects: [])
        sut.addMedia(id: "m1", postMediaId: "pm1", kind: .video, startTime: 0, duration: 12)
        XCTAssertEqual(sut.project.slideDuration, 12, accuracy: 0.01)
    }

    func test_splitSelectedAtPlayhead_recomputesSlideDuration() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.selectClip(id: "m1")
        sut.scrub(to: 4, precise: true)
        sut.splitSelectedAtPlayhead()
        // Splitting doesn't change total content span (4s + 6s = 10s) — duration unchanged.
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)
    }

    func test_endClipDrag_movingClipShorter_recomputesSlideDuration() async {
        // Moving a clip earlier can shrink the longest window too — Move must
        // recompute on gesture end just like trim/split/delete/add, not only
        // grow (the old extendSlideDurationIfNeeded was grow-only).
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 4, duration: 6)
        let sut = await makeSUT(mediaObjects: [media]) // window = 4+6 = 10
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        sut.beginClipDrag(clipId: "m1")
        sut.dragClipMoved(rawTime: 0, snapCandidates: [])
        sut.endClipDrag()

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01,
                       "Window is now 0+6=6 — falls back to the 6s static floor.")
    }

    func test_dragClipMoved_midDrag_suppressesDurationDidAutoAdjust() async {
        // project.slideDuration already updates live on every drag frame (via
        // applyClipPosition -> recomputeSlideDuration), but the toast signal
        // must stay nil while the gesture is still in flight so it doesn't
        // spam 60 times/sec — it should only surface once, on endClipDrag().
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 4, duration: 6)
        let sut = await makeSUT(mediaObjects: [media]) // window = 4+6 = 10
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        sut.beginClipDrag(clipId: "m1")
        sut.dragClipMoved(rawTime: 0, snapCandidates: [])

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01,
                       "project.slideDuration updates live mid-drag...")
        XCTAssertNil(sut.durationDidAutoAdjust,
                     "...but the toast must stay suppressed while selection.activeDrag is still non-nil.")
    }

    func test_endClipDrag_firesDurationDidAutoAdjust_exactlyOnceWithFinalValue() async {
        // Once the gesture ends, endClipDrag() clears activeDrag THEN calls
        // recomputeSlideDuration() again — this is the single point where the
        // suppressed toast fires, carrying the final (from, to) values.
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 4, duration: 6)
        let sut = await makeSUT(mediaObjects: [media]) // window = 4+6 = 10

        sut.beginClipDrag(clipId: "m1")
        sut.dragClipMoved(rawTime: 0, snapCandidates: [])
        XCTAssertNil(sut.durationDidAutoAdjust, "Still suppressed mid-drag.")

        sut.endClipDrag()

        XCTAssertEqual(sut.durationDidAutoAdjust?.from ?? -1, 10, accuracy: 0.01)
        XCTAssertEqual(sut.durationDidAutoAdjust?.to ?? -1, 6, accuracy: 0.01)
    }

    func test_endClipDrag_noNetMovement_doesNotLeakBaselineIntoLaterEdit() async {
        // A drag that releases at its exact original position takes the
        // "unchanged" early-return in endClipDrag() — that path must also clear
        // slideDurationBeforeDrag (same as cancelClipDrag() already does),
        // otherwise a LATER, unrelated edit's toast uses a stale pre-drag baseline.
        // This test reproduces the bug on the prior commit (5487a2fca) and verifies
        // the fix (review finding).
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 4, duration: 6)
        let sut = await makeSUT(mediaObjects: [media]) // window = 4+6 = 10
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        // No-op drag: begin, don't actually move, end.
        sut.beginClipDrag(clipId: "m1")
        sut.endClipDrag()
        XCTAssertNil(sut.durationDidAutoAdjust, "No-op drag must not fire a toast.")

        // Unrelated edit: manually resize the slide via the duration handle.
        // This doesn't trigger recomputeSlideDuration(), so it directly sets
        // project.slideDuration = 20.
        sut.setSlideDuration(20)
        XCTAssertEqual(sut.project.slideDuration, 20, accuracy: 0.01)

        // Content edit: add a second clip. This calls recomputeSlideDuration().
        // The auto value is still 10 (max of windows [10, 3]), which differs from
        // the current value (20), so a toast SHOULD fire with (from: 20, to: 10).
        //
        // BUG ON 5487a2fca: No toast fires because slideDurationBeforeDrag = 10
        // leaks from the no-op drag, so toastBaseline = 10, and abs(10-10) < 0.05
        // suppresses the toast.
        //
        // FIX: endClipDrag() must clear slideDurationBeforeDrag in the
        // "unchanged" branch, so toastBaseline = 20, and the toast fires correctly.
        sut.addMedia(id: "m2", postMediaId: "pm2", kind: .video, startTime: 0, duration: 3)
        XCTAssertNotNil(sut.durationDidAutoAdjust,
                        "Toast must fire when auto duration (10s) differs from manual pin (20s).")
        XCTAssertEqual(sut.durationDidAutoAdjust?.from ?? -1, 20, accuracy: 0.01,
                       "Toast must use the ACTUAL prior value (20), not the stale pre-drag baseline (10).")
        XCTAssertEqual(sut.durationDidAutoAdjust?.to ?? -1, 10, accuracy: 0.01)
    }

    // MARK: - Undo / redo must restore the duration too

    /// Chaque chemin d'édition recalcule la durée de slide — SAUF `undo()` et
    /// `redo()`, qui rejouaient la commande sur le projet sans jamais toucher
    /// à `project.slideDuration`. Résultat : annuler un trim restaure bien le
    /// clip, mais la règle graduée et la longueur des pistes restent figées
    /// sur la valeur d'APRÈS l'édition annulée. La timeline ment sur ce qui
    /// va réellement jouer, et le seul moyen de la resynchroniser était de
    /// provoquer une autre édition.
    func test_undo_afterTrim_restoresSlideDuration() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)
        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01, "Pré-condition : le trim a bien rétréci la slide.")

        sut.undo()

        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01,
                       "Annuler le trim doit rendre à la slide la durée que le contenu restauré impose.")
    }

    func test_redo_afterUndoneTrim_reappliesSlideDuration() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])

        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)
        sut.undo()
        sut.redo()

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01,
                       "Rétablir le trim doit re-rétrécir la slide, exactement comme le trim d'origine.")
    }

    func test_undo_afterDelete_restoresSlideDuration() async {
        let long = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let short = StoryMediaObject(id: "m2", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 3)
        let sut = await makeSUT(mediaObjects: [long, short])

        sut.deleteClip(id: "m1")
        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01)

        sut.undo()

        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01,
                       "Le clip de 10 s est de retour : la slide doit redevenir aussi longue que lui.")
    }

    /// Le playhead ne doit jamais rester hors de la fenêtre après un undo qui
    /// RACCOURCIT la slide — même invariant que `setSlideDuration`.
    func test_undo_shrinkingTheSlide_pullsPlayheadBackInside() async {
        let sut = await makeSUT(mediaObjects: [])
        sut.addMedia(id: "m1", postMediaId: "pm1", kind: .video, startTime: 0, duration: 20)
        XCTAssertEqual(sut.project.slideDuration, 20, accuracy: 0.01)
        sut.scrub(to: 18, precise: true)

        sut.undo()

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01, "Plus aucun contenu : plancher 6 s.")
        XCTAssertLessThanOrEqual(sut.currentTime, 6,
                                 "Le playhead ne peut pas rester à 18 s dans une slide de 6 s.")
    }

    /// Le toast « la durée a été recalculée automatiquement » explique un
    /// EFFET DE BORD que l'utilisateur n'a pas demandé. Un undo/redo est au
    /// contraire une demande explicite de revenir à un état connu : annoncer
    /// le changement de durée y serait du bruit.
    func test_undo_doesNotAnnounceTheDurationChange() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)
        sut.durationDidAutoAdjust = nil

        sut.undo()

        XCTAssertNil(sut.durationDidAutoAdjust,
                     "Undo restaure un état que l'utilisateur a explicitement demandé — pas de toast.")
    }

    func test_redo_doesNotAnnounceTheDurationChange() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)
        sut.undo()
        sut.durationDidAutoAdjust = nil

        sut.redo()

        XCTAssertNil(sut.durationDidAutoAdjust)
    }

    /// Non-régression : le toast d'une édition ORDINAIRE qui suit un undo doit
    /// partir de la valeur réellement à l'écran. Si `undo()` recalculait la
    /// durée sans mettre à jour la baseline, le toast suivant annoncerait un
    /// « from » périmé.
    func test_editAfterUndo_announcesFromTheValueOnScreen() async {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)   // 10 → 6
        sut.undo()                                        // 6 → 10, sans toast
        sut.durationDidAutoAdjust = nil

        sut.addMedia(id: "m2", postMediaId: "pm2", kind: .video, startTime: 0, duration: 25)

        XCTAssertEqual(sut.durationDidAutoAdjust?.from ?? -1, 10, accuracy: 0.01,
                       "Le « from » doit être la durée restaurée par l'undo (10 s), pas la valeur d'avant.")
        XCTAssertEqual(sut.durationDidAutoAdjust?.to ?? -1, 25, accuracy: 0.01)
    }
}
