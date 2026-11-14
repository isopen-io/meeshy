import Testing
import MeeshySDK
@testable import MeeshyUI

/// L'anneau des actes autour du bouton du menu (#17768) : un segment par acte, dans l'ordre, séparés d'un jour égal,
/// allumés dans l'ordre des actes réalisés — la géométrie du web (`menu-acts-ring.tsx`).
@Suite("Jeu Meeshy — la géométrie de l'anneau des actes")
struct MenuActsRingGeometryTests {

    @Test("un segment par acte, allumés dans l'ordre des actes réalisés")
    func oneSegmentPerAct() {
        let segments = MenuActsRingGeometry.segments(for: GameActsRing(done: 2, total: 3))
        #expect(segments.count == 3)
        #expect(segments.map(\.isDone) == [true, true, false])
    }

    @Test("les segments se suivent sans se toucher, du haut et dans le sens des aiguilles")
    func segmentsDoNotOverlap() {
        let segments = MenuActsRingGeometry.segments(for: GameActsRing(done: 0, total: 3))
        #expect(segments.allSatisfy { $0.from < $0.to })
        #expect(zip(segments, segments.dropFirst()).allSatisfy { $0.to < $1.from })
        #expect(segments.first.map { $0.from > 0 } == true)
        #expect(segments.last.map { $0.to < 1 } == true)
    }

    @Test("un jour égal sépare chaque segment, comme sur le web")
    func evenGaps() {
        let segments = MenuActsRingGeometry.segments(for: GameActsRing(done: 1, total: 3))
        for (left, right) in zip(segments, segments.dropFirst()) {
            #expect(abs((right.from - left.to) - MenuActsRingGeometry.gap) < 1e-9)
        }
    }

    @Test("un anneau sans acte ne dessine rien")
    func noActNoSegment() {
        #expect(MenuActsRingGeometry.segments(for: GameActsRing(done: 0, total: 0)).isEmpty)
    }
}
