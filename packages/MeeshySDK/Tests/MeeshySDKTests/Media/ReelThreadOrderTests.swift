import Foundation
import Testing
@testable import MeeshySDK

/// **L'ordre du fil des réels est stable sous le lecteur (#9702)** — pure.
///
/// Miroir de `holdReelThread` (`apps/web/src/lib/reels/thread.test.ts`). Le cas
/// de recette du 2026-10-09 est le premier témoin : ouvert sur le réel 14, le
/// pager devenait [13 … 01, image, vidéo, 14] au retour de la passerelle, qui
/// fait couler les réels déjà vus — « suivant » n'existait plus.
@Suite("ReelThreadOrder — l'ordre du fil ne bouge pas sous le lecteur")
struct ReelThreadOrderTests {

    struct Reel: Identifiable, Equatable {
        let id: String
        var likes = 0
    }

    typealias Law = ReelThreadOrder

    static func reels(_ ids: String...) -> [Reel] { ids.map { Reel(id: $0) } }
    static func ids(_ items: [Reel]) -> [String] { items.map(\.id) }

    // MARK: - Une relecture

    @Test("le réel d'ouverture garde la tête quand la passerelle le reclasse en queue")
    func openingReelKeepsItsPlaceWhenServerSinksIt() {
        let merged = Law.refreshed(
            current: Self.reels("r14", "r13", "r12"),
            anchorId: "r14",
            served: Self.reels("r13", "r12", "r11", "image", "video", "r14")
        )
        #expect(Self.ids(merged) == ["r14", "r13", "r12", "r11", "image", "video"])
    }

    @Test("ce qui PRÉCÈDE le réel regardé ne bouge pas, ce qui le SUIT prend l'ordre servi")
    func prefixIsFrozenAndTailFollowsTheServer() {
        let merged = Law.refreshed(
            current: Self.reels("a", "b", "c", "d", "e"),
            anchorId: "c",
            served: Self.reels("e", "c", "a", "f", "d", "b")
        )
        #expect(Self.ids(merged) == ["a", "b", "c", "e", "f", "d"])
    }

    @Test("un réel regardé que la passerelle ne sert pas (graine exclue, réel du lecteur) reste affiché")
    func anchorAbsentFromServedStaysDisplayed() {
        let merged = Law.refreshed(current: Self.reels("seed", "x"), anchorId: "seed", served: Self.reels("y", "z"))
        #expect(Self.ids(merged) == ["seed", "y", "z"])
    }

    @Test("un réel gardé à sa place prend sa donnée la plus récente")
    func heldReelTakesItsLatestData() {
        let merged = Law.refreshed(
            current: [Reel(id: "a", likes: 1), Reel(id: "b", likes: 1)],
            anchorId: "a",
            served: [Reel(id: "b", likes: 7), Reel(id: "a", likes: 9)]
        )
        #expect(merged == [Reel(id: "a", likes: 9), Reel(id: "b", likes: 7)])
    }

    @Test("sans réel regardé, ou inconnu de la liste, l'ordre servi s'applique tel quel")
    func withoutAnchorTheServedOrderApplies() {
        let served = Self.reels("b", "a")
        #expect(Self.ids(Law.refreshed(current: Self.reels("a", "b"), anchorId: nil, served: served)) == ["b", "a"])
        #expect(Self.ids(Law.refreshed(current: Self.reels("a", "b"), anchorId: "zz", served: served)) == ["b", "a"])
        #expect(Self.ids(Law.refreshed(current: [], anchorId: nil, served: served)) == ["b", "a"])
    }

    @Test("une identité servie deux fois ne paraît qu'une fois")
    func servedDuplicatesAreDropped() {
        let merged = Law.refreshed(current: Self.reels("a"), anchorId: "a", served: Self.reels("b", "b", "a", "c"))
        #expect(Self.ids(merged) == ["a", "b", "c"])
    }

    // MARK: - Une page de plus

    @Test("une page de plus s'ajoute en queue, sans déplacer ni doubler ce qui est là")
    func nextPageAppendsAtTheTail() {
        let merged = Law.appended(current: Self.reels("a", "b", "c"), served: Self.reels("c", "d", "a", "e"))
        #expect(Self.ids(merged) == ["a", "b", "c", "d", "e"])
    }

    // MARK: - Ce que la fenêtre de préchargement peut atteindre

    @Test("la portée est bornée au rayon maximal de la fenêtre, des deux côtés")
    func scopeIsBoundedByTheMaxRadius() {
        let ids = (0..<40).map { "r\($0)" }
        let scope = Law.preloadScope(ids: ids, anchorId: "r20")
        #expect(scope.neighbours.first == "r10")
        #expect(scope.neighbours.last == "r30")
        #expect(scope.neighbours.count == 2 * ReelPreloadWindow.maxRadius + 1)
    }

    @Test("la portée change quand la suite est reclassée, pas quand une page s'ajoute hors de portée")
    func scopeChangesOnlyWithinReach() {
        let before = Law.preloadScope(ids: ["a", "b", "c", "d"], anchorId: "a", radius: 2)
        let reordered = Law.preloadScope(ids: ["a", "c", "b", "d"], anchorId: "a", radius: 2)
        let grown = Law.preloadScope(ids: ["a", "b", "c", "d", "e"], anchorId: "a", radius: 2)
        #expect(before.neighbours == ["a", "b", "c"])
        #expect(reordered != before)
        #expect(grown == before)
    }

    @Test("dans une liste courte, passer au réel suivant change la portée")
    func scopeChangesWithTheWatchedReelInAShortList() {
        let ids = ["a", "b", "c"]
        #expect(Law.preloadScope(ids: ids, anchorId: "a") != Law.preloadScope(ids: ids, anchorId: "b"))
    }

    @Test("sans réel regardé dans la liste, aucun voisin")
    func noNeighbourWithoutAnchor() {
        #expect(Law.preloadScope(ids: ["a", "b"], anchorId: nil).neighbours.isEmpty)
        #expect(Law.preloadScope(ids: ["a", "b"], anchorId: "zz").neighbours.isEmpty)
        #expect(Law.preloadScope(ids: [String](), anchorId: "a").neighbours.isEmpty)
    }
}
