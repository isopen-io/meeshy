import XCTest
@testable import MeeshySDK

final class ContactResolveServiceConcurrencyTests: XCTestCase {

    private let path = "/contacts/resolve"

    private func makeAccount(id: String = "u1") -> PublicContactAccount {
        PublicContactAccount(userId: id, displayName: "Awa", username: "awa", avatarUrl: nil, bio: nil, relation: .none)
    }

    private func makeRequest() -> ContactResolveRequest {
        ContactResolveRequest(phones: ["+33 6 12 34 56 78"], emails: ["awa@example.com"])
    }

    private func makeSUT(accounts: [PublicContactAccount]) -> (ContactResolveService, MockAPIClient) {
        let mock = MockAPIClient()
        mock.stub(path, result: APIResponse(success: true, data: ContactResolveResponse(accounts: accounts), error: nil))
        return (ContactResolveService(api: mock, freshness: 600, failureBackoff: 120), mock)
    }

    func test_resolve_concurrentCallsForSameRequest_hitTheNetworkOnce() async {
        let accounts = [makeAccount()]
        let (service, mock) = makeSUT(accounts: accounts)
        let request = makeRequest()

        let results = await withTaskGroup(of: [PublicContactAccount].self, returning: [[PublicContactAccount]].self) { group in
            for _ in 0..<50 { group.addTask { await service.resolve(request) } }
            return await group.reduce(into: []) { $0.append($1) }
        }

        let calls = mock.requestCount
        XCTAssertEqual(calls, 1)
        XCTAssertTrue(results.allSatisfy { $0 == accounts })
    }

    func test_purge_whileResolvesInFlight_leavesNoCachedAccounts() async {
        let (service, _) = makeSUT(accounts: [makeAccount()])
        let request = makeRequest()

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<100 {
                group.addTask {
                    if index % 5 == 0 { service.purge() } else { _ = await service.resolve(request) }
                }
            }
        }
        service.purge()

        let cached = service.cachedAccounts(for: request)
        XCTAssertNil(cached)
    }

    func test_updateRelation_afterResolve_rewritesTheCachedAccount() async {
        let (service, _) = makeSUT(accounts: [makeAccount()])
        let request = makeRequest()
        _ = await service.resolve(request)

        service.updateRelation(userId: "u1", to: .requestSent)

        let relation = service.cachedAccounts(for: request)?.first?.relation
        XCTAssertEqual(relation, .requestSent)
    }
}
