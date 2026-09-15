import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshySDK
import MeeshyUI

/// #6700 — **ÉDITER UNE STORY OUVRE LE MEUBLE, PAS L'ANCIEN ÉDITEUR.**
///
/// Constat porteur (2026-09-15) : « le système utilise encore l'ancien composer
/// au lieu du nouveau ». Mesuré : les CINQ hôtes qui offrent « Modifier »
/// montaient `EditPostSheet` sans jamais regarder le TYPE du post, alors que
/// `post.isStory` existe et sert déjà à leur affichage.
///
/// Ces témoins INSTANCIENT la décision et observent sa valeur. Ils ne lisent
/// aucune source — sauf la garde de CÂBLAGE, qui n'a pas d'autre prise : une
/// décision juste que personne n'appelle n'ouvre aucun écran (c'est le défaut
/// que ce lot corrige, pris par l'autre bout).
final class PostEditRouteTests: XCTestCase {

    private func post(type: String) -> FeedPost {
        FeedPost(id: "p-1", author: "ada", authorId: "u-1", type: type, content: "…")
    }

    // MARK: - La décision

    func test_uneStory_ouvreLeMeuble() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "STORY"), hasStoryComposer: true), .meuble)
    }

    func test_unPost_gardeLAncienEditeur() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "POST"), hasStoryComposer: true), .legacySheet)
    }

    func test_unReel_gardeLAncienEditeur() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "REEL"), hasStoryComposer: true), .legacySheet)
    }

    /// Le type est celui que le SERVEUR sert, en minuscules comprises — la même
    /// lecture que `FeedPost.isStory`, jamais une comparaison à part.
    func test_leTypeSeLitCommeIsStory_casseIndifferente() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "story"), hasStoryComposer: true), .meuble)
    }

    // MARK: - La DÉGRADATION, jamais un piège

    /// Sans `StoryViewModel` dans l'environnement — le cas des feuilles qui ne
    /// portent pas les objets de la racine — la porte retombe sur l'ancien
    /// éditeur au lieu de trapper. C'est le contrat de
    /// `SocialChromeEnvironment` (`nil` DÉGRADE), et la classe de crash que
    /// `SheetEnvironmentObjectGuardTests` garde.
    func test_sansCompositeurDansLEnvironnement_uneStoryRetombeSurLAncienEditeur() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "STORY"), hasStoryComposer: false), .legacySheet)
    }

    func test_sansPost_aucuneRouteNeSInvente() {
        XCTAssertEqual(PostEditRoute.resolve(for: nil, hasStoryComposer: true), .legacySheet)
    }

    // MARK: - Le CÂBLAGE : les cinq portes consultent la décision

    func test_lesCinqPortes_consultentLaDecision() throws {
        for chemin in [
            "Meeshy/Features/Main/Views/PostDetailView.swift",
            "Meeshy/Features/Main/Views/FeedView.swift",
            "Meeshy/Features/Main/Views/ProfileUserPostsList.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView.swift",
            "Meeshy/Features/Main/Views/RootViewComponents.swift",
        ] {
            let texte = try MyStoriesSourceCorpus.text(of: chemin)
            XCTAssertTrue(
                texte.contains(".postEditCover("),
                "\(chemin) : cette porte monte encore l'ancien éditeur sans regarder le type du post."
            )
        }
    }
}
