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
        // Directive user 2026-08-13 : « il faut ajouter le bouton map à côté à
        // droite du bouton Reels ». Le slot trailing porte donc la PAIRE, sur
        // les deux chemins (iPad `FeedView`, iPhone `ThemedFeedOverlay`) — un
        // seul des deux l'aurait fait diverger, comme il divergeait justement
        // avant ce lot (Réels sur iPhone, carte sur iPad, jamais les deux).
        for file in ["FeedView.swift", "RootViewComponents.swift"] {
            let feed = try source(file)
            XCTAssertTrue(
                feed.contains("trailing: { feedHeaderActions }"),
                "\(file) : le header du feed doit porter ses actions dans son " +
                "slot trailing — point d'entrée permanent des Réels et de la carte."
            )
            XCTAssertTrue(
                feed.contains("FeedPostsMapView(posts: locatedPosts)"),
                "\(file) : le bouton doit présenter FeedPostsMapView avec les " +
                "posts géolocalisés (locatedPosts, source unique bouton + carte)."
            )
            XCTAssertTrue(
                feed.contains("router.push(.postDetail(post.id, post))"),
                "\(file) : un tap sur la carte d'un post sélectionné doit fermer " +
                "la carte et router vers le détail du post."
            )
        }
    }

    /// L'ORDRE de lecture est la directive elle-même : la carte est à DROITE des
    /// Réels. Une garde qui se contenterait de leur présence resterait verte si
    /// on les intervertissait.
    func test_theMapButtonSitsToTheRightOfTheReelsButton() throws {
        for file in ["FeedView.swift", "RootViewComponents.swift"] {
            let feed = try source(file)
            let actions = try XCTUnwrap(
                block(after: "private var feedHeaderActions: some View", in: feed),
                "\(file) : les actions du header ont disparu."
            )
            let reels = try XCTUnwrap(
                actions.range(of: "reelsButton"),
                "\(file) : le bouton Réels doit rester dans les actions du header."
            )
            let map = try XCTUnwrap(
                actions.range(of: "postsMapButton"),
                "\(file) : le bouton carte doit vivre à côté des Réels, pas ailleurs."
            )
            XCTAssertTrue(
                reels.lowerBound < map.lowerBound,
                "\(file) : la carte se pose À DROITE des Réels."
            )
            // Boucle fermée : chaque bouton porte SON identifiant. Sans ce lien,
            // renommer une propriété en gardant l'ordre passerait sous la garde.
            XCTAssertTrue(
                feed.contains("accessibilityIdentifier(\"feed.header.reels\")"),
                "\(file) : le bouton Réels reste identifiable."
            )
            XCTAssertTrue(
                feed.contains("accessibilityIdentifier(\"feed.header.map\")"),
                "\(file) : le bouton carte reste identifiable."
            )
        }
    }

    /// Bloc délimité par accolades équilibrées à partir de la première `{` qui
    /// suit `anchor` — sans lui, l'ordre serait mesuré sur le FICHIER entier,
    /// où les deux identifiants apparaissent aussi dans les corps des boutons.
    private func block(after anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor),
              let open = code[start.upperBound...].firstIndex(of: "{") else { return nil }
        var depth = 0
        var index = open
        while index < code.endIndex {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" {
                depth -= 1
                if depth == 0 { return String(code[code.index(after: open)..<index]) }
            }
            index = code.index(after: index)
        }
        return nil
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
