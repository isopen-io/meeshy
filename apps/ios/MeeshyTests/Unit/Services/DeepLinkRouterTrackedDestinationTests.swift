import XCTest
@testable import Meeshy
import MeeshySDK

/// `DeepLinkRouter.trackedDestination` mappe un `/l/<token>` résolu vers un
/// `DeepLink`. Fonction pure.
///
/// Supersession 2026-08-18 — le repli universel `.joinLink(identifier: token)`
/// est SUPPRIMÉ. Le token d'un `/l/` est un `TrackingLink.token` de six
/// caractères ; le pousser dans la voie jointure appelait
/// `GET /anonymous/link/<token>`, qui répond 404 par construction, et l'écran
/// affichait « Lien introuvable » — pour TOUT lien externe, TOUT lien
/// désactivé, et toute story de plus de 24 h (son expiration désactive ses
/// liens de suivi). Seul `kind == "conversation"` désigne un token qui EST un
/// `linkId` : lui seul garde la voie jointure.
@MainActor
final class DeepLinkRouterTrackedDestinationTests: XCTestCase {

    private func resolved(kind: String? = nil, type: String? = nil,
                          targetId: String? = nil, originalUrl: String? = nil,
                          isActive: Bool? = true) -> ResolvedTrackedLink {
        ResolvedTrackedLink(kind: kind, targetType: type, targetId: targetId,
                            originalUrl: originalUrl, sharerId: nil,
                            isActive: isActive, expiresAt: nil)
    }

    func test_conversation_routesToJoinLink_withToken() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(kind: "conversation", type: "CONVERSATION", targetId: "conv1"), token: "mshy_x")
        XCTAssertEqual(d, .joinLink(identifier: "mshy_x"))
    }

    func test_reel_routesToPostDetail() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(kind: "tracking", type: "REEL", targetId: "p1"), token: "tok")
        XCTAssertEqual(d, .postDetail(postId: "p1"))
    }

    func test_post_and_status_routeToPostDetail() {
        XCTAssertEqual(
            DeepLinkRouter.trackedDestination(for: resolved(type: "POST", targetId: "p1"), token: "tok"),
            .postDetail(postId: "p1"))
        XCTAssertEqual(
            DeepLinkRouter.trackedDestination(for: resolved(type: "STATUS", targetId: "p2"), token: "tok"),
            .postDetail(postId: "p2"))
    }

    func test_story_routesToStoryDetail() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "STORY", targetId: "s1"), token: "tok")
        XCTAssertEqual(d, .storyDetail(postId: "s1"))
    }

    func test_profile_routesToUserProfile() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "PROFILE", targetId: "u1"), token: "tok")
        XCTAssertEqual(d, .userProfile(username: "u1"))
    }

    // MARK: - Supersession 2026-08-18

    /// Une story expirée désactive ses liens de suivi (`deactivatePostTrackingLinks`).
    /// Le lien doit continuer d'OUVRIR la story : c'est l'écran de destination qui
    /// porte l'état « Story indisponible », pas un toast d'erreur de jointure.
    func test_inactiveLink_stillOpensItsTypedTarget() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "STORY", targetId: "s1", isActive: false), token: "tok")
        XCTAssertEqual(d, .storyDetail(postId: "s1"))
    }

    /// Façade `/l/` d'une URL postée dans un message : `targetType == EXTERNAL`,
    /// la cible vit sur le web. Elle s'ouvre, elle ne « rejoint » rien.
    func test_externalTarget_opensItsOriginalUrl() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "EXTERNAL", originalUrl: "https://example.com/a"), token: "tok")
        XCTAssertEqual(d, .externalLink(url: URL(string: "https://example.com/a")!))
    }

    /// `originalUrl` porte la vérité même quand `targetType` manque ou n'est pas
    /// connu du client : une URL Meeshy y est reparsée vers sa destination in-app.
    func test_unknownTargetType_fallsBackToParsingTheOriginalUrl() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "SOMETHING_NEW", originalUrl: "https://meeshy.me/story/s9"),
            token: "tok")
        XCTAssertEqual(d, .storyDetail(postId: "s9"))
    }

    func test_missingTargetId_fallsBackToParsingTheOriginalUrl() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "POST", targetId: nil, originalUrl: "https://meeshy.me/feeds/post/p7"),
            token: "tok")
        XCTAssertEqual(d, .postDetail(postId: "p7"))
    }

    /// Rien à résoudre et rien à ouvrir : on le DIT, on ne détourne pas vers une
    /// jointure de conversation qui répondra 404.
    func test_nilResolution_reportsAnUnresolvedLink_neverAJoin() {
        XCTAssertEqual(DeepLinkRouter.trackedDestination(for: nil, token: "tok"),
                       .unresolvedTrackedLink(token: "tok"))
    }

    func test_resolutionWithoutTargetNorUrl_reportsAnUnresolvedLink() {
        XCTAssertEqual(
            DeepLinkRouter.trackedDestination(for: resolved(type: "POST"), token: "tok"),
            .unresolvedTrackedLink(token: "tok"))
    }

    /// Une `originalUrl` non exploitable (schéma non http) ne devient pas une
    /// ouverture externe : `.unresolvedTrackedLink` reste la seule issue honnête.
    func test_nonWebOriginalUrl_isNotTreatedAsAnExternalOpen() {
        XCTAssertEqual(
            DeepLinkRouter.trackedDestination(
                for: resolved(type: "EXTERNAL", originalUrl: "javascript:alert(1)"), token: "tok"),
            .unresolvedTrackedLink(token: "tok"))
    }
}
