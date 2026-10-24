import UIKit
import XCTest
@testable import Meeshy

/// #11223 — décision porteur 2026-10-24 : seul le DERNIER message arrivé s'anime
/// à son entrée dans le fil. Un lot chargé d'un coup (premier rendu, pagination,
/// rattrapage de reconnexion) apparaît sans animation, et « Réduire les
/// animations » coupe tout. Même énoncé que le web (`lib/view/arrival-motion.ts`).
final class MessageArrivalMotionTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func ago(_ seconds: TimeInterval) -> Date {
        now.addingTimeInterval(-seconds)
    }

    /// Le fil du plus récent au plus ancien, comme `MessageListSnapshotPrep.messageItems`.
    private let history = ["c", "b", "a"]

    private func dates(_ pairs: [String: TimeInterval]) -> (String) -> Date? {
        let base: [String: TimeInterval] = ["a": 600, "b": 500, "c": 400]
        let all = base.merging(pairs) { _, new in new }
        return { key in all[key].map { self.ago($0) } }
    }

    private func animated(
        previous: Set<String>,
        newestFirst: [String],
        createdAt: (String) -> Date?,
        reduceMotion: Bool = false
    ) -> String? {
        MessageArrivalMotion.animated(
            previous: previous,
            newestFirst: newestFirst,
            createdAt: createdAt,
            now: now,
            reduceMotion: reduceMotion
        )
    }

    // MARK: - La règle

    func test_animated_oneRealtimeArrival_animatesIt() {
        XCTAssertEqual(
            animated(previous: Set(history), newestFirst: ["d"] + history, createdAt: dates(["d": 1])),
            "d"
        )
    }

    func test_animated_fiveArrivalsAtOnce_animatesOnlyTheNewest() {
        let burst = ["h", "g", "f", "e", "d"]
        let createdAt = dates(["d": 3, "e": 3, "f": 2, "g": 2, "h": 1])
        XCTAssertEqual(animated(previous: Set(history), newestFirst: burst + history, createdAt: createdAt), "h")
    }

    func test_animated_olderPagePrepended_animatesNothing() {
        let createdAt = dates(["x": 9_000, "y": 8_000])
        XCTAssertNil(animated(previous: Set(history), newestFirst: history + ["y", "x"], createdAt: createdAt))
    }

    func test_animated_firstRender_animatesNothing() {
        XCTAssertNil(animated(previous: [], newestFirst: ["d"] + history, createdAt: dates(["d": 1])))
    }

    func test_animated_entirelyNewWindow_isAFirstRender_animatesNothing() {
        let other = ["r", "q", "p"]
        let createdAt = dates(["p": 120, "q": 60, "r": 1])
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: Set(history), newestFirst: other, createdAt: createdAt, now: now),
            .firstRender
        )
        XCTAssertNil(animated(previous: Set(history), newestFirst: other, createdAt: createdAt))
    }

    func test_animated_reduceMotion_animatesNothing() {
        XCTAssertNil(animated(
            previous: Set(history),
            newestFirst: ["d"] + history,
            createdAt: dates(["d": 1]),
            reduceMotion: true
        ))
    }

    func test_animated_reconnectCatchUp_animatesNothing() {
        let createdAt = dates(["d": 300, "e": 200])
        XCTAssertNil(animated(previous: Set(history), newestFirst: ["e", "d"] + history, createdAt: createdAt))
    }

    func test_animated_nothingNew_animatesNothing() {
        XCTAssertNil(animated(previous: Set(history), newestFirst: history, createdAt: dates([:])))
    }

    // MARK: - La cause

    func test_cause_namesEachOfTheFourCauses() {
        let previous = Set(history)
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: [], newestFirst: history, createdAt: dates([:]), now: now),
            .firstRender
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": 1]), now: now),
            .realtime
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: history + ["x"], createdAt: dates(["x": 9_000]), now: now),
            .pagination
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": 3_600]), now: now),
            .catchUp
        )
    }

    func test_cause_nothingNew_isNil() {
        XCTAssertNil(MessageArrivalMotion.cause(previous: Set(history), newestFirst: history, createdAt: dates([:]), now: now))
    }

    func test_cause_freshnessWindowInclusiveAtItsEdge() {
        let previous = Set(history)
        let window = MessageArrivalMotion.freshnessWindow
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": window]), now: now),
            .realtime
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": window + 1]), now: now),
            .catchUp
        )
    }

    func test_cause_deviceClockBehindServer_futureDateStaysRealtime() {
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: Set(history), newestFirst: ["d"] + history, createdAt: dates(["d": -5]), now: now),
            .realtime
        )
    }

    func test_cause_newestWithoutKnownDate_isCatchUp() {
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: Set(history), newestFirst: ["d"] + history, createdAt: { _ in nil }, now: now),
            .catchUp
        )
    }

    // MARK: - La cellule réalisée tard

    func test_playsOnDisplay_withinTheWindow_plays_beyond_doesNot() {
        let armedAt = now
        XCTAssertTrue(MessageArrivalMotion.playsOnDisplay(armedAt: armedAt, now: armedAt.addingTimeInterval(0.2)))
        XCTAssertFalse(MessageArrivalMotion.playsOnDisplay(
            armedAt: armedAt,
            now: armedAt.addingTimeInterval(MessageArrivalMotion.displayWindow + 0.1)
        ))
    }
}

/// #11223 — le CÂBLAGE de la loi, que `MessageArrivalMotionTests` ne voit pas :
/// l'animateur que le contrôleur tient pose bien l'entrée sur la couche de SA
/// cellule (et nulle part ailleurs), et le contrôleur l'arme à la pose puis la
/// joue au `willDisplay`. Retirer l'une des deux lignes, ou armer contre un
/// rendu précédent vide, rougit ici.
@MainActor
final class MessageArrivalAnimatorTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let history: [MessageListItem] = [.message(localId: "c"), .message(localId: "b"), .message(localId: "a")]
    private let arrival = MessageListItem.message(localId: "d")

    private func createdAt(_ ages: [String: TimeInterval]) -> (MessageListItem) -> Date? {
        { item in
            guard case .message(let localId) = item else { return nil }
            return ages[localId].map { self.now.addingTimeInterval(-$0) }
        }
    }

    private var datedHistory: (MessageListItem) -> Date? {
        createdAt(["a": 600, "b": 500, "c": 400, "d": 1, "z": 9000])
    }

    private func cell() -> UICollectionViewCell {
        UICollectionViewCell(frame: CGRect(x: 0, y: 0, width: 320, height: 44))
    }

    private func entrance(on cell: UICollectionViewCell) -> CAAnimation? {
        cell.layer.animation(forKey: MessageArrivalAnimator.animationKey)
    }

    private func armed(previous: [MessageListItem], next: [MessageListItem], reduceMotion: Bool = false) -> MessageArrivalAnimator {
        var animator = MessageArrivalAnimator()
        animator.arm(
            previous: Set(previous),
            newestFirst: next,
            createdAt: datedHistory,
            now: now,
            reduceMotion: reduceMotion
        )
        return animator
    }

    func test_play_realtimeArrival_addsTheEntranceOnItsCellOnly() {
        var animator = armed(previous: history, next: [arrival] + history)
        let other = cell()
        animator.play(on: other, item: history[0], now: now)
        XCTAssertNil(entrance(on: other), "seule la cellule du message arrivé reçoit l'entrée")
        let target = cell()
        animator.play(on: target, item: arrival, now: now)
        XCTAssertNotNil(entrance(on: target))
    }

    func test_play_isPlayedOnce_aReusedCellDoesNotReplayIt() {
        var animator = armed(previous: history, next: [arrival] + history)
        animator.play(on: cell(), item: arrival, now: now)
        let again = cell()
        animator.play(on: again, item: arrival, now: now)
        XCTAssertNil(entrance(on: again), "la même arrivée ne se rejoue pas à la réalisation suivante de sa cellule")
    }

    func test_play_firstRender_addsNothing() {
        var animator = armed(previous: [], next: [arrival] + history)
        let target = cell()
        animator.play(on: target, item: arrival, now: now)
        XCTAssertNil(entrance(on: target))
    }

    func test_play_olderPage_addsNothing() {
        let older = MessageListItem.message(localId: "z")
        var animator = armed(previous: history, next: history + [older])
        let target = cell()
        animator.play(on: target, item: older, now: now)
        XCTAssertNil(entrance(on: target))
    }

    func test_play_reduceMotion_addsNothing() {
        var animator = armed(previous: history, next: [arrival] + history, reduceMotion: true)
        let target = cell()
        animator.play(on: target, item: arrival, now: now)
        XCTAssertNil(entrance(on: target))
    }

    func test_play_cellRealizedPastTheDisplayWindow_addsNothing() {
        var animator = armed(previous: history, next: [arrival] + history)
        let target = cell()
        animator.play(on: target, item: arrival, now: now.addingTimeInterval(MessageArrivalMotion.displayWindow + 0.1))
        XCTAssertNil(entrance(on: target))
    }

    func test_entrance_lastsTheTwinDuration_onTheTwinCurve_withoutOvershoot() {
        var animator = armed(previous: history, next: [arrival] + history)
        let target = cell()
        animator.play(on: target, item: arrival, now: now)
        XCTAssertEqual(entrance(on: target)?.duration ?? 0, MessageArrivalMotion.duration, accuracy: 0.0001)
        XCTAssertEqual(MessageArrivalMotion.timingControlPoints, [0.22, 1, 0.36, 1],
            "la courbe est celle du web (ARRIVAL_MOTION_CURVE) : même geste, même mouvement")
        XCTAssertTrue(MessageArrivalMotion.timingControlPoints.allSatisfy { $0 <= 1 }, "aucun dépassement : la cellule se pose sans rebond")
    }

    // MARK: - Le contrôleur arme à la pose et joue au willDisplay

    func test_controller_armsAgainstThePreviousPose_beforeNotingTheArrival() throws {
        let text = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/MessageListViewController+ApplySnapshot.swift")
        let arm = try XCTUnwrap(text.range(of: "arrivalMotion.arm(previous: previousSnapshotCount == 0 ? [] : previousItems, newestFirst: messageItems, store: store)"),
            "applySnapshot doit armer l'arrivée contre la pose PRÉCÉDENTE (vide au premier rendu)")
        let note = try XCTUnwrap(text.range(of: "noteArrival(messageItems: messageItems, previousItems: previousItems"))
        XCTAssertLessThan(arm.lowerBound, note.lowerBound, "l'armement précède noteArrival, qui avance la pose de référence")
    }

    func test_controller_playsTheArrivalOnTheCellAboutToBeDisplayed() throws {
        let text = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/MessageListViewController+ScrollDelegate.swift")
        let willDisplay = try XCTUnwrap(text.range(of: "willDisplay cell: UICollectionViewCell"))
        let play = try XCTUnwrap(text.range(of: "arrivalMotion.play(on: cell, item: dataSource.itemIdentifier(for: indexPath))"),
            "willDisplay doit jouer l'arrivée armée sur la cellule réalisée")
        XCTAssertLessThan(willDisplay.lowerBound, play.lowerBound)
    }
}
