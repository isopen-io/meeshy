import XCTest
@testable import MeeshySDK

/// T15b(b) — le logout doit purger le cache HTTP (`meeshy_http_cache`,
/// bodies ETag/304 des réponses REST : conversations, messages, profils).
/// Sans purge, les payloads du compte A restent sur disque après
/// déconnexion — fuite cross-compte (invariant : logout = purge totale,
/// même contrat que `CacheCoordinator.reset` + `clearAllMessagesForLogout`).
@MainActor
final class AuthManagerLogoutHTTPCachePurgeTests: XCTestCase {

    private func seedCachedResponse() throws -> (URLCache, URLRequest) {
        let cache = try XCTUnwrap(
            APIClient.shared.urlSession.configuration.urlCache,
            "APIClient session must carry its dedicated URLCache (iter-4)"
        )
        let url = try XCTUnwrap(URL(string: "https://gate.meeshy.me/api/v1/conversations?limit=10"))
        let request = URLRequest(url: url)
        let response = try XCTUnwrap(HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Cache-Control": "private, no-cache", "ETag": "\"account-a\""]
        ))
        // `.allowedInMemoryOnly` : le store disque de URLCache est bufferisé et
        // peut atterrir APRÈS un removeAll (ressuscitant l'entrée) — tester ça
        // testerait les internals Foundation, pas notre contrat. Le seed mémoire
        // est synchrone → verdict déterministe sur NOTRE câblage de purge.
        // (La course store-disque-en-vol est fermée côté prod par la double
        // purge début+fin de `logout()`.)
        let cached = CachedURLResponse(
            response: response,
            data: Data("account-A-conversations-payload".utf8),
            storagePolicy: .allowedInMemoryOnly
        )
        cache.storeCachedResponse(cached, for: request)
        XCTAssertNotNil(cache.cachedResponse(for: request), "precondition: response seeded in URLCache")
        return (cache, request)
    }

    /// `URLCache.removeAllCachedResponses()` est asynchrone en interne
    /// (queue CFURLCache) — le contrat testé est la purge PROMPTE, pas
    /// synchrone. Poll borné (2 s) pour un verdict déterministe.
    private func waitForRemoval(_ cache: URLCache, _ request: URLRequest) async -> Bool {
        for _ in 0..<40 {
            if cache.cachedResponse(for: request) == nil { return true }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return cache.cachedResponse(for: request) == nil
    }

    /// Prouve la purge au logout, y compris sur le chemin sans session active
    /// (early-return) : l'état déconnecté ne doit JAMAIS laisser de payloads
    /// d'un compte au repos sur disque, quel que soit le chemin emprunté.
    func test_logout_purgesHTTPCache() async throws {
        let (cache, request) = try seedCachedResponse()

        await AuthManager.shared.logout()

        let removed = await waitForRemoval(cache, request)
        XCTAssertTrue(
            removed,
            "logout must purge HTTP response bodies (cross-account data at rest)"
        )
    }

    /// Contrat direct du seam : `clearHTTPCache()` vide le cache de la session.
    func test_clearHTTPCache_removesStoredResponses() async throws {
        let (cache, request) = try seedCachedResponse()

        APIClient.shared.clearHTTPCache()

        let removed = await waitForRemoval(cache, request)
        XCTAssertTrue(removed, "clearHTTPCache must promptly evict stored responses")
    }
}
