import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class UncachedProfileLoadingTests: XCTestCase {

    func test_cachedProfile_rendEmpty() async {
        let sut = UncachedProfileLoading()

        let result = await sut.cachedProfile(for: "u-bob")

        guard case .empty = result else { return XCTFail("attendu .empty, reçu \(result)") }
    }

    func test_cachedStats_rendEmpty() async {
        let sut = UncachedProfileLoading()

        let result = await sut.cachedStats(for: "u-bob")

        guard case .empty = result else { return XCTFail("attendu .empty, reçu \(result)") }
    }
}

/// Lire un profil en cache n'est pas le revalider (#18937). La lecture remettait l'horloge à zéro
/// (`touch`), si bien qu'un profil revisité toutes les quatre minutes restait `.fresh` pour toujours :
/// une nouvelle bio, un renommage manqué pendant une coupure n'étaient jamais relus, et chaque lecteur
/// qui s'arrête au `.fresh` (l'appel, l'export d'une story) servait un profil figé.
@MainActor
final class LiveProfileLoadingTests: XCTestCase {

    private func makeUser(id: String) -> MeeshyUser {
        MeeshyUser(id: id, username: "carla", displayName: "Carla")
    }

    private func seedProfile(id: String, age: TimeInterval) async throws {
        let store = await CacheCoordinator.shared.profiles
        try await store.save([makeUser(id: id)], for: id)
        await store.debugRewindFetchTimestamp(by: age, for: id)
    }

    private func forget(_ id: String) async {
        let store = await CacheCoordinator.shared.profiles
        await store.invalidate(for: id)
    }

    func test_cachedProfile_readingAFreshProfile_keepsItsAge() async throws {
        let id = "u-carla-\(UUID().uuidString)"
        try await seedProfile(id: id, age: 240)

        let read = await LiveProfileLoading().cachedProfile(for: id)

        let store = await CacheCoordinator.shared.profiles
        let after = await store.load(for: id)
        await forget(id)
        guard case .fresh = read else { return XCTFail("un profil relu il y a quatre minutes est frais, reçu \(read)") }
        guard case .fresh(_, let age) = after else { return XCTFail("attendu .fresh, reçu \(after)") }
        XCTAssertGreaterThanOrEqual(age, 240, "une lecture ne remet pas l'horloge de fraîcheur à zéro")
    }

    func test_cachedProfile_beyondTheFreshWindow_staysStaleAcrossReads() async throws {
        let id = "u-carla-\(UUID().uuidString)"
        try await seedProfile(id: id, age: 360)

        let first = await LiveProfileLoading().cachedProfile(for: id)
        let second = await LiveProfileLoading().cachedProfile(for: id)

        await forget(id)
        guard case .stale(let users, _) = first else { return XCTFail("au-delà de cinq minutes, attendu .stale, reçu \(first)") }
        XCTAssertEqual(users.map(\.id), [id], "le profil se peint depuis le cache, sans squelette")
        guard case .stale = second else {
            return XCTFail("la première lecture ne doit pas rendre le profil frais à la seconde, reçu \(second)")
        }
    }
}

/// « Faire connaissance » (#19456) : le verdict « écrire part en demande » se lit du lien servi, et la demande part par
/// le chemin unique du partage, vers la PERSONNE (la directe se crée à l'envoi).
@MainActor
final class LiveProfileAcquaintanceTests: XCTestCase {

    private func makeSUT(link: Result<RelationLink, Error>,
                         outcome: ShareDeliveryOutcome = .sent(conversationId: "c-1")) -> (LiveProfileAcquaintance, AcquaintanceDispatcherSpy) {
        let relations = MockRelationsService()
        relations.linkResult = link
        let spy = AcquaintanceDispatcherSpy(outcome: outcome)
        return (LiveProfileAcquaintance(relations: relations, dispatcher: { spy }), spy)
    }

    func test_writesARequest_publicLink_isARequest() async {
        let (sut, _) = makeSUT(link: .success(RelationLink(userId: "u-rui", effectiveLevel: .public, grantedByMe: .public)))

        let verdict = await sut.writesARequest(to: "U-RUI")

        XCTAssertEqual(verdict, true)
    }

    func test_writesARequest_fromAcquaintance_isNotARequest() async {
        let (sut, _) = makeSUT(link: .success(RelationLink(userId: "u-rui", effectiveLevel: .acquaintance,
                                                            grantedByMe: .acquaintance)))

        let verdict = await sut.writesARequest(to: "u-rui")

        XCTAssertEqual(verdict, false)
    }

    func test_writesARequest_unreadOrSomeoneElse_isUnknown() async {
        let (failing, _) = makeSUT(link: .failure(NSError(domain: "test", code: 500)))
        let (other, _) = makeSUT(link: .success(RelationLink(userId: "u-leo", effectiveLevel: .public, grantedByMe: .public)))

        let unread = await failing.writesARequest(to: "u-rui")
        let mismatched = await other.writesARequest(to: "u-rui")

        XCTAssertNil(unread, "sans lien lu, la fiche ne pose rien")
        XCTAssertNil(mismatched, "le lien d'un autre ne juge pas cette fiche")
    }

    func test_sendMessageRequest_goesToThePersonAsText() async throws {
        let (sut, spy) = makeSUT(link: .failure(NSError(domain: "test", code: 404)))

        let delivered = await sut.sendMessageRequest(to: "u-rui", text: "Bonjour Rui")

        XCTAssertTrue(delivered)
        let sent = try XCTUnwrap(spy.delivered.first)
        XCTAssertEqual(sent.recipient.userId, "u-rui")
        XCTAssertNil(sent.recipient.conversationId, "la directe se crée à l'envoi, jamais avant")
        XCTAssertEqual(sent.request.subject.composedText(caption: sent.request.caption), "Bonjour Rui")
    }

    func test_sendMessageRequest_queuedCounts_refusedDoesNot() async {
        let (queued, _) = makeSUT(link: .failure(NSError(domain: "test", code: 404)), outcome: .queued(conversationId: "c-1"))
        let (refused, _) = makeSUT(link: .failure(NSError(domain: "test", code: 404)), outcome: .failed(reason: "chiffrée"))

        let inQueue = await queued.sendMessageRequest(to: "u-rui", text: "Bonjour")
        let notSent = await refused.sendMessageRequest(to: "u-rui", text: "Bonjour")

        XCTAssertTrue(inQueue, "mise en file hors ligne, la demande partira au retour du réseau")
        XCTAssertFalse(notSent, "un refus défait l'envoi optimiste")
    }
}

@MainActor
private final class AcquaintanceDispatcherSpy: ShareDispatching {
    nonisolated deinit {}

    let outcome: ShareDeliveryOutcome
    let createsGroups = false
    private(set) var delivered: [(recipient: ShareRecipient, request: ShareSendRequest)] = []

    init(outcome: ShareDeliveryOutcome) {
        self.outcome = outcome
    }

    func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        delivered.append((recipient, request))
        return outcome
    }

    func createGroup(with people: [ShareRecipient]) async -> ShareRecipient? { nil }

    func publish(attachment: MessageAttachment, to target: PublicationTarget) async -> Bool { false }

    func resolvedLink(for card: ShareCard) async -> URL? { nil }

    func republish(card: ShareCard, to target: PublicationTarget) async -> ShareRepublishOutcome { .published }
}
