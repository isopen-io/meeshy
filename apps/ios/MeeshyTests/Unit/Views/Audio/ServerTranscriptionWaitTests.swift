import XCTest
@testable import Meeshy

/// #10759 — une transcription demandée au serveur garde « Transcription… » jusqu'à son
/// arrivée ; le plafond n'est qu'un plafond de SILENCE, à 90 s comme sur le web.
@MainActor
final class ServerTranscriptionWaitTests: XCTestCase {

    private let requestedAt = Date(timeIntervalSince1970: 1_000_000)

    private func at(_ seconds: TimeInterval) -> Date { requestedAt.addingTimeInterval(seconds) }

    func test_isWaiting_transcriptionLateAfter20s_buttonHasNotComeBack() {
        for second in stride(from: 0.0, through: 30, by: 1) {
            XCTAssertTrue(ServerTranscriptionWait.isWaiting(requestedAt: requestedAt, now: at(second), hasArrived: false),
                          "à \(Int(second)) s, « Transcrire » ne doit pas être revenu")
        }
    }

    func test_isWaiting_transcriptionArrivedAt30s_isShownAndTheWaitLifts() {
        XCTAssertFalse(ServerTranscriptionWait.isWaiting(requestedAt: requestedAt, now: at(30), hasArrived: true))
    }

    func test_isWaiting_silenceUntil89s_stillWaits() {
        XCTAssertTrue(ServerTranscriptionWait.isWaiting(requestedAt: requestedAt, now: at(89), hasArrived: false))
    }

    func test_isWaiting_silenceAt90s_offersTranscribeAgain() {
        XCTAssertFalse(ServerTranscriptionWait.isWaiting(requestedAt: requestedAt, now: at(90), hasArrived: false))
        XCTAssertEqual(ServerTranscriptionWait.silenceCeiling, 90, "miroir de ON_DEMAND_STALL_MS web")
    }

    func test_guard_fullscreenServerRequestUsesTheSilenceCeiling() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/AudioFullscreenPage+Transcription.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(source.contains("ServerTranscriptionWait.silenceCeiling"))
        XCTAssertFalse(source.contains("20_000_000_000"), "le plafond de 20 s ne revient pas")
    }
}
