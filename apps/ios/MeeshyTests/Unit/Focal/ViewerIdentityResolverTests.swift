import XCTest
import MeeshySDK
@testable import Meeshy

/// F-080 (WS-1) — `ConversationViewerIdentityResolver` : l'UNIQUE point de
/// branchement invité/inscrit du code de peau Focal. Une session anonyme
/// active PRIME (un onglet invité ouvert alors qu'un compte est aussi
/// connecté au même process reste un invité pour CETTE conversation-là).
///
/// `@MainActor` sur la CLASSE (patron `BubbleLocationRenderingTests`) : la
/// cible `Meeshy` isole `@MainActor` par défaut (`SWIFT_DEFAULT_ACTOR_ISOLATION`,
/// `project.yml`) — `AnonymousSessionContext`, `MeeshyUser`/`AuthManaging`
/// (celui-ci explicitement) en héritent, donc les fabriques de ce fichier
/// aussi bien que les témoins eux-mêmes doivent tourner sur l'acteur
/// principal.
@MainActor
final class ViewerIdentityResolverTests: XCTestCase {

    private func makeUser(id: String) -> MeeshyUser {
        MeeshyUser(
            id: id, username: "u", email: nil, firstName: nil, lastName: nil,
            displayName: nil, bio: nil, avatar: nil, avatarThumbHash: nil,
            banner: nil, bannerThumbHash: nil, role: nil, systemLanguage: nil,
            regionalLanguage: nil, isOnline: nil, lastActiveAt: nil,
            createdAt: nil, updatedAt: nil, blockedUserIds: nil
        )
    }

    private func makeAnonymousSession(participantId: String) -> AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: "tok",
            participantId: participantId,
            permissions: ParticipantPermissions(
                canSendMessages: true, canSendFiles: false, canSendImages: false,
                canSendVideos: false, canSendAudios: false, canSendLocations: false,
                canSendLinks: false
            ),
            linkId: "link-1",
            conversationId: "c1"
        )
    }

    func test_resolve_authenticatedUserNoAnonymousSession_returnsRegistered() {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: makeUser(id: "u1"))

        let identity = ConversationViewerIdentityResolver.resolve(authManager: auth, anonymousSession: nil)

        XCTAssertEqual(identity, .registered(userId: "u1"))
        XCTAssertFalse(identity.isAnonymous)
    }

    func test_resolve_anonymousSessionNoAuthenticatedUser_returnsAnonymous() {
        let auth = MockAuthManager()
        let session = makeAnonymousSession(participantId: "p1")

        let identity = ConversationViewerIdentityResolver.resolve(authManager: auth, anonymousSession: session)

        XCTAssertEqual(identity, .anonymous(participantId: "p1"))
        XCTAssertTrue(identity.isAnonymous)
    }

    /// Une session anonyme active prime sur un utilisateur authentifié
    /// coexistant dans le même process — la conversation ouverte via un
    /// lien invité reste invitée, même si un autre compte est connecté.
    func test_resolve_bothPresent_anonymousSessionPrimes() {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: makeUser(id: "u1"))
        let session = makeAnonymousSession(participantId: "p1")

        let identity = ConversationViewerIdentityResolver.resolve(authManager: auth, anonymousSession: session)

        XCTAssertEqual(identity, .anonymous(participantId: "p1"))
    }

    // MARK: - scope

    func test_scope_registered_matchesUserId() {
        let identity = ConversationViewerIdentity.registered(userId: "u1")
        XCTAssertEqual(identity.scope, .registered(userId: "u1"))
    }

    func test_scope_anonymous_matchesParticipantId() {
        let identity = ConversationViewerIdentity.anonymous(participantId: "p1")
        XCTAssertEqual(identity.scope, .anonymous(participantId: "p1"))
    }

    // MARK: - Pont vers la loi gelée — UNIQUE point de branchement

    func test_readingModeIdentity_registered_isNotAnonymous() {
        let identity = ConversationViewerIdentity.registered(userId: "u1")
        XCTAssertFalse(identity.readingModeIdentity.isAnonymous)
    }

    func test_readingModeIdentity_anonymous_isAnonymous() {
        let identity = ConversationViewerIdentity.anonymous(participantId: "p1")
        XCTAssertTrue(identity.readingModeIdentity.isAnonymous)
    }
}
