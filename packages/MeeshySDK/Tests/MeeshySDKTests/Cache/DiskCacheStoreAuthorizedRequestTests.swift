import XCTest
@testable import MeeshySDK

/// Régression du bug « story au son emprunté muette » (2026-08-02, post prod
/// 6a6ef0b44415c63ff8da7855) : le funnel réseau de `DiskCacheStore` téléchargeait
/// TOUT média avec un `URLSession.shared.data(from:)` nu — sans en-tête d'auth.
/// Or l'audio de la bibliothèque de sons est servi par `/api/v1/static/:filename`,
/// une route JWT-protégée : chaque fetch retournait 401, le mixer du reader ne
/// schedulait rien (« BG audio cache failed » + « silent slide ») et la slide
/// restait gelée sur le spinner de stall jusqu'au watchdog.
///
/// Contrat de `DiskCacheStore.networkRequest(for:apiOrigin:authToken:sessionToken:)` :
/// - même origine (scheme+host+port) que l'API Meeshy → attache `Authorization:
///   Bearer` (prioritaire) ou `X-Session-Token` (session anonyme) ;
/// - toute autre origine (CDN, hôte tiers) → JAMAIS d'en-tête d'auth (un token
///   ne doit pas fuiter hors de l'API) ;
/// - aucun token → requête nue (médias publics, comportement historique).
final class DiskCacheStoreAuthorizedRequestTests: XCTestCase {

    private let apiOrigin = "https://gate.meeshy.me"
    private let staticAudioURL = URL(string: "https://gate.meeshy.me/api/v1/static/story_audio_d6f9e572.m4a")!

    func test_networkRequest_sameOriginWithAuthToken_attachesBearerHeader() {
        let request = DiskCacheStore.networkRequest(
            for: staticAudioURL, apiOrigin: apiOrigin,
            authToken: "jwt-123", sessionToken: nil
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-123")
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Session-Token"))
        XCTAssertEqual(request.url, staticAudioURL)
    }

    func test_networkRequest_sameOriginAnonymousSession_attachesSessionTokenHeader() {
        let request = DiskCacheStore.networkRequest(
            for: staticAudioURL, apiOrigin: apiOrigin,
            authToken: nil, sessionToken: "anon-456"
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Session-Token"), "anon-456")
    }

    func test_networkRequest_authTokenTakesPrecedenceOverSessionToken() {
        let request = DiskCacheStore.networkRequest(
            for: staticAudioURL, apiOrigin: apiOrigin,
            authToken: "jwt-123", sessionToken: "anon-456"
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-123")
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Session-Token"))
    }

    func test_networkRequest_crossOriginHost_neverLeaksTokens() {
        let cdnURL = URL(string: "https://cdn.example.com/api/v1/static/story_audio.m4a")!
        let request = DiskCacheStore.networkRequest(
            for: cdnURL, apiOrigin: apiOrigin,
            authToken: "jwt-123", sessionToken: "anon-456"
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Session-Token"))
    }

    func test_networkRequest_schemeMismatch_neverLeaksTokens() {
        let httpURL = URL(string: "http://gate.meeshy.me/api/v1/static/story_audio.m4a")!
        let request = DiskCacheStore.networkRequest(
            for: httpURL, apiOrigin: apiOrigin,
            authToken: "jwt-123", sessionToken: nil
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }

    func test_networkRequest_portMismatch_neverLeaksTokens() {
        let portURL = URL(string: "https://gate.meeshy.me:8443/api/v1/static/story_audio.m4a")!
        let request = DiskCacheStore.networkRequest(
            for: portURL, apiOrigin: apiOrigin,
            authToken: "jwt-123", sessionToken: nil
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }

    func test_networkRequest_explicitDefaultPort_matchesImplicitPort() {
        // `https://host:443` et `https://host` sont la même origine — un
        // serverOrigin configuré avec le port explicite ne doit pas priver
        // les fetchs média de leur auth.
        let request = DiskCacheStore.networkRequest(
            for: staticAudioURL, apiOrigin: "https://gate.meeshy.me:443",
            authToken: "jwt-123", sessionToken: nil
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-123")
    }

    func test_networkRequest_noTokens_isBareRequest() {
        let request = DiskCacheStore.networkRequest(
            for: staticAudioURL, apiOrigin: apiOrigin,
            authToken: nil, sessionToken: nil
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Session-Token"))
    }

    func test_networkRequest_invalidApiOrigin_neverLeaksTokens() {
        let request = DiskCacheStore.networkRequest(
            for: staticAudioURL, apiOrigin: "",
            authToken: "jwt-123", sessionToken: nil
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }
}
