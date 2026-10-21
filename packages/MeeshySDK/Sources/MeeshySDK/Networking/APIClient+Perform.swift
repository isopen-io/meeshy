import Foundation
import os

// La requête NUE d'`APIClient`, décomposée (LOT-15) en quatre étapes :
// construire (`prepareRequest`), échanger (`perform`), réparer un refus
// (`handleFailure` / `refreshAndRetry`), décoder (`decodeSuccess`). Les
// décisions vivent dans `APIRequestPipeline.swift`, sans réseau ; ce fichier
// enchaîne et émet les signaux, AVANT toute levée.

extension APIClient {

    struct PreparedRequest {
        let urlRequest: URLRequest
        let bearer: PresentedBearer?
    }

    struct Exchange {
        let data: Data
        let response: HTTPURLResponse
        let networkMs: Double

        var statusCode: Int { response.statusCode }
    }

    /// La requête NUE — `requestWithHeaders(resolved:…)` l'enveloppe de la garde
    /// de l'e-mail (#8365, `EmailVerificationGate.swift`).
    ///
    /// La préparation reste HORS du `catch` de normalisation : un rafraîchissement
    /// préventif qui échoue sur autre chose qu'une `MeeshyError` remonte brut.
    func performRequestWithHeaders<T: Decodable>(
        resolved: ResolvedEndpoint,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?,
        headers: [String: String]?
    ) async throws -> T {
        let url = try APIRequestBuilder.url(urlString: resolved.urlString, queryItems: queryItems)
        let prepared = try await prepareRequest(url: url, resolved: resolved, method: method, body: body, headers: headers)
        do {
            return try await sendWithRetries(prepared, resolved: resolved, method: method)
        } catch {
            logDecodingFailure(error, method: method, label: resolved.logLabel)
            throw APIFailureMapping.normalize(error)
        }
    }

    // MARK: - Construire

    /// #10904 — l'identité est CAPTURÉE ici, avec la génération de son jeton :
    /// le rafraîchissement et le rejeu d'un 401 se décident sur elle, jamais sur
    /// le compte actif au moment du retour. `buildHeaders()` PRÉCÈDE donc
    /// `presentedCredential()`.
    private func prepareRequest(
        url: URL, resolved: ResolvedEndpoint, method: String, body: Data?, headers: [String: String]?
    ) async throws -> PreparedRequest {
        let clientHeaders = await ClientInfoProvider.shared.buildHeaders()
        let presented = presentedCredential()
        let refreshed = try await proactivelyRefreshed(presented.bearer, authKind: resolved.authKind)
        let credential = refreshed.map { MeeshyRequestCredential.bearer($0.token) } ?? presented.credential
        let urlRequest = APIRequestBuilder.request(
            url: url, method: method, clientHeaders: clientHeaders,
            credential: credential, body: body, headers: headers
        )
        return PreparedRequest(urlRequest: urlRequest, bearer: refreshed ?? presented.bearer)
    }

    private func proactivelyRefreshed(
        _ bearer: PresentedBearer?, authKind: MeeshyEndpointAuthKind
    ) async throws -> PresentedBearer? {
        guard let bearer, authKind == .bearer, AuthManager.isTokenExpired(bearer.token, now: Date()) else { return nil }
        do {
            let freshToken = try await AuthManager.shared.refreshSession(
                presentedToken: bearer.token,
                stillInstalled: isBearerStillInstalled(bearer),
                force: false
            )
            return presentedBearerAfterRefresh(freshToken)
        } catch let abandoned as CancellationError {
            throw abandoned
        } catch let refused as MeeshyError {
            guard case .auth = refused else { throw refused }
            throw MeeshyError.auth(.sessionExpired)
        }
    }

    // MARK: - Échanger

    private func sendWithRetries<T: Decodable>(
        _ prepared: PreparedRequest, resolved: ResolvedEndpoint, method: String
    ) async throws -> T {
        var lastResponse: HTTPURLResponse?
        for attempt in 0..<(APIRetryPolicy.maxAttempts + 1) {
            if attempt > 0 {
                guard let previous = lastResponse,
                      let delay = APIRetryPolicy.delay(
                        statusCode: previous.statusCode, attempt: attempt,
                        retryAfter: previous.value(forHTTPHeaderField: "Retry-After")
                      ) else { break }
                logger.warning("Retryable status \(previous.statusCode) on \(method) \(resolved.logLabel), retry \(attempt)/\(APIRetryPolicy.maxAttempts) after \(String(format: "%.1f", delay))s")
                try await Task.sleep(for: .seconds(delay))
                guard !Task.isCancelled else { throw CancellationError() }
            }

            let exchange = try await perform(prepared.urlRequest)
            lastResponse = exchange.response
            let dailyLimit = exchange.statusCode == 429 ? DailyGestureLimit.fromBody(exchange.data) : nil
            let slowMode = NewcomerSlowMode.fromResponse(exchange.response, body: exchange.data)
            if APIRetryPolicy.shouldRetry(
                statusCode: exchange.statusCode, attempt: attempt, retryPolicy: resolved.retryPolicy,
                hasDailyLimit: dailyLimit != nil, hasSlowMode: slowMode != nil
            ) { continue }

            guard (200...299).contains(exchange.statusCode) else {
                return try await handleFailure(
                    exchange, prepared: prepared, resolved: resolved, dailyLimit: dailyLimit, slowMode: slowMode
                )
            }
            return try await decodeSuccess(exchange, request: prepared.urlRequest, method: method, label: resolved.logLabel)
        }
        let lastStatusCode = lastResponse?.statusCode ?? 0
        throw MeeshyError.server(
            statusCode: lastStatusCode,
            message: "Requete echouee apres \(APIRetryPolicy.maxAttempts) tentatives (status \(lastStatusCode))"
        )
    }

    private func perform(_ urlRequest: URLRequest) async throws -> Exchange {
        let networkStart = CFAbsoluteTimeGetCurrent()
        let (data, response) = try await urlSession.data(for: urlRequest)
        let networkMs = (CFAbsoluteTimeGetCurrent() - networkStart) * 1000
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MeeshyError.server(statusCode: 0, message: "Aucune donnee recue")
        }
        return Exchange(data: data, response: httpResponse, networkMs: networkMs)
    }

    // MARK: - Réparer un refus

    private func handleFailure<T: Decodable>(
        _ exchange: Exchange,
        prepared: PreparedRequest,
        resolved: ResolvedEndpoint,
        dailyLimit: DailyGestureLimit?,
        slowMode: NewcomerSlowMode?
    ) async throws -> T {
        emitRefusalSignals(urlRequest: prepared.urlRequest, statusCode: exchange.statusCode, data: exchange.data)
        let verdict = APIFailureVerdict.classify(
            statusCode: exchange.statusCode, data: exchange.data, authKind: resolved.authKind,
            rejectionPolicy: resolved.rejectionPolicy, dailyLimit: dailyLimit, slowMode: slowMode, decoder: decoder
        )
        switch verdict {
        case .thrown(let error):
            throw error
        case .unauthorized:
            return try await resolveUnauthorized(prepared, authKind: resolved.authKind)
        }
    }

    /// Les signaux partent AVANT que l'erreur ne soit jetée : l'appelant a le
    /// droit d'avaler son erreur (la plupart le font), et la porte doit se
    /// montrer quand même.
    private func emitRefusalSignals(urlRequest: URLRequest, statusCode: Int, data: Data) {
        // #10442 — un invité de lien échu ou révoqué : la session se termine, elle ne se retente pas.
        if let guestToken = urlRequest.value(forHTTPHeaderField: "X-Session-Token") { GuestSessionEnd.signal(statusCode: statusCode, body: data, refusedSessionToken: guestToken) }
        // #10482 — « ce compte est supprimé », seulement s'il est le propriétaire du jeton présenté.
        AccountDeletedSignal.signal(statusCode: statusCode, body: data, presentedOwner: AccountDeletedSignal.presentedOwner(authorization: urlRequest.value(forHTTPHeaderField: "Authorization"), body: urlRequest.httpBody))
        if statusCode == 426 {
            UpgradeGateSignal.signal(statusCode: statusCode, body: data)
        }
        if statusCode == 403 {
            AgeGateSignal.signal(statusCode: statusCode, body: data)
        }
    }

    private func resolveUnauthorized<T: Decodable>(
        _ prepared: PreparedRequest, authKind: MeeshyEndpointAuthKind
    ) async throws -> T {
        let step = UnauthorizedStep.decide(presentsBearer: prepared.bearer != nil, authKind: authKind)
        switch (step, prepared.bearer) {
        case (.refreshAndReplay, let bearer?):
            return try await refreshAndRetry(bearer: bearer, urlRequest: prepared.urlRequest)
        case (.expireSession, let bearer?):
            await AuthManager.shared.handleUnauthorized(presentedToken: bearer.token)
            throw MeeshyError.auth(.sessionExpired)
        default:
            throw MeeshyError.auth(.sessionExpired)
        }
    }

    /// #10904 — rafraîchie et rejouée au nom du jeton PRÉSENTÉ : un 401 tardif
    /// d'un compte quitté est abandonné, celui d'un jeton déjà renouvelé se
    /// rejoue sans rien rafraîchir. Une seule fois : un second 401 termine la session.
    private func refreshAndRetry<T: Decodable>(bearer: PresentedBearer, urlRequest: URLRequest) async throws -> T {
        do {
            let freshToken = try await AuthManager.shared.refreshSession(
                presentedToken: bearer.token,
                stillInstalled: isBearerStillInstalled(bearer),
                force: true
            )
            var replay = urlRequest
            replay.setValue("Bearer \(freshToken)", forHTTPHeaderField: "Authorization")
            let (retryData, retryResponse) = try await urlSession.data(for: replay)
            guard let retryHTTPResponse = retryResponse as? HTTPURLResponse else {
                throw MeeshyError.server(statusCode: 0, message: "Aucune donnee recue")
            }
            switch APIRefreshedVerdict.classify(statusCode: retryHTTPResponse.statusCode, data: retryData, decoder: decoder) {
            case .success:
                return try await Self.decodeOffMain(T.self, from: retryData)
            case .sessionExpired:
                await AuthManager.shared.handleUnauthorized(presentedToken: freshToken)
                throw MeeshyError.auth(.sessionExpired)
            case .thrown(let error):
                UpgradeGateSignal.signal(statusCode: retryHTTPResponse.statusCode, body: retryData)
                throw error
            }
        } catch let abandoned as CancellationError {
            throw abandoned
        } catch let refused as MeeshyError {
            guard case .auth = refused else { throw refused }
            await AuthManager.shared.handleUnauthorized(presentedToken: bearer.token)
            throw MeeshyError.auth(.sessionExpired)
        }
    }

    // MARK: - Décoder

    private func decodeSuccess<T: Decodable>(
        _ exchange: Exchange, request: URLRequest, method: String, label: String
    ) async throws -> T {
        let decodeStart = CFAbsoluteTimeGetCurrent()
        let result = try await Self.decodeOffMain(T.self, from: exchange.data)
        let decodeMs = (CFAbsoluteTimeGetCurrent() - decodeStart) * 1000
        let totalMs = exchange.networkMs + decodeMs
        if totalMs > 1000 {
            let qs = request.url?.query.map { "?\($0)" } ?? ""
            logger.warning("Slow request: \(method) \(label)\(qs) → \(exchange.statusCode) network=\(Int(exchange.networkMs))ms decode=\(Int(decodeMs))ms total=\(Int(totalMs))ms size=\(exchange.data.count)B")
        }
        return result
    }

    private func logDecodingFailure(_ error: Error, method: String, label: String) {
        guard let decoding = error as? DecodingError else { return }
        let debugInfo = APIFailureMapping.describe(decoding)
        logger.error("DecodingError on \(method, privacy: .public) \(label, privacy: .public): \(debugInfo)")
    }
}
