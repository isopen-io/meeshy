import XCTest
@testable import MeeshySDK

/// « J'ai tapé sur un lien de conversation — qui suis-je en entrant ? »
///
/// L'app répondait à cette question par son état d'authentification, et
/// seulement par lui : pas de compte → flux invité ; un compte → jointure
/// SILENCIEUSE avec ce compte. La personne n'a jamais eu le choix, alors que
/// c'est exactement le moment où elle en a un : un lien public s'ouvre à visage
/// découvert ou sous pseudonyme, et cette décision lui appartient.
///
/// Le silence coûtait plus qu'une préférence. Un lien reçu dans un groupe qu'on
/// ne connaît pas engage le compte réel — nom, photo, historique — sans que
/// rien ne le demande, et une jointure ne se défait pas d'un geste.
///
/// La règle est PURE : quatre faits en entrée, une intention en sortie. Elle ne
/// présente rien, ne navigue nulle part, n'appelle pas le réseau — les feuilles
/// et la navigation restent app-side (`MeeshyApp`, `RootView`), conformément à
/// la règle de pureté du SDK.
final class ShareLinkEntryPolicyTests: XCTestCase {

    private func decide(
        authenticated: Bool = true,
        alreadyMember: Bool = false,
        requireAccount: Bool = false,
        storedGuestSession: Bool = false
    ) -> ShareLinkEntryIntent {
        ShareLinkEntryPolicy.intent(
            for: ShareLinkEntryFacts(
                conversationId: "conv-1",
                isAuthenticated: authenticated,
                isAlreadyMember: alreadyMember,
                linkRequiresAccount: requireAccount,
                hasStoredGuestSession: storedGuestSession
            )
        )
    }

    // MARK: - Sans compte sur l'appareil

    func test_intent_noAccount_opensAnonymousJoin() {
        XCTAssertEqual(decide(authenticated: false), .joinAnonymously)
    }

    func test_intent_noAccount_linkRequiresAccount_asksToSignIn() {
        XCTAssertEqual(decide(authenticated: false, requireAccount: true), .requiresAccount)
    }

    /// Un invité déjà passé par ce lien ne le repasse pas : sa session vit dans
    /// `AnonymousSessionStore`, et la lui redemander effacerait son identité
    /// dans cette conversation — la seule qu'il ait.
    func test_intent_noAccount_withStoredSession_resumesIt() {
        XCTAssertEqual(decide(authenticated: false, storedGuestSession: true), .resumeGuestSession)
    }

    // MARK: - Avec un compte sur l'appareil

    func test_intent_authenticated_notMember_offersTheChoice() {
        XCTAssertEqual(decide(authenticated: true), .chooseIdentity(conversationId: "conv-1"))
    }

    /// Déjà membre : il n'y a rien à décider, et poser la question ferait croire
    /// qu'une seconde identité est possible dans une conversation où l'on est
    /// déjà nommé.
    func test_intent_authenticated_alreadyMember_opensDirectly() {
        XCTAssertEqual(
            decide(authenticated: true, alreadyMember: true),
            .openConversation(conversationId: "conv-1")
        )
    }

    /// Le lien exige un compte : proposer l'anonymat serait proposer une porte
    /// que le serveur refusera (403 `REQUIRES_ACCOUNT`).
    func test_intent_authenticated_linkRequiresAccount_joinsWithAccount() {
        XCTAssertEqual(
            decide(authenticated: true, requireAccount: true),
            .joinWithAccount(conversationId: "conv-1")
        )
    }

    /// L'appartenance prime sur l'exigence de compte : les deux mènent au compte,
    /// mais l'une évite un appel de jointure inutile.
    func test_intent_authenticated_memberAndRequiresAccount_opensDirectly() {
        XCTAssertEqual(
            decide(authenticated: true, alreadyMember: true, requireAccount: true),
            .openConversation(conversationId: "conv-1")
        )
    }

    /// Une session invitée dormante n'enlève pas le choix à quelqu'un qui a
    /// maintenant un compte — elle en devient une des deux branches, que la
    /// couche de présentation étiquettera « reprendre en anonyme ».
    func test_intent_authenticated_withStoredGuestSession_stillOffersTheChoice() {
        XCTAssertEqual(
            decide(authenticated: true, storedGuestSession: true),
            .chooseIdentity(conversationId: "conv-1")
        )
    }

    // MARK: - Contre-épreuve de pureté

    func test_intent_isDeterministic_sameFactsSameIntent() {
        let facts = ShareLinkEntryFacts(
            conversationId: "conv-9",
            isAuthenticated: true,
            isAlreadyMember: false,
            linkRequiresAccount: false,
            hasStoredGuestSession: false
        )

        XCTAssertEqual(ShareLinkEntryPolicy.intent(for: facts), ShareLinkEntryPolicy.intent(for: facts))
    }
}
