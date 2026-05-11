import XCTest
@testable import MeeshySDK

/// Wave 1 Task 3.1 — RED-GREEN-REFACTOR for `ClientMutationId`.
///
/// Mirrors `ClientMessageIdTests` for the offline-queue dedup helper. Format
/// contract: `cmid_<uuid v4 lowercase>` (5 prefix chars + 36 uuid chars = 41).
/// The gateway will validate the same shape on incoming mutation envelopes
/// (Task 3.5), so the regex MUST stay aligned with the server side.
final class ClientMutationIdTests: XCTestCase {
    func test_generate_returnsCmidPrefix() {
        let cmid = ClientMutationId.generate()
        XCTAssertTrue(cmid.hasPrefix("cmid_"), "Got: \(cmid)")
        XCTAssertEqual(cmid.count, 5 + 36, "Expected cmid_ + 36-char UUID, got \(cmid.count)")
    }

    func test_isValid_acceptsWellFormed() {
        XCTAssertTrue(ClientMutationId.isValid("cmid_550e8400-e29b-41d4-a716-446655440000"))
    }

    func test_isValid_rejectsWrongPrefix() {
        XCTAssertFalse(ClientMutationId.isValid("foo_550e8400-e29b-41d4-a716-446655440000"))
        XCTAssertFalse(ClientMutationId.isValid("cid_550e8400-e29b-41d4-a716-446655440000"))
    }

    func test_isValid_rejectsUppercase() {
        XCTAssertFalse(ClientMutationId.isValid("cmid_550E8400-E29B-41D4-A716-446655440000"))
    }

    func test_generate_alwaysValid() {
        for _ in 0..<100 {
            let cmid = ClientMutationId.generate()
            XCTAssertTrue(ClientMutationId.isValid(cmid), "Generated invalid id: \(cmid)")
        }
    }
}
