import XCTest
@testable import MeeshySDK

/// Les décisions du pipeline de `APIClient`, lues sans réseau : une fonction pure
/// par question (« que construit-on ? », « rejoue-t-on ? », « que lève-t-on ? »).
final class APIRequestPipelineTests: XCTestCase {

    private func serverParts(_ error: Error?) -> (status: Int, message: String)? {
        guard let error, case MeeshyError.server(let status, let message) = error else { return nil }
        return (status, message)
    }

    private func thrown(_ verdict: APIFailureVerdict) -> MeeshyError? {
        guard case .thrown(let error) = verdict else { return nil }
        return error
    }

    private func classify(
        status: Int,
        body: String = "{}",
        authKind: MeeshyEndpointAuthKind = .bearer,
        rejection: MeeshyEndpointRejectionPolicy = .opaque
    ) -> APIFailureVerdict {
        let data = Data(body.utf8)
        let url = URL(string: "https://x.test/api/v1/conversations")!
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return APIFailureVerdict.classify(
            statusCode: status, data: data, authKind: authKind, rejectionPolicy: rejection,
            dailyLimit: status == 429 ? DailyGestureLimit.fromBody(data) : nil,
            slowMode: NewcomerSlowMode.fromResponse(response, body: data),
            decoder: APIClient.makeAPIPayloadDecoder()
        )
    }

    // MARK: - APIRequestBuilder.url

    func test_url_appendsQueryItems_andLeavesURLUntouchedWhenEmpty() throws {
        let base = "https://x.test/api/v1/conversations"
        let withQuery = try APIRequestBuilder.url(urlString: base, queryItems: [URLQueryItem(name: "limit", value: "20")])
        XCTAssertEqual(withQuery.absoluteString, "\(base)?limit=20")
        XCTAssertEqual(try APIRequestBuilder.url(urlString: base, queryItems: []).absoluteString, base)
        XCTAssertEqual(try APIRequestBuilder.url(urlString: base, queryItems: nil).absoluteString, base)
    }

    func test_url_withEmptyPathSegment_throwsInvalidURL() {
        XCTAssertThrowsError(
            try APIRequestBuilder.url(urlString: "https://x/api/v1/conversations//messages", queryItems: nil)
        ) { error in
            XCTAssertEqual(self.serverParts(error)?.status, 0)
            XCTAssertEqual(self.serverParts(error)?.message, "URL invalide")
        }
    }

    // MARK: - APIRequestBuilder.request

    private let sampleURL = URL(string: "https://x.test/api/v1/conversations")!

    func test_request_callerHeadersOverrideContentTypeAndAuthorization() {
        let request = APIRequestBuilder.request(
            url: sampleURL, method: "POST", clientHeaders: [:], credential: .bearer("T"),
            body: Data("b".utf8), headers: ["Content-Type": "text/plain", "Authorization": "Bearer X"]
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "text/plain")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer X")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.httpBody, Data("b".utf8))
    }

    func test_request_credentialOverridesClientInfoHeader_andAnonymousUsesXSessionToken() {
        let bearer = APIRequestBuilder.request(
            url: sampleURL, method: "GET", clientHeaders: ["Authorization": "z", "X-Meeshy-Version": "9"],
            credential: .bearer("t"), body: nil, headers: nil
        )
        XCTAssertEqual(bearer.value(forHTTPHeaderField: "Authorization"), "Bearer t")
        XCTAssertEqual(bearer.value(forHTTPHeaderField: "X-Meeshy-Version"), "9")

        let anonymous = APIRequestBuilder.request(
            url: sampleURL, method: "GET", clientHeaders: [:], credential: .anonymousSession("a"),
            body: nil, headers: nil
        )
        XCTAssertEqual(anonymous.value(forHTTPHeaderField: "X-Session-Token"), "a")
        XCTAssertNil(anonymous.value(forHTTPHeaderField: "Authorization"))
    }

    func test_request_withoutBody_setsNoContentType_andNoHTTPBody() {
        let request = APIRequestBuilder.request(
            url: sampleURL, method: "GET", clientHeaders: [:], credential: nil, body: nil, headers: nil
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Content-Type"))
        XCTAssertNil(request.httpBody)
    }

    // MARK: - APIRetryPolicy

    func test_shouldRetry() {
        func decide(_ status: Int, _ attempt: Int, _ policy: MeeshyEndpointRetryPolicy = .standard,
                    daily: Bool = false, slow: Bool = false) -> Bool {
            APIRetryPolicy.shouldRetry(
                statusCode: status, attempt: attempt, retryPolicy: policy, hasDailyLimit: daily, hasSlowMode: slow
            )
        }
        XCTAssertTrue(decide(503, 0))
        XCTAssertTrue(decide(429, 2))
        XCTAssertFalse(decide(503, 3))
        XCTAssertFalse(decide(503, 0, .never))
        XCTAssertFalse(decide(429, 0, daily: true))
        XCTAssertFalse(decide(429, 0, slow: true))
        XCTAssertFalse(decide(500, 0))
    }

    func test_delay() {
        XCTAssertEqual(APIRetryPolicy.delay(statusCode: 503, attempt: 1, retryAfter: "60"), 30)
        XCTAssertEqual(APIRetryPolicy.delay(statusCode: 503, attempt: 1, retryAfter: "2"), 2)
        XCTAssertEqual(APIRetryPolicy.delay(statusCode: 503, attempt: 2, retryAfter: "abc"), 4)
        XCTAssertEqual(APIRetryPolicy.delay(statusCode: 503, attempt: 1, retryAfter: nil), 2)
        XCTAssertNil(APIRetryPolicy.delay(statusCode: 503, attempt: 3, retryAfter: nil))
        XCTAssertNil(APIRetryPolicy.delay(statusCode: 404, attempt: 1, retryAfter: nil))
    }

    // MARK: - APIFailureVerdict

    func test_classify_426_withoutMessage() {
        let error = thrown(classify(status: 426))
        XCTAssertEqual(serverParts(error)?.status, 426)
        XCTAssertEqual(serverParts(error)?.message, "Mise a jour requise")
    }

    func test_classify_structuredRejection_carriesCodeAndField() {
        let verdict = classify(
            status: 422, body: #"{"error":"Pseudo pris","code":"USERNAME_TAKEN","field":"username"}"#,
            rejection: .structured
        )
        guard case MeeshyError.rejected(let rejection)? = thrown(verdict) else {
            return XCTFail("attendu .rejected, reçu \(verdict)")
        }
        XCTAssertEqual(rejection.statusCode, 422)
        XCTAssertEqual(rejection.code, "USERNAME_TAKEN")
        XCTAssertEqual(rejection.field, "username")
    }

    func test_classify_opaquePolicy_keepsA422AsAServerError() {
        let error = thrown(classify(status: 422, body: #"{"error":"Pseudo pris","code":"USERNAME_TAKEN"}"#))
        XCTAssertEqual(serverParts(error)?.status, 422)
        XCTAssertEqual(serverParts(error)?.message, "Pseudo pris")
    }

    /// #11379 — le refus du clair dans une conversation chiffrée (#11216) garde
    /// son code sur une adresse opaque : c'est lui qui interdit au client de
    /// rejouer le même clair par le socket puis par l'outbox.
    func test_classify_e2eePlaintextRefusal_keepsItsCodeOnAnOpaqueEndpoint() {
        let body = #"{"success":false,"error":"Conversation chiffrée","code":"E2EE_PLAINTEXT_REFUSED"}"#
        guard case MeeshyError.rejected(let rejection)? = thrown(classify(status: 400, body: body)) else {
            return XCTFail("attendu .rejected portant le code")
        }
        XCTAssertEqual(rejection.statusCode, 400)
        XCTAssertEqual(rejection.code, EndToEndSendGate.serverPlaintextRefusalCode)
        XCTAssertEqual(rejection.message, "Conversation chiffrée")
    }

    func test_classify_e2eeDevicesMismatch_carriesTheSesameGapOnAnOpaqueEndpoint() {
        let body = #"{"success":false,"error":"Liste d'appareils","code":"E2EE_DEVICES_MISMATCH","missing":[{"userId":"b","deviceId":2}],"extra":[],"stale":[{"userId":"b","deviceId":1}]}"#
        guard case MeeshyError.rejected(let rejection)? = thrown(classify(status: 409, body: body)) else {
            return XCTFail("un 409 Sesame garde son écart sur toute adresse")
        }
        XCTAssertEqual(rejection.code, "E2EE_DEVICES_MISMATCH")
        XCTAssertEqual(rejection.e2eeMismatch, E2EEDevicesMismatch(
            missing: [E2EEDeviceRef(userId: "b", deviceId: 2)], extra: [], stale: [E2EEDeviceRef(userId: "b", deviceId: 1)]
        ))
    }

    func test_classify_e2eeDeviceNotBound_isATypedRefusal_notASessionFailure() {
        let body = #"{"success":false,"error":"Appareil non lié","code":"E2EE_DEVICE_NOT_BOUND"}"#
        let error = thrown(classify(status: 403, body: body))
        XCTAssertEqual(error?.e2eeCode, "E2EE_DEVICE_NOT_BOUND")
    }

    func test_classify_aForbiddenWithAnE2EECode_onAStructuredEndpoint_stillSurfacesTheCode() {
        let body = #"{"success":false,"error":"Clés interdites","code":"E2EE_KEYS_FORBIDDEN"}"#
        XCTAssertEqual(thrown(classify(status: 403, body: body, rejection: .structured))?.e2eeCode, "E2EE_KEYS_FORBIDDEN")
    }

    func test_classify_opaquePolicy_anyOther400Code_staysAServerError() {
        let error = thrown(classify(status: 400, body: #"{"error":"Validation error","code":"VALIDATION_ERROR"}"#))
        XCTAssertEqual(serverParts(error)?.status, 400)
    }

    func test_classify_403_forwardsTheBody() {
        let body = #"{"error":"Refusé","code":"CONSENT_REQUIRED"}"#
        guard case MeeshyError.forbidden(let reason, let forwarded)? = thrown(classify(status: 403, body: body, rejection: .structured)) else {
            return XCTFail("attendu .forbidden")
        }
        XCTAssertEqual(reason, "Refusé")
        XCTAssertEqual(forwarded, Data(body.utf8))
    }

    func test_classify_401_onCredentialsEndpoint_surfacesTheServerMessage() {
        let verdict = classify(status: 401, body: #"{"error":"Mot de passe incorrect"}"#, authKind: .credentials)
        guard case MeeshyError.auth(let authError)? = thrown(verdict),
              case .invalidCredentialsWithMessage(let message) = authError else {
            return XCTFail("attendu .invalidCredentialsWithMessage, reçu \(verdict)")
        }
        XCTAssertEqual(message, "Mot de passe incorrect")
    }

    func test_classify_401_onBearerEndpoint_isUnauthorized() {
        guard case .unauthorized = classify(status: 401, authKind: .bearer) else {
            return XCTFail("un 401 sur une route à jeton se décide ailleurs")
        }
        guard case .unauthorized = classify(status: 401, authKind: .none) else {
            return XCTFail("un 401 sur une route sans identité se décide ailleurs")
        }
    }

    func test_classify_429_dailyLimit_isRejectedWithCodeResetAndLimit() {
        let body = #"{"code":"DAILY_REACTION_LIMIT","resetAt":"2026-10-20T10:00:00.000Z","limit":100}"#
        guard case MeeshyError.rejected(let rejection)? = thrown(classify(status: 429, body: body)) else {
            return XCTFail("attendu .rejected")
        }
        XCTAssertEqual(rejection.statusCode, 429)
        XCTAssertEqual(rejection.code, "DAILY_REACTION_LIMIT")
        XCTAssertEqual(rejection.limit, 100)
        XCTAssertNotNil(rejection.resetAt)
    }

    func test_classify_bare429_isTooManyRequests() {
        let error = thrown(classify(status: 429))
        XCTAssertEqual(serverParts(error)?.status, 429)
        XCTAssertEqual(serverParts(error)?.message, "Trop de requetes")
    }

    func test_classify_5xx_andDefault() {
        XCTAssertEqual(serverParts(thrown(classify(status: 503)))?.message, "Erreur serveur")
        XCTAssertEqual(serverParts(thrown(classify(status: 404, body: #"{"error":"x"}"#)))?.message, "x")
        XCTAssertEqual(serverParts(thrown(classify(status: 404)))?.message, "Erreur inconnue")
        XCTAssertEqual(serverParts(thrown(classify(status: 404, body: #"{"message":"m","error":"e"}"#)))?.message, "m")
    }

    // MARK: - UnauthorizedStep

    func test_unauthorizedStep() {
        XCTAssertEqual(UnauthorizedStep.decide(presentsBearer: false, authKind: .bearer), .sessionExpired)
        XCTAssertEqual(UnauthorizedStep.decide(presentsBearer: true, authKind: .none), .expireSession)
        XCTAssertEqual(UnauthorizedStep.decide(presentsBearer: true, authKind: .credentials), .expireSession)
        XCTAssertEqual(UnauthorizedStep.decide(presentsBearer: true, authKind: .bearer), .refreshAndReplay)
    }

    // MARK: - APIRefreshedVerdict

    func test_refreshedVerdict() {
        let decoder = APIClient.makeAPIPayloadDecoder()
        guard case .success = APIRefreshedVerdict.classify(statusCode: 204, data: Data(), decoder: decoder) else {
            return XCTFail("un 2xx est un succès")
        }
        guard case .sessionExpired = APIRefreshedVerdict.classify(statusCode: 401, data: Data(), decoder: decoder) else {
            return XCTFail("un second 401 est une session expirée")
        }
        let withMessage = APIRefreshedVerdict.classify(
            statusCode: 500, data: Data(#"{"error":"boom"}"#.utf8), decoder: decoder
        )
        guard case .thrown(let first) = withMessage else { return XCTFail("attendu .thrown") }
        XCTAssertEqual(serverParts(first)?.status, 500)
        XCTAssertEqual(serverParts(first)?.message, "boom")
        let bare = APIRefreshedVerdict.classify(statusCode: 500, data: Data(), decoder: decoder)
        guard case .thrown(let second) = bare else { return XCTFail("attendu .thrown") }
        XCTAssertEqual(serverParts(second)?.message, "Erreur après rafraichissement")
    }

    // MARK: - APIFailureMapping

    func test_normalize_urlErrors() {
        func network(_ code: URLError.Code) -> NetworkError? {
            guard case MeeshyError.network(let value)? = APIFailureMapping.normalize(URLError(code)) as? MeeshyError else { return nil }
            return value
        }
        guard case .timeout? = network(.timedOut) else { return XCTFail("timedOut") }
        guard case .serverUnreachable? = network(.cannotFindHost) else { return XCTFail("cannotFindHost") }
        guard case .serverUnreachable? = network(.dnsLookupFailed) else { return XCTFail("dnsLookupFailed") }
        guard case .noConnection? = network(.notConnectedToInternet) else { return XCTFail("notConnected") }
        guard case .noConnection? = network(.badURL) else { return XCTFail("badURL") }
    }

    func test_normalize_passesThroughCancellationAndMeeshyErrors() {
        XCTAssertTrue(APIFailureMapping.normalize(CancellationError()) is CancellationError)
        let kept = APIFailureMapping.normalize(MeeshyError.server(statusCode: 418, message: "tea"))
        XCTAssertEqual(serverParts(kept)?.message, "tea")
    }

    func test_normalize_unknownErrorBecomesUnknown() {
        let wrapped = APIFailureMapping.normalize(NSError(domain: "x", code: 1))
        guard case MeeshyError.unknown? = wrapped as? MeeshyError else { return XCTFail("attendu .unknown") }
    }

    func test_normalize_decodingError_describesThePath() {
        let context = DecodingError.Context(codingPath: [], debugDescription: "d")
        let mapped = APIFailureMapping.normalize(DecodingError.keyNotFound(AnyCodingKey("id"), context))
        XCTAssertEqual(serverParts(mapped)?.status, 0)
        XCTAssertTrue(serverParts(mapped)?.message.hasPrefix("Erreur de decodage: Key 'id' not found at path") == true)
    }
}

private struct AnyCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init(_ value: String) { stringValue = value }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}
