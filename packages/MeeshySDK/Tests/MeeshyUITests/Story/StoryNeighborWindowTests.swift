import Foundation
import Testing
@testable import MeeshyUI

/// La loi PURE de préparation des voisines du lecteur de stories (#10348) :
/// dès que N est à l'écran, N±1 puis N±2 passent AVANT toute autre slide, la
/// voisine dans la direction du geste en tête, à travers les frontières de
/// groupe exactement comme le lecteur les traverse.
@Suite("StoryNeighborWindow")
struct StoryNeighborWindowTests {

    /// g0 : 3 slides, entrée 0 · g1 : 4 slides, entrée 2 · g2 : UNE slide ·
    /// g3 : 2 slides, entrée 1.
    private func shelf() -> [StoryGroupShape] {
        [
            StoryGroupShape(slideCount: 3, entryIndex: 0),
            StoryGroupShape(slideCount: 4, entryIndex: 2),
            StoryGroupShape(slideCount: 1, entryIndex: 0),
            StoryGroupShape(slideCount: 2, entryIndex: 1),
        ]
    }

    private func at(_ group: Int, _ slide: Int) -> StorySlidePosition {
        StorySlidePosition(group: group, slide: slide)
    }

    private func positions(
        _ current: StorySlidePosition,
        _ groups: [StoryGroupShape],
        _ direction: StoryNavigationDirection
    ) -> [StorySlidePosition] {
        StoryNeighborWindow.preparations(from: current, groups: groups, direction: direction).map(\.position)
    }

    // MARK: - L'anneau N±1, N±2 passe en tête

    @Test func test_preparations_forwardInsideGroup_ringComesFirstWithForwardNeighborLeading() {
        let order = positions(at(1, 1), shelf(), .forward)

        #expect(Array(order.prefix(4)) == [at(1, 2), at(1, 0), at(1, 3), at(0, 2)])
    }

    @Test func test_preparations_backwardInsideGroup_backwardNeighborLeads() {
        let order = positions(at(1, 1), shelf(), .backward)

        #expect(Array(order.prefix(4)) == [at(1, 0), at(1, 2), at(0, 2), at(1, 3)])
    }

    @Test func test_preparations_ringCarriesItsDistance_andNothingOutsideTheRingPrecedesIt() {
        let preparations = StoryNeighborWindow.preparations(from: at(1, 1), groups: shelf(), direction: .forward)
        let distances = preparations.map(\.distance)

        #expect(Array(distances.prefix(4)) == [1, 1, 2, 2])
        #expect(distances.dropFirst(4).allSatisfy { $0 == nil })
    }

    // MARK: - Frontières de groupe

    @Test func test_preparations_lastSlideForward_crossesIntoNextGroupEntry_andTwoGroupsAwayWhenNeighborHasOneSlide() {
        let order = positions(at(1, 3), shelf(), .forward)

        #expect(Array(order.prefix(4)) == [at(2, 0), at(1, 2), at(3, 1), at(1, 1)])
    }

    @Test func test_preparations_firstSlideBackward_crossesIntoPreviousGroupLastSlide_andTwoGroupsBack() {
        let order = positions(at(3, 0), shelf(), .backward)

        #expect(Array(order.prefix(3)) == [at(2, 0), at(3, 1), at(1, 3)])
    }

    @Test func test_preparations_forwardIntoNextGroup_landsOnItsEntryNotItsFirstSlide() {
        let order = positions(at(0, 2), shelf(), .forward)

        #expect(order.first == at(1, 2))
        #expect(order.dropFirst().first == at(0, 1))
        #expect(Array(order.prefix(4)).contains(at(1, 3)))
        #expect(!Array(order.prefix(4)).contains(at(1, 0)))
    }

    @Test func test_preparations_emptyGroupsAreSkippedAtTheBoundary() {
        let groups = [
            StoryGroupShape(slideCount: 2, entryIndex: 0),
            StoryGroupShape(slideCount: 0, entryIndex: 0),
            StoryGroupShape(slideCount: 2, entryIndex: 0),
        ]

        let order = positions(at(0, 1), groups, .forward)

        #expect(order.first == at(2, 0))
        #expect(!order.contains { $0.group == 1 })
    }

    // MARK: - Au-delà de l'anneau : reste du groupe, groupes suivants, groupe précédent

    @Test func test_preparations_afterTheRing_restOfGroupByDistance_thenFollowingGroupEntries_thenPreviousLanding() {
        let groups = [
            StoryGroupShape(slideCount: 3, entryIndex: 0),
            StoryGroupShape(slideCount: 10, entryIndex: 0),
            StoryGroupShape(slideCount: 5, entryIndex: 3),
            StoryGroupShape(slideCount: 4, entryIndex: 0),
            StoryGroupShape(slideCount: 4, entryIndex: 0),
        ]

        let order = positions(at(1, 4), groups, .forward)

        #expect(Array(order.prefix(4)) == [at(1, 5), at(1, 3), at(1, 6), at(1, 2)])
        #expect(Array(order.dropFirst(4).prefix(5)) == [at(1, 7), at(1, 1), at(1, 8), at(1, 0), at(1, 9)])
        #expect(Array(order.dropFirst(9).prefix(4)) == [at(2, 3), at(2, 4), at(3, 0), at(3, 1)])
        #expect(order.last == at(0, 2))
        #expect(!order.contains { $0.group == 4 })
    }

    // MARK: - Borne

    @Test func test_preparations_isBoundedUniqueAndNeverContainsTheCurrentSlide() {
        let groups = Array(repeating: StoryGroupShape(slideCount: 40, entryIndex: 5), count: 12)
        let current = at(6, 20)

        let order = positions(current, groups, .forward)

        #expect(order.count <= StoryNeighborWindow.Budget.standard.maximumCount)
        #expect(Set(order).count == order.count)
        #expect(!order.contains(current))
    }

    @Test func test_preparations_outOfRangeCurrent_isEmpty() {
        #expect(positions(at(9, 0), shelf(), .forward).isEmpty)
        #expect(positions(at(1, 7), shelf(), .forward).isEmpty)
    }

    // MARK: - Balayage d'auteur

    @Test func test_authorSwipeLandings_nextGroupEntryThenPreviousGroupLastSlide() {
        #expect(StoryNeighborWindow.authorSwipeLandings(from: 1, groups: shelf()) == [at(2, 0), at(0, 2)])
        #expect(StoryNeighborWindow.authorSwipeLandings(from: 2, groups: shelf()) == [at(3, 1), at(1, 3)])
        #expect(StoryNeighborWindow.authorSwipeLandings(from: 0, groups: shelf()) == [at(1, 2)])
        #expect(StoryNeighborWindow.authorSwipeLandings(from: 4, groups: shelf()).isEmpty)
    }

    // MARK: - Direction du dernier passage

    @Test func test_direction_isReadFromTheMoveBetweenTwoPositions() {
        #expect(StoryNeighborWindow.direction(from: at(0, 1), to: at(0, 2), otherwise: .backward) == .forward)
        #expect(StoryNeighborWindow.direction(from: at(1, 0), to: at(0, 2), otherwise: .forward) == .backward)
        #expect(StoryNeighborWindow.direction(from: at(0, 2), to: at(1, 2), otherwise: .backward) == .forward)
        #expect(StoryNeighborWindow.direction(from: at(1, 3), to: at(1, 1), otherwise: .forward) == .backward)
    }

    @Test func test_direction_withoutAMove_keepsTheFallback() {
        #expect(StoryNeighborWindow.direction(from: nil, to: at(0, 0), otherwise: .backward) == .backward)
        #expect(StoryNeighborWindow.direction(from: at(2, 0), to: at(2, 0), otherwise: .forward) == .forward)
    }
}
