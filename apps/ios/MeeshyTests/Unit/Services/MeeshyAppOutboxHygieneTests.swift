import XCTest
@testable import Meeshy

/// P1/P2 — regression coverage for two dead/silent-failure patterns inside
/// `MeeshyApp.swift`'s cold-start `.task` block. Both are inline closures
/// (`SettingsActionQueue.setFlushHandler`, the outbox-recovery `Task.detached`)
/// that cannot be independently invoked from a unit test host — same
/// constraint as `MeeshyAppLogoutTests`/`MeeshyAppMagicLinkGuardTests`, so
/// this pins the fix via source inspection.
@MainActor
final class MeeshyAppOutboxHygieneTests: XCTestCase {

    private func meeshyAppSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // MeeshyAppOutboxHygieneTests.swift -> Services
            .deletingLastPathComponent() // Services -> Unit
            .deletingLastPathComponent() // Unit -> MeeshyTests
            .deletingLastPathComponent() // MeeshyTests -> apps/ios
            .appendingPathComponent("Meeshy/MeeshyApp.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - SettingsActionQueue flush handler (P1 — MeeshyApp:281 4xx replay loop)

    private func settingsFlushHandlerBody(from source: String) -> String? {
        guard let start = source.range(of: "await SettingsActionQueue.shared.setFlushHandler"),
              let end = source.range(of: "\n                    }\n", range: start.upperBound..<source.endIndex) else {
            return nil
        }
        return String(source[start.upperBound..<end.lowerBound])
    }

    func test_settingsFlushHandler_doesNotCatchDeadAPIErrorType() throws {
        let source = try meeshyAppSource()
        guard let body = settingsFlushHandlerBody(from: source) else {
            XCTFail("Could not locate SettingsActionQueue.setFlushHandler body in MeeshyApp.swift")
            return
        }
        XCTAssertFalse(
            body.contains("catch APIError."),
            "APIClient.request only ever throws MeeshyError — catching the legacy APIError type here " +
            "is dead code that silently falls through, replaying every 4xx settings mutation forever."
        )
    }

    func test_settingsFlushHandler_catchesMeeshyErrorServer_forPermanentClientErrorCodes() throws {
        let source = try meeshyAppSource()
        guard let body = settingsFlushHandlerBody(from: source) else {
            XCTFail("Could not locate SettingsActionQueue.setFlushHandler body in MeeshyApp.swift")
            return
        }
        XCTAssertTrue(
            body.contains("catch MeeshyError.server(let code, _) where [400, 404, 413, 422].contains(code)"),
            "Must catch the real MeeshyError.server case for an explicit allow-list of terminal 4xx " +
            "codes so client-side validation errors are dropped instead of replayed forever."
        )
    }

    // P1 — a bare `(400..<500).contains(code)` range silently swept 429
    // (rate-limited) into "terminal" and dropped a queued settings mutation
    // forever, contradicting `OutboxFlusher.permanentRejectionStatusCodes`
    // which explicitly documents 429 as retryable (mirrors APIClient's own
    // `retryableStatusCodes`). Pin that 429 is excluded from the terminal set.
    func test_settingsFlushHandler_doesNotTreat429AsTerminal() throws {
        let source = try meeshyAppSource()
        guard let body = settingsFlushHandlerBody(from: source) else {
            XCTFail("Could not locate SettingsActionQueue.setFlushHandler body in MeeshyApp.swift")
            return
        }
        XCTAssertFalse(
            body.contains("(400..<500).contains(code)"),
            "Must not use an unfiltered 4xx range — it silently sweeps 429 (rate-limited, retryable) " +
            "into the terminal/drop path."
        )
        guard let range = body.range(of: "catch MeeshyError.server(let code, _) where ") else {
            XCTFail("Could not locate the MeeshyError.server catch guard")
            return
        }
        let guardLine = String(body[range.upperBound...].prefix(60))
        XCTAssertFalse(
            guardLine.contains("429"),
            "429 must not appear in the terminal-status allow-list — it is retryable, not permanent."
        )
    }

    func test_settingsFlushHandler_alsoTreatsForbiddenAsTerminal() throws {
        // 403 arrives as its own `MeeshyError.forbidden` case (not `.server`),
        // so the 4xx-range catch above does not cover it — a separate arm is
        // required to preserve the original "any 4xx is terminal" intent.
        let source = try meeshyAppSource()
        guard let body = settingsFlushHandlerBody(from: source) else {
            XCTFail("Could not locate SettingsActionQueue.setFlushHandler body in MeeshyApp.swift")
            return
        }
        XCTAssertTrue(
            body.contains("catch MeeshyError.forbidden"),
            "403 (MeeshyError.forbidden) must also be treated as terminal, not replayed."
        )
    }

    // MARK: - Outbox-flusher boot recovery (P2 — silent try? swallow)

    func test_outboxFlusherBootRecovery_doesNotUseSilentTryOptional() throws {
        let source = try meeshyAppSource()
        guard let anchorRange = source.range(of: "let flusher = OutboxFlusher(") else {
            XCTFail("Could not locate the outbox-flusher construction site in MeeshyApp.swift")
            return
        }
        // Look at the ~400 characters immediately preceding the flusher
        // construction — that is where bootRecovery() is called just before it.
        let precedingStart = source.index(anchorRange.lowerBound, offsetBy: -400, limitedBy: source.startIndex) ?? source.startIndex
        let preceding = String(source[precedingStart..<anchorRange.lowerBound])
        XCTAssertFalse(
            preceding.contains("try? await OfflineQueue.shared.bootRecovery()"),
            "A failed bootRecovery() here must not be silently swallowed — crash-orphaned .inflight " +
            "outbox rows would stay invisible to flush() for the rest of this cold start with no trace."
        )
        XCTAssertTrue(
            preceding.contains("do {") && preceding.contains("try await OfflineQueue.shared.bootRecovery()") && preceding.contains("} catch {"),
            "bootRecovery() must be wrapped in do/catch with a log on failure."
        )
    }
}
