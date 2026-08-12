import XCTest
@testable import Meeshy

// MARK: - Carte des posts (retour user 2026-08-12)

/// L'accès à la carte des posts est un bouton TOUJOURS VISIBLE dans le slot
/// trailing du header du feed (basculement liste ↔ carte à un tap) — pas un
/// onglet, pas une entrée de menu de création, pas un long-press caché.
@MainActor
final class FeedPostsMapSourceGuardTests: XCTestCase {

    private func viewsDirectory() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func source(_ file: String) throws -> String {
        try String(contentsOf: viewsDirectory().appendingPathComponent(file), encoding: .utf8)
    }

    func test_feedHeader_carriesPostsMapEntryPoint() throws {
        let feed = try source("FeedView.swift")
        XCTAssertTrue(
            feed.contains("trailing: { postsMapButton }"),
            "Le header du feed doit porter le bouton carte dans son slot " +
            "trailing — point d'entrée permanent de la carte des posts."
        )
        XCTAssertTrue(
            feed.contains("FeedPostsMapView(posts: locatedPosts)"),
            "Le bouton doit présenter FeedPostsMapView avec les posts " +
            "géolocalisés (locatedPosts, source unique bouton + carte)."
        )
        XCTAssertTrue(
            feed.contains("router.push(.postDetail(post.id, post))"),
            "Un tap sur la carte d'un post sélectionné doit fermer la carte " +
            "et router vers le détail du post."
        )
    }

    func test_mapView_clustersAndFitsAnnotations() throws {
        let map = try source("FeedPostsMapView.swift")
        XCTAssertTrue(
            map.contains("clusteringIdentifier = \"feed-post\""),
            "Les pins doivent se regrouper (clustering natif MKMarkerAnnotationView) " +
            "— une zone dense sans clustering est illisible."
        )
        XCTAssertTrue(
            map.contains("showAnnotations("),
            "La caméra doit cadrer l'ensemble des pins à l'ouverture."
        )
        XCTAssertTrue(
            map.contains("guard ids != appliedPostIds else { return }"),
            "Les annotations ne se rejouent que quand l'ensemble des posts " +
            "change — updateUIView se déclenche aussi pour la sélection et " +
            "reposer les pins ferait clignoter la carte."
        )
    }

    func test_mapView_emptyState_isExplicit() throws {
        let map = try source("FeedPostsMapView.swift")
        XCTAssertTrue(
            map.contains("feed.map.empty.title"),
            "Cache vide de posts localisés : un état vide explicite, jamais " +
            "une carte muette (principe Instant App des états vides)."
        )
    }
}
