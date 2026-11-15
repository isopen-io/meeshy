import XCTest
@testable import MeeshySDK

/// #10518 — la fenêtre d'adoption d'une preuve par lien n'est plus recopiée
/// comme une vérité : la passerelle SERT son délai (`adoptWithinSeconds`),
/// l'appareil le suit moins sa marge, jusqu'à une borne dure, et ne retombe
/// sur son repli que si rien de lisible n'est servi. Dans le doute, la fenêtre
/// est la plus courte, ou fermée.
final class ProvenAdoptionWindowTests: XCTestCase {

    // MARK: - La règle

    func test_clientWindow_servedDelay_isTheDelayMinusTheMargin() {
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: 600), 540)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: 120), 60)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .secondFactor, adoptWithinSeconds: 300), 240)
    }

    func test_clientWindow_absentDelay_isTheFallbackOfItsKind() {
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: nil), 540)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .secondFactor, adoptWithinSeconds: nil), 240)
    }

    func test_clientWindow_negativeDelay_isTheFallback_neverLonger() {
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: -1), 540)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .secondFactor, adoptWithinSeconds: Int.min), 240)
    }

    func test_clientWindow_zeroOrWithinTheMargin_isClosed() {
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: 0), 0)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: 59), 0)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .secondFactor, adoptWithinSeconds: 60), 0)
    }

    func test_clientWindow_delayBeyondTheHardBound_isCapped() {
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: 1_860), 1_800)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: 86_400), 1_800)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .secondFactor, adoptWithinSeconds: 9_007_199_254_740_991), 1_800)
    }

    /// Au-delà de 2^53 − 1, le contrat partagé (`Number.isSafeInteger`) lit un
    /// délai absent : le repli, jamais le plafond.
    func test_clientWindow_delayBeyondTheSafeIntegers_isTheFallback() {
        XCTAssertEqual(ProvenAdoptionWindow.maxReadableSeconds, (1 << 53) - 1)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: 9_007_199_254_740_992), 540)
        XCTAssertEqual(ProvenAdoptionWindow.clientWindow(for: .secondFactor, adoptWithinSeconds: Int.max), 240)
    }

    func test_bounded_anythingOutOfRange_fallsBackInside() {
        XCTAssertEqual(ProvenAdoptionWindow.bounded(-5), 0)
        XCTAssertEqual(ProvenAdoptionWindow.bounded(.nan), 0)
        XCTAssertEqual(ProvenAdoptionWindow.bounded(.infinity), 1_800)
        XCTAssertEqual(ProvenAdoptionWindow.bounded(300), 300)
    }

    func test_hasLapsed_insideTheWindow_isFalse_pastIt_isTrue() {
        let receivedAt = Date(timeIntervalSince1970: 1_000)

        XCTAssertFalse(ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: 540, now: receivedAt))
        XCTAssertFalse(ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: 540, now: receivedAt.addingTimeInterval(540)))
        XCTAssertTrue(ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: 540, now: receivedAt.addingTimeInterval(541)))
    }

    func test_hasLapsed_closedWindow_isTrueFromTheFirstInstant() {
        let receivedAt = Date(timeIntervalSince1970: 1_000)

        XCTAssertTrue(ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: 0, now: receivedAt))
        XCTAssertTrue(ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: -1, now: receivedAt))
    }

    /// Une horloge reculée (réglage manuel, resynchronisation) ne rajeunit pas
    /// une preuve : reçue « dans le futur », elle est tenue pour échue.
    func test_hasLapsed_clockTurnedBack_isTrue() {
        let receivedAt = Date(timeIntervalSince1970: 1_000)

        XCTAssertTrue(ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: 540, now: receivedAt.addingTimeInterval(-1)))
    }

    func test_hasLapsed_windowBeyondTheHardBound_stopsAtTheBound() {
        let receivedAt = Date(timeIntervalSince1970: 1_000)

        XCTAssertTrue(ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: 1_000_000, now: receivedAt.addingTimeInterval(1_801)))
    }

    // MARK: - Ce que sert la passerelle

    private func decodeLogin(_ data: String) throws -> LoginResponseData {
        try JSONDecoder().decode(APIResponse<LoginResponseData>.self, from: Data(#"{"success":true,"data":\#(data)}"#.utf8)).data
    }

    private static let session = #""token":"jwt","sessionToken":"sess","user":{"id":"u1","username":"alice"}"#
    private static let challenge = #""requires2FA":true,"twoFactorToken":"2fa-tok""#

    func test_decode_adoptWithinSeconds_integer_isRead() throws {
        XCTAssertEqual(try decodeLogin("{\(Self.session),\"adoptWithinSeconds\":600}").adoptWithinSeconds, 600)
        XCTAssertEqual(try decodeLogin("{\(Self.challenge),\"adoptWithinSeconds\":0}").adoptWithinSeconds, 0)
    }

    func test_decode_adoptWithinSeconds_absentOrNull_isNil() throws {
        XCTAssertNil(try decodeLogin("{\(Self.session)}").adoptWithinSeconds)
        XCTAssertNil(try decodeLogin("{\(Self.session),\"adoptWithinSeconds\":null}").adoptWithinSeconds)
    }

    /// La preuve est déjà consommée quand la réponse se décode : un délai
    /// illisible ne la fait pas perdre, il se lit absent — donc le repli.
    func test_decode_adoptWithinSeconds_notAnInteger_isNil_andKeepsTheSession() throws {
        for served in [#""600""#, "600.5", "true", "1e40", "{}", "[600]"] {
            let data = try decodeLogin("{\(Self.session),\"adoptWithinSeconds\":\(served)}")

            XCTAssertNil(data.adoptWithinSeconds, served)
            XCTAssertEqual(data.token, "jwt", served)
            XCTAssertEqual(data.user?.id, "u1", served)
        }
    }

    func test_decode_otherFields_areReadAsBefore() throws {
        let data = try decodeLogin(#"{"status":"verification-required","email":"a@b.co","accountCreated":true,"pendingSessionToken":"p","expiresIn":3600,"phoneOwnershipConflict":false}"#)

        XCTAssertEqual(data.status, "verification-required")
        XCTAssertEqual(data.email, "a@b.co")
        XCTAssertEqual(data.accountCreated, true)
        XCTAssertEqual(data.pendingSessionToken, "p")
        XCTAssertEqual(data.expiresIn, 3600)
        XCTAssertEqual(data.phoneOwnershipConflict, false)
        XCTAssertNil(data.token)
    }

    // MARK: - La session et le défi portent la fenêtre servie

    func test_served_session_withServedDelay_isAdoptableForTheDelayMinusTheMargin() throws {
        let receivedAt = Date(timeIntervalSince1970: 5_000)
        let data = try decodeLogin("{\(Self.session),\"adoptWithinSeconds\":300}")

        let proven = try XCTUnwrap(try EmailProvenSession.served(by: data, receivedAt: receivedAt))

        XCTAssertEqual(proven.receivedAt, receivedAt)
        XCTAssertEqual(proven.adoptableFor, 240)
        XCTAssertFalse(proven.hasLapsedAdoptionWindow(now: receivedAt.addingTimeInterval(240)))
        XCTAssertTrue(proven.hasLapsedAdoptionWindow(now: receivedAt.addingTimeInterval(241)))
    }

    func test_served_session_withoutDelay_isAdoptableForTheFallback() throws {
        let proven = try XCTUnwrap(try EmailProvenSession.served(by: try decodeLogin("{\(Self.session)}")))

        XCTAssertEqual(proven.adoptableFor, 540)
        XCTAssertEqual(EmailProvenSession.adoptionWindow, ProvenAdoptionWindow.fallback(for: .session))
    }

    func test_served_session_withUnreadableOrNegativeDelay_isAdoptableForTheFallback() throws {
        for served in [#""86400""#, "-30", "86400.5"] {
            let proven = try XCTUnwrap(try EmailProvenSession.served(by: try decodeLogin("{\(Self.session),\"adoptWithinSeconds\":\(served)}")))

            XCTAssertEqual(proven.adoptableFor, 540, served)
        }
    }

    func test_served_session_withZeroDelay_isAlreadyLapsed() throws {
        let receivedAt = Date(timeIntervalSince1970: 5_000)

        let proven = try XCTUnwrap(try EmailProvenSession.served(by: try decodeLogin("{\(Self.session),\"adoptWithinSeconds\":0}"), receivedAt: receivedAt))

        XCTAssertEqual(proven.adoptableFor, 0)
        XCTAssertTrue(proven.hasLapsedAdoptionWindow(now: receivedAt))
    }

    func test_served_session_withAnOversizedDelay_stopsAtTheHardBound() throws {
        let receivedAt = Date(timeIntervalSince1970: 5_000)

        let proven = try XCTUnwrap(try EmailProvenSession.served(by: try decodeLogin("{\(Self.session),\"adoptWithinSeconds\":31536000}"), receivedAt: receivedAt))

        XCTAssertEqual(proven.adoptableFor, 1_800)
        XCTAssertTrue(proven.hasLapsedAdoptionWindow(now: receivedAt.addingTimeInterval(1_801)))
    }

    func test_served_secondFactor_withServedDelay_carriesItsOwnWindow() throws {
        let receivedAt = Date(timeIntervalSince1970: 5_000)
        let data = try decodeLogin("{\(Self.challenge),\"adoptWithinSeconds\":200}")

        XCTAssertThrowsError(try EmailProvenSession.served(by: data, receivedAt: receivedAt)) { error in
            let challenge = error as? SecondFactorRequired
            XCTAssertEqual(challenge?.twoFactorToken, "2fa-tok")
            XCTAssertEqual(challenge?.receivedAt, receivedAt)
            XCTAssertEqual(challenge?.adoptableFor, 140)
            XCTAssertEqual(challenge?.hasLapsedAdoptionWindow(now: receivedAt.addingTimeInterval(140)), false)
            XCTAssertEqual(challenge?.hasLapsedAdoptionWindow(now: receivedAt.addingTimeInterval(141)), true)
        }
    }

    /// Le défi ne prend jamais le repli de la session, plus long que le sien.
    func test_served_secondFactor_withoutOrWithUnreadableDelay_isAdoptableForItsFallback() throws {
        for extra in ["", #","adoptWithinSeconds":"600""#, #","adoptWithinSeconds":-1"#] {
            XCTAssertThrowsError(try EmailProvenSession.served(by: try decodeLogin("{\(Self.challenge)\(extra)}"))) { error in
                XCTAssertEqual((error as? SecondFactorRequired)?.adoptableFor, 240, extra)
            }
        }
    }

    func test_emailProvenSession_init_boundsAnyWindowItIsGiven() {
        let user = MeeshyUser(id: "u", username: "u", displayName: "U")

        XCTAssertEqual(EmailProvenSession(token: "t", sessionToken: nil, user: user, adoptableFor: 1_000_000).adoptableFor, 1_800)
        XCTAssertEqual(EmailProvenSession(token: "t", sessionToken: nil, user: user, adoptableFor: -1).adoptableFor, 0)
        XCTAssertEqual(SecondFactorRequired(twoFactorToken: nil, adoptableFor: 1_000_000).adoptableFor, 1_800)
    }

    func test_originating_keepsTheServedWindow() {
        let user = MeeshyUser(id: "u", username: "u", displayName: "U")
        let proven = EmailProvenSession(token: "t", sessionToken: nil, user: user, adoptableFor: 120)

        XCTAssertEqual(proven.originating(from: .registration).adoptableFor, 120)
    }

    // MARK: - Le miroir de packages/shared

    private func sharedContract() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Auth
            .deletingLastPathComponent() // MeeshySDKTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK
            .deletingLastPathComponent() // packages
            .appendingPathComponent("shared/utils/proven-session-adoption.ts")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func firstCapture(_ pattern: String, in source: String) throws -> String {
        let regex = try NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators])
        let match = try XCTUnwrap(
            regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
            "introuvable dans proven-session-adoption.ts : \(pattern)")
        return String(source[try XCTUnwrap(Range(match.range(at: 1), in: source))])
    }

    /// « 9 * 60 * 1000 » ⇒ 540000. Toute autre forme fait tomber la garde :
    /// elle se réécrit alors avec le contrat, jamais ne se contourne.
    private func milliseconds(_ expression: String) throws -> Int {
        try expression.split(separator: "*").reduce(1) { product, factor in
            let trimmed = factor.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "_", with: "")
            return product * (try XCTUnwrap(Int(trimmed), "facteur illisible : « \(factor) » dans « \(expression) »"))
        }
    }

    func test_mirror_margin_matchesTheSharedContract() throws {
        let served = try milliseconds(try firstCapture(#"PROVEN_ADOPTION_CLIENT_MARGIN_MS\s*=\s*([^;]+);"#, in: try sharedContract()))

        XCTAssertEqual(ProvenAdoptionWindow.clientMargin * 1000, TimeInterval(served))
    }

    func test_mirror_hardBound_matchesTheSharedContract() throws {
        let served = try milliseconds(try firstCapture(#"PROVEN_ADOPTION_CLIENT_MAX_MS\s*=\s*([^;]+);"#, in: try sharedContract()))

        XCTAssertEqual(ProvenAdoptionWindow.clientMax * 1000, TimeInterval(served))
    }

    /// Chaque sorte du contrat a son repli ici, à la même valeur — et une sorte
    /// ajoutée d'un seul côté fait tomber la garde.
    func test_mirror_fallbacks_matchTheSharedContract_kindForKind() throws {
        let block = try firstCapture(#"PROVEN_ADOPTION_CLIENT_FALLBACK_MS[^=]*=\s*\{(.*?)\};"#, in: try sharedContract())
        let entry = try NSRegularExpression(pattern: #"'?([A-Za-z-]+)'?\s*:\s*([0-9_* ]+),"#)
        let served = try entry.matches(in: block, range: NSRange(block.startIndex..., in: block))
            .reduce(into: [String: Int]()) { table, match in
                let kind = String(block[try XCTUnwrap(Range(match.range(at: 1), in: block))])
                table[kind] = try milliseconds(String(block[try XCTUnwrap(Range(match.range(at: 2), in: block))]))
            }

        XCTAssertEqual(Set(served.keys), Set(ProvenAdoptionKind.allCases.map(\.rawValue)))
        for kind in ProvenAdoptionKind.allCases {
            XCTAssertEqual(ProvenAdoptionWindow.fallback(for: kind) * 1000, TimeInterval(try XCTUnwrap(served[kind.rawValue])), kind.rawValue)
        }
    }

    /// La FORME de `provenAdoptionClientWindowMs`, que `clientWindow`
    /// reproduit : repli sur un délai illisible ou négatif, marge retranchée,
    /// plancher à zéro, plafond à la borne dure. Le contrat partagé s'arrête
    /// là : `hasLapsed` n'y a aucun pendant, cette garde ne le couvre pas.
    func test_mirror_rule_hasTheShapeThisFileReproduces() throws {
        let contract = try sharedContract()

        for fragment in [
            "!Number.isSafeInteger(adoptWithinSeconds) || (adoptWithinSeconds as number) < 0",
            "return PROVEN_ADOPTION_CLIENT_FALLBACK_MS[kind];",
            "(adoptWithinSeconds as number) * 1000 - PROVEN_ADOPTION_CLIENT_MARGIN_MS",
            "return Math.min(Math.max(0, window), PROVEN_ADOPTION_CLIENT_MAX_MS);",
        ] {
            XCTAssertTrue(contract.contains(fragment), "la règle partagée a changé : « \(fragment) » — relire ProvenAdoptionWindow.swift")
        }
    }

    /// Plus aucune fenêtre recopiée comme vérité hors de la règle.
    func test_mirror_noOtherLiteralWindow_inTheEmailAccessSource() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Auth/AuthManager+EmailAccess.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(source.contains("9 * 60"))
        XCTAssertFalse(source.contains("4 * 60"))
        XCTAssertTrue(source.contains("public static let adoptionWindow: TimeInterval = ProvenAdoptionWindow.fallback(for: .session)"))
    }
}
