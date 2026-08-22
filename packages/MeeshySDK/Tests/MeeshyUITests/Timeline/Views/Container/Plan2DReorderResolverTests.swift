import Testing
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// `Plan2DView.onReorder` (D2, gelé) livre un entier — l'index de dépôt dans
/// `tracks`, toutes plans confondus — jamais une mutation de plan/z toute
/// faite (« c'est à l'appelant… de traduire cette position », doc D1). Ce
/// résolveur PUR fait cette traduction : un nouveau z (relatif au voisin
/// déplacé) et le plan que la piste rejoint — l'appelant (D3) décide ensuite
/// QUELLE méthode du ViewModel appeler pour chaque famille.
@Suite("Plan2DReorderResolver — dépôt vers z/plan")
struct Plan2DReorderResolverTests {

    private static let tracks: [Plan2DTrack] = [
        Plan2DTrack(id: "a", label: "a", plane: .fg, z: 3, bar: .ghost),
        Plan2DTrack(id: "b", label: "b", plane: .fg, z: 2, bar: .ghost),
        Plan2DTrack(id: "c", label: "c", plane: .fg, z: 1, bar: .ghost),
        Plan2DTrack(id: "d", label: "d", plane: .content, z: 5, bar: .ghost)
    ]

    @Test("Déposée plus BAS dans la liste : juste EN DESSOUS du voisin qu'elle a rejoint")
    func resolve_droppedLower_landsJustBelowItsNewNeighbor() {
        let outcome = Plan2DReorderResolver.resolve(tracks: Self.tracks, droppedTrackId: "a", toIndex: 2)
        #expect(outcome == .init(newZ: 0, newPlane: .fg), "voisin \"c\" a z=1 : juste dessous = 0")
    }

    @Test("Déposée plus HAUT dans la liste : juste AU-DESSUS du voisin qu'elle a rejoint")
    func resolve_droppedHigher_landsJustAboveItsNewNeighbor() {
        let outcome = Plan2DReorderResolver.resolve(tracks: Self.tracks, droppedTrackId: "c", toIndex: 0)
        #expect(outcome == .init(newZ: 4, newPlane: .fg), "voisin \"a\" a z=3 : juste dessus = 4")
    }

    @Test("Franchir un plan change aussi le plan retourné — pas seulement le z")
    func resolve_droppedAcrossAPlaneBoundary_returnsTheNewPlane() {
        let outcome = Plan2DReorderResolver.resolve(tracks: Self.tracks, droppedTrackId: "a", toIndex: 3)
        #expect(outcome == .init(newZ: 4, newPlane: .content), "voisin \"d\" a z=5, plan .content")
    }

    @Test("Dépôt à la MÊME position : aucun effet")
    func resolve_droppedAtItsOwnPosition_returnsNil() {
        #expect(Plan2DReorderResolver.resolve(tracks: Self.tracks, droppedTrackId: "b", toIndex: 1) == nil)
    }

    @Test("Identifiant introuvable : aucun effet, jamais un crash")
    func resolve_unknownId_returnsNil() {
        #expect(Plan2DReorderResolver.resolve(tracks: Self.tracks, droppedTrackId: "nope", toIndex: 0) == nil)
    }

    @Test("Index hors bornes : clampé, jamais un crash")
    func resolve_outOfBoundsIndex_clampsToTheLastRow() {
        let outcome = Plan2DReorderResolver.resolve(tracks: Self.tracks, droppedTrackId: "a", toIndex: 999)
        #expect(outcome == .init(newZ: 4, newPlane: .content), "clampé sur le dernier index (3, \"d\")")
    }

    @Test("Un seul rang : aucun voisin à rejoindre, aucun effet")
    func resolve_singleTrack_returnsNil() {
        let single = [Plan2DTrack(id: "only", label: "only", plane: .fg, z: 0, bar: .ghost)]
        #expect(Plan2DReorderResolver.resolve(tracks: single, droppedTrackId: "only", toIndex: 0) == nil)
    }
}
