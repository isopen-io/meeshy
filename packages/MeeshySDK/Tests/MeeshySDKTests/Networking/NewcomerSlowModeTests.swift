import Testing
import Foundation
@testable import MeeshySDK

/// #7759 — un envoi refusé par le mode lent des nouveaux comptes (Meeshy
/// Global, #7740) remonte avec son DÉLAI : le transport ne l'attend plus en
/// silence, et la file durable ne le tient pas pour définitif.
@Suite("NewcomerSlowMode — le refus du mode lent remonte avec son délai (#7759)")
struct NewcomerSlowModeTests {

    private static func response(status: Int, retryAfter: String? = nil) -> HTTPURLResponse {
        HTTPURLResponse(
            url: URL(string: "https://gate.meeshy.me/api/v1/conversations/c/messages")!,
            statusCode: status,
            httpVersion: nil,
            headerFields: retryAfter.map { ["Retry-After": $0] }
        )!
    }

    private static let body = Data(#"{"success":false,"error":"Bienvenue !","message":"Bienvenue !","code":"NEWCOMER_SLOW_MODE","retryAfter":12}"#.utf8)

    @Test("l'en-tête Retry-After fait foi")
    func headerWins() {
        #expect(NewcomerSlowMode.fromResponse(Self.response(status: 429, retryAfter: "27"), body: Self.body)?.retryAfterSeconds == 27)
    }

    @Test("sans en-tête, le retryAfter de l'enveloppe")
    func envelopeFallback() {
        #expect(NewcomerSlowMode.fromResponse(Self.response(status: 429), body: Self.body)?.retryAfterSeconds == 12)
    }

    @Test("un autre 429, ou un autre statut, n'est pas le mode lent")
    func otherRefusalsAreNotSlowMode() {
        let rateLimit = Data(#"{"success":false,"error":"Too many requests"}"#.utf8)
        #expect(NewcomerSlowMode.fromResponse(Self.response(status: 429, retryAfter: "2"), body: rateLimit) == nil)
        #expect(NewcomerSlowMode.fromResponse(Self.response(status: 403), body: Self.body) == nil)
    }

    @Test("le refus levé par le transport se relit avec son délai")
    func rejectionRoundTrip() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let error = MeeshyError.rejected(NewcomerSlowMode(retryAfterSeconds: 18).rejection(message: "Bienvenue !", now: now))
        #expect(NewcomerSlowMode.from(error, now: now.addingTimeInterval(0.2))?.retryAfterSeconds == 18)
        #expect(NewcomerSlowMode.from(MeeshyError.server(statusCode: 429, message: "Trop de requetes")) == nil)
    }

    @Test("un refus temporaire : ni limite du jour, ni rejet définitif pour la file durable")
    func notTerminalForTheOutbox() {
        let error = MeeshyError.rejected(NewcomerSlowMode(retryAfterSeconds: 30).rejection(message: nil))
        #expect(DailyGestureLimit.from(error) == nil)
        #expect(OutboxFlusher.isPermanentServerRejection(error) == false)
    }

    @Test("le transport ne rejoue pas le mode lent en silence")
    func transportDoesNotSilentlyRetry() throws {
        #expect(APIRetryPolicy.shouldRetry(
            statusCode: 429, attempt: 0, retryPolicy: .standard, hasDailyLimit: false, hasSlowMode: true
        ) == false)
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Sources/MeeshySDK/Networking/APIRequestPipeline.swift"),
            encoding: .utf8
        )
        #expect(source.contains("return .rejected(slowMode.rejection(message: message))"))
    }
}
