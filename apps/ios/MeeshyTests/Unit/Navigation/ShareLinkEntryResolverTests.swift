import Foundation
import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Le lien de partage, sur un appareil qui a déjà un compte.
///
/// `RootView` et `iPadRootView` rejoignaient toutes deux SILENCIEUSEMENT avec le
/// compte présent. Un lien reçu dans un groupe inconnu engageait donc le compte
/// réel — nom, photo, historique — sans que rien ne le demande, et une jointure
/// ne se défait pas d'un geste.
///
/// Les deux vues portaient leur copie de ce raccourci, et auraient porté leur
/// copie du remplacement. La collecte des faits vit donc ici, à un exemplaire ;
/// la décision, elle, est une règle pure du SDK (`ShareLinkEntryPolicy`, testée
/// séparément). Ce fichier couvre la JONCTION : les bons faits sont-ils
/// réunis, et que se passe-t-il quand le lien ne se résout pas ?
@MainActor
final class ShareLinkEntryResolverTests: XCTestCase {

    // MARK: - Double

    /// Panne de réseau, sans dépendre d'un cas précis de `MeeshyError` — la
    /// règle ne distingue pas les motifs d'échec, seulement l'échec.
    private enum ProbeError: Error { case offline }

    private final class MockShareLinkInfoProvider: ShareLinkInfoProviding, @unchecked Sendable {
        var result: Result<ShareLinkInfo, Error> = .failure(ProbeError.offline)
        private(set) var getLinkInfoCallCount = 0
        private(set) var lastIdentifier: String?

        func getLinkInfo(identifier: String) async throws -> ShareLinkInfo {
            getLinkInfoCallCount += 1
            lastIdentifier = identifier
            return try result.get()
        }
    }

    private func makeLinkInfo(
        conversationId: String = "conv-1",
        title: String = "For iOS Testing",
        requireAccount: Bool = false
    ) -> ShareLinkInfo {
        JSONStub.decode("""
        {
          "id": "link-db-id",
          "linkId": "mshy_abc",
          "name": "Lien 7j",
          "description": null,
          "expiresAt": null,
          "maxUses": null,
          "currentUses": 1,
          "maxConcurrentUsers": null,
          "currentConcurrentUsers": 0,
          "requireAccount": \(requireAccount),
          "requireNickname": false,
          "requireEmail": false,
          "requireBirthday": false,
          "allowedLanguages": [],
          "conversation": {
            "id": "\(conversationId)",
            "title": "\(title)",
            "description": null,
            "type": "group",
            "createdAt": "2026-02-25T22:21:26.871Z"
          },
          "creator": {
            "id": "u1",
            "username": "alice",
            "firstName": "Alice",
            "lastName": "Smith",
            "displayName": "Alice Smith",
            "avatar": null
          },
          "stats": {
            "totalParticipants": 3,
            "memberCount": 2,
            "anonymousCount": 1,
            "languageCount": 1,
            "spokenLanguages": ["fr"]
          }
        }
        """)
    }

    private func resolve(
        provider: MockShareLinkInfoProvider,
        knownConversationIds: Set<String> = [],
        storedGuestSession: Bool = false
    ) async -> ShareLinkEntryResolver.Resolution? {
        await ShareLinkEntryResolver.resolve(
            identifier: "mshy_abc",
            isAuthenticated: true,
            knownConversationIds: knownConversationIds,
            service: provider,
            storedGuestSessionLookup: { _ in storedGuestSession }
        )
    }

    // MARK: - La question est posée

    func test_resolve_authenticatedNonMember_offersTheChoice() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo())

        let resolution = await resolve(provider: provider)

        XCTAssertEqual(resolution?.intent, .chooseIdentity(conversationId: "conv-1"))
    }

    /// Le titre nourrit l'en-tête de la feuille : sans lui, on demande à
    /// quelqu'un de choisir une identité sans lui dire pour QUELLE conversation.
    func test_resolve_carriesTheConversationTitle() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo(title: "For iOS Testing"))

        let resolution = await resolve(provider: provider)

        XCTAssertEqual(resolution?.conversationTitle, "For iOS Testing")
    }

    // MARK: - La question ne se pose pas

    func test_resolve_alreadyMember_opensWithoutAsking() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo(conversationId: "conv-7"))

        let resolution = await resolve(provider: provider, knownConversationIds: ["conv-7"])

        XCTAssertEqual(resolution?.intent, .openConversation(conversationId: "conv-7"))
    }

    /// Proposer l'anonymat sur un lien qui exige un compte serait proposer une
    /// porte que le serveur refuse (403 `REQUIRES_ACCOUNT`).
    func test_resolve_linkRequiresAccount_joinsWithAccountWithoutAsking() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo(requireAccount: true))

        let resolution = await resolve(provider: provider)

        XCTAssertEqual(resolution?.intent, .joinWithAccount(conversationId: "conv-1"))
    }

    // MARK: - L'appartenance se lit sur la liste EN MÉMOIRE

    /// Une liste paginée peut ignorer une conversation ancienne. Le faux « pas
    /// membre » qui en résulte coûte une question de plus, jamais une mauvaise
    /// entrée — la branche « continuer avec mon compte » appelle une jointure
    /// idempotente.
    func test_resolve_conversationAbsentFromLoadedPage_asksRatherThanAssumes() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo(conversationId: "conv-old"))

        let resolution = await resolve(provider: provider, knownConversationIds: ["conv-recent"])

        XCTAssertEqual(resolution?.intent, .chooseIdentity(conversationId: "conv-old"))
    }

    // MARK: - Le lien ne se résout pas

    /// `nil` fait retomber l'appelant sur la jointure par compte, c'est-à-dire
    /// sur le comportement d'avant. Un lien qui n'ouvre rien serait pire qu'un
    /// lien qui ne propose pas le choix.
    func test_resolve_networkFailure_yieldsNilSoCallerFallsBack() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .failure(ProbeError.offline)

        let resolution = await resolve(provider: provider)

        XCTAssertNil(resolution)
    }

    func test_resolve_queriesTheLinkThatWasTapped() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo())

        _ = await resolve(provider: provider)

        XCTAssertEqual(provider.getLinkInfoCallCount, 1)
        XCTAssertEqual(provider.lastIdentifier, "mshy_abc")
    }

    // MARK: - Session invitée dormante

    /// Elle n'enlève pas le choix à quelqu'un qui a maintenant un compte : elle
    /// en devient une branche, que la feuille étiquette « reprendre en anonyme ».
    func test_resolve_storedGuestSession_stillOffersTheChoice() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo())

        let resolution = await resolve(provider: provider, storedGuestSession: true)

        XCTAssertEqual(resolution?.intent, .chooseIdentity(conversationId: "conv-1"))
    }

    // MARK: - La page d'invitation (#7795)

    /// Un compte présent voit la MÊME page que sans compte, avec le lien déjà
    /// résolu : aucun second appel, aucun indicateur de chargement.
    func test_landing_nonMember_carriesTheResolvedLinkAndTheDormantSession() async throws {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo(title: "Nova Club"))

        let resolution = await resolve(provider: provider, storedGuestSession: true)
        let landing = try XCTUnwrap(resolution?.landing(identifier: "mshy_abc"))

        XCTAssertEqual(landing.identifier, "mshy_abc")
        XCTAssertEqual(landing.conversationId, "conv-1")
        XCTAssertEqual(landing.info.conversation.title, "Nova Club")
        XCTAssertTrue(landing.resumesGuestSession)
        XCTAssertEqual(provider.getLinkInfoCallCount, 1)
    }

    /// Un lien qui exige un compte engageait le compte EN SILENCE : la page
    /// s'affiche désormais aussi, avec le seul choix du compte.
    func test_landing_linkRequiringAccount_isShownRatherThanJoiningSilently() async throws {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo(requireAccount: true))

        let resolution = await resolve(provider: provider)
        let landing = try XCTUnwrap(resolution?.landing(identifier: "mshy_abc"))

        XCTAssertEqual(landing.info.landingChoices(isSignedIn: true), [.joinWithAccount])
    }

    /// Le choix vit en `@State` dans `RootView` et `iPadRootView`, deux vues
    /// dont la TAILLE est un budget (`ConversationViewValueSizeGuardTests`).
    /// Le lien résolu qu'il transporte pèse plusieurs centaines d'octets : en
    /// ligne, il a poussé `iPadRootView` à 8 449 o, au-delà des 8 192 permis.
    func test_landing_choice_keepsTheResolvedLinkOffTheHostViewValue() {
        XCTAssertLessThanOrEqual(MemoryLayout<ShareLinkIdentityChoice?>.size, 96)
    }

    func test_landing_alreadyMember_showsNothing() async {
        let provider = MockShareLinkInfoProvider()
        provider.result = .success(makeLinkInfo(conversationId: "conv-7"))

        let resolution = await resolve(provider: provider, knownConversationIds: ["conv-7"])

        XCTAssertNil(resolution?.landing(identifier: "mshy_abc"))
    }
}
