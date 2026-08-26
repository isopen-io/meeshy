import XCTest
@testable import Meeshy

// MARK: - La carte des posts vit DANS « À proximité » (directive user 2026-08-26)

/// **La carte « Posts sur la carte » a fusionné dans « À proximité »** sous un
/// mode Discover réservé au staff de la plateforme (MODERATOR / ADMIN /
/// BIGBOSS). Le bouton carte du header du feed — posé le 2026-08-13 à droite
/// des Réels — n'existe plus ; le header ne porte que DEUX entrées : les Réels
/// et la découverte à proximité.
///
/// Cette garde remplace celle du 13/08 : la directive qu'elle figeait est
/// caduque, et une garde qui exigerait encore le bouton carte ferait
/// mécaniquement rougir la nouvelle règle.
@MainActor
final class NearbyDiscoverModeSourceGuardTests: XCTestCase {

    private func viewsDirectory() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func source(_ file: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: viewsDirectory().appendingPathComponent(file), encoding: .utf8)
        )
    }

    /// Les DEUX chemins (iPad `FeedView`, iPhone `ThemedFeedOverlay`) portent la
    /// même paire — c'est la divergence iPhone/iPad qui avait motivé la garde
    /// précédente, et elle vaut toujours.
    func test_feedHeader_carriesReelsAndNearbyOnly_noMapButton() throws {
        for file in ["FeedView.swift", "RootViewComponents.swift"] {
            let feed = try source(file)
            let actions = try XCTUnwrap(
                block(after: "private var feedHeaderActions: some View", in: feed),
                "\(file) : les actions du header ont disparu."
            )
            let reels = try XCTUnwrap(actions.range(of: "reelsButton"), "\(file) : le bouton Réels reste.")
            let nearby = try XCTUnwrap(actions.range(of: "nearbyButton"), "\(file) : l'entrée à proximité reste.")
            XCTAssertTrue(reels.lowerBound < nearby.lowerBound, "\(file) : Réels puis À proximité.")

            for forbidden in ["postsMapButton", "feed.header.map", "FeedPostsMapView(", "showPostsMap"] {
                XCTAssertFalse(
                    feed.contains(forbidden),
                    "\(file) : « \(forbidden) » — la carte des posts vit désormais DANS " +
                    "« À proximité » (mode Discover, staff seulement), plus dans le header du feed."
                )
            }
            XCTAssertTrue(feed.contains("accessibilityIdentifier(\"feed.header.reels\")"), file)
            XCTAssertTrue(feed.contains("accessibilityIdentifier(\"feed.header.nearby\")"), file)
            XCTAssertTrue(
                feed.contains("router.push(.nearbyDiscovery())"),
                "\(file) : l'entrée de toolbar pousse la route SANS coordonnée."
            )
        }
    }

    /// Le picker de modes ne liste pas les cas en dur : il itère
    /// `availableModes`, seul site où le rôle du lecteur décide. Un segment
    /// « Discover » écrit à la main dans la vue échapperait à cette règle.
    func test_nearbyModePicker_isDrivenByAvailableModes_andDiscoverRendersTheFeedPostsMap() throws {
        let nearby = try source("NearbyDiscoveryView.swift")
        XCTAssertTrue(
            nearby.contains("ForEach(viewModel.availableModes"),
            "le picker de modes doit itérer availableModes — c'est là que le rôle filtre Discover."
        )
        XCTAssertFalse(
            nearby.contains(".tag(NearbyDiscoveryMode.discover)"),
            "aucun segment Discover posé à la main : il passerait sous la règle de rôle."
        )
        XCTAssertTrue(
            nearby.contains("PostsMapRepresentable(posts: viewModel.discoverPosts"),
            "le mode Discover rend la carte des posts du fil (celle du bouton carte d'hier)."
        )
    }

    /// Le wrapper plein écran d'hier n'a plus d'hôte : seule la carte
    /// (`PostsMapRepresentable`) survit, réutilisée par « À proximité ».
    func test_fullScreenMapWrapper_isGone() throws {
        let map = try source("FeedPostsMapView.swift")
        XCTAssertFalse(map.contains("struct FeedPostsMapView"), "le wrapper plein écran est retiré.")
        XCTAssertTrue(map.contains("struct PostsMapRepresentable"), "la carte réutilisable reste.")
        XCTAssertFalse(map.contains("private struct PostsMapRepresentable"), "elle doit être visible de NearbyDiscoveryView.")
    }

    /// Bloc délimité par accolades équilibrées à partir de la première `{` qui
    /// suit `anchor` — sans lui, l'ordre serait mesuré sur le FICHIER entier.
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
}
