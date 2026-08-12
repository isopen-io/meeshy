import XCTest
@testable import MeeshySDK

/// net-09 — `authToken`/`anonymousSessionToken` étaient des vars nues sur une
/// classe `@unchecked Sendable` : data race entre le refresh (thread réseau)
/// et les lectures de header, et fenêtre de paire mixte (auth du compte A +
/// session anonyme B) au switch. Le couple verrou + `setTokens`/
/// `currentTokens` garantit des paires jamais déchirées.
final class APIClientTokenAtomicityTests: XCTestCase {

    override func setUp() {
        super.setUp()
        APIClient.shared.setTokens(auth: nil, anonymous: nil)
    }

    override func tearDown() {
        // Singleton process-lifetime : ne pas laisser fuiter un token de test
        // vers les autres suites Networking du même run.
        APIClient.shared.setTokens(auth: nil, anonymous: nil)
        super.tearDown()
    }

    func test_setTokens_thenCurrentTokens_returnsBothAtomically() {
        APIClient.shared.setTokens(auth: "tok-A", anonymous: "anon-A")

        let pair = APIClient.shared.currentTokens()

        XCTAssertEqual(pair.auth, "tok-A")
        XCTAssertEqual(pair.anon, "anon-A")
    }

    func test_tokenReadWrite_concurrent_noTornValues() async {
        let pairA = (auth: "tok-A", anon: "anon-A")
        let pairB = (auth: "tok-B", anon: "anon-B")

        let torn = await withTaskGroup(of: Int.self) { group -> Int in
            group.addTask { @Sendable in
                for i in 0..<2_000 {
                    let p = i.isMultiple(of: 2) ? pairA : pairB
                    APIClient.shared.setTokens(auth: p.auth, anonymous: p.anon)
                }
                return 0
            }
            for _ in 0..<4 {
                group.addTask { @Sendable in
                    var tornCount = 0
                    for _ in 0..<2_000 {
                        let pair = APIClient.shared.currentTokens()
                        let valid = (pair.auth == nil && pair.anon == nil)
                            || (pair.auth == "tok-A" && pair.anon == "anon-A")
                            || (pair.auth == "tok-B" && pair.anon == "anon-B")
                        if !valid { tornCount += 1 }
                    }
                    return tornCount
                }
            }
            var total = 0
            for await c in group { total += c }
            return total
        }

        XCTAssertEqual(torn, 0, "aucun lecteur ne doit observer une paire mixte (auth d'une écriture, anon d'une autre)")
    }
}
