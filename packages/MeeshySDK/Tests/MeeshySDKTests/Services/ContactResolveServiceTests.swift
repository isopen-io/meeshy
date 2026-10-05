import XCTest
@testable import MeeshySDK

/// Témoins de la résolution vCard → compte Meeshy (#8101) : décodage du
/// contrat, cache SWR, dégradation silencieuse quand la route manque.
final class ContactResolveServiceTests: XCTestCase {

    private final class Clock: @unchecked Sendable {
        var date = Date(timeIntervalSince1970: 1_000_000)
    }

    private let path = "/contacts/resolve"

    private func makeAccount(id: String = "u1", relation: ContactRelation = .none) -> PublicContactAccount {
        PublicContactAccount(userId: id, displayName: "Awa", username: "awa", avatarUrl: "https://x/a.jpg", bio: "Bio", relation: relation)
    }

    private func makeRequest() -> ContactResolveRequest {
        ContactResolveRequest(phones: ["+33 6 12 34 56 78"], emails: ["Awa@Example.com"])
    }

    private func makeSUT(clock: Clock = Clock()) -> (ContactResolveService, MockAPIClient) {
        let mock = MockAPIClient()
        let service = ContactResolveService(api: mock, freshness: 600, failureBackoff: 120, now: { clock.date })
        return (service, mock)
    }

    private func stubAccounts(_ mock: MockAPIClient, _ accounts: [PublicContactAccount]) {
        mock.stub(path, result: APIResponse(success: true, data: ContactResolveResponse(accounts: accounts), error: nil))
    }

    // MARK: - Contrat

    func test_decode_publicContactAccount_readsTheClosedContract() throws {
        let json = """
        {"success":true,"data":{"accounts":[{"userId":"u1","displayName":"Awa Diallo","username":"awa",
        "avatarUrl":null,"bannerUrl":"https://x/b.jpg","bio":null,"relation":"request-sent"}]}}
        """
        let decoded = try JSONDecoder().decode(APIResponse<ContactResolveResponse>.self, from: Data(json.utf8))
        let account = try XCTUnwrap(decoded.data.accounts.first)
        XCTAssertEqual(account.userId, "u1")
        XCTAssertNil(account.avatarUrl)
        XCTAssertEqual(account.bannerUrl, "https://x/b.jpg")
        XCTAssertEqual(account.relation, .requestSent)
    }

    func test_decode_unknownRelation_readsAsNone() throws {
        let json = #"{"userId":"u","displayName":"A","username":"a","relation":"blocked-by-future-server"}"#
        XCTAssertEqual(try JSONDecoder().decode(PublicContactAccount.self, from: Data(json.utf8)).relation, .none)
    }

    func test_decode_selfRelation_mapsToCurrent() throws {
        let json = #"{"userId":"u","displayName":"A","username":"a","relation":"self"}"#
        XCTAssertEqual(try JSONDecoder().decode(PublicContactAccount.self, from: Data(json.utf8)).relation, .current)
    }

    func test_request_fromCard_boundsDedupesAndLowercasesEmails() {
        let phones = (0..<14).map { VCardEntry(value: "+3360000000\($0)") } + [VCardEntry(value: "+33600000000")]
        let card = VCard(formattedName: "X", phones: phones, emails: [VCardEntry(value: "A@B.C"), VCardEntry(value: "a@b.c")])
        let request = ContactResolveRequest(card: card)
        XCTAssertEqual(request.phones.count, ContactResolveRequest.maxIdentifiers)
        XCTAssertEqual(request.emails, ["a@b.c"])
    }

    // MARK: - Résolution

    func test_resolve_success_postsIdentifiersAndReturnsAccounts() async throws {
        let (service, mock) = makeSUT()
        stubAccounts(mock, [makeAccount()])

        let accounts = await service.resolve(makeRequest())

        XCTAssertEqual(accounts, [makeAccount()])
        XCTAssertEqual(mock.lastRequest?.endpoint, path)
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["phones"] as? [String], ["+33 6 12 34 56 78"])
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["emails"] as? [String], ["awa@example.com"])
    }

    func test_resolve_serverWithoutRoute_returnsEmptyWithoutThrowing() async {
        let (service, mock) = makeSUT()
        mock.stubError(path, error: APIError.serverError(404, "Not Found"))

        let accounts = await service.resolve(makeRequest())

        XCTAssertEqual(accounts, [])
        XCTAssertNil(service.cachedAccounts(for: makeRequest()))
    }

    func test_resolve_afterFailure_doesNotHammerTheServerWithinBackoff() async {
        let (service, mock) = makeSUT()
        mock.stubError(path, error: APIError.serverError(404, nil))

        _ = await service.resolve(makeRequest())
        _ = await service.resolve(makeRequest())

        XCTAssertEqual(mock.requestCount, 1)
    }

    func test_resolve_emptyRequest_skipsTheNetwork() async {
        let (service, mock) = makeSUT()
        let accounts = await service.resolve(ContactResolveRequest(phones: [" "], emails: []))
        XCTAssertEqual(accounts, [])
        XCTAssertEqual(mock.requestCount, 0)
    }

    // MARK: - Cache SWR

    func test_cachedAccounts_afterResolve_servesWithoutNetwork() async {
        let (service, mock) = makeSUT()
        stubAccounts(mock, [makeAccount()])
        _ = await service.resolve(makeRequest())

        XCTAssertEqual(service.cachedAccounts(for: makeRequest()), [makeAccount()])
        XCTAssertEqual(mock.requestCount, 1)
    }

    func test_resolve_freshEntry_doesNotRefetch() async {
        let (service, mock) = makeSUT()
        stubAccounts(mock, [makeAccount()])
        _ = await service.resolve(makeRequest())
        _ = await service.resolve(makeRequest())
        XCTAssertEqual(mock.requestCount, 1)
    }

    func test_resolve_staleEntry_refetchesAndKeepsLastKnownOnFailure() async {
        let clock = Clock()
        let (service, mock) = makeSUT(clock: clock)
        stubAccounts(mock, [makeAccount()])
        _ = await service.resolve(makeRequest())

        clock.date += 601
        mock.stubError(path, error: APIError.serverError(500, nil))
        let accounts = await service.resolve(makeRequest())

        XCTAssertEqual(mock.requestCount, 2)
        XCTAssertEqual(accounts, [makeAccount()])
    }

    func test_updateRelation_rewritesEveryCachedEntryOfThatAccount() async {
        let (service, mock) = makeSUT()
        stubAccounts(mock, [makeAccount(relation: .none)])
        _ = await service.resolve(makeRequest())

        service.updateRelation(userId: "u1", to: .requestSent)

        XCTAssertEqual(service.cachedAccounts(for: makeRequest())?.first?.relation, .requestSent)
    }
}
