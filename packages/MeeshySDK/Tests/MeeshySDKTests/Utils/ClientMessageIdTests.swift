import XCTest
@testable import MeeshySDK

/// Phase 4 §6.2 — exercises the centralised `ClientMessageId` helper that
/// produces the canonical `cid_<uuid v4 lowercase>` format end-to-end. The
/// gateway regex anchors on lowercase hex, so a regression here breaks the
/// idempotent dedup contract for every iOS-originated message.
final class ClientMessageIdTests: XCTestCase {

    // MARK: - generate()

    func test_generate_producesCidPrefix() {
        let cid = ClientMessageId.generate()
        XCTAssertTrue(cid.hasPrefix("cid_"), "Expected `cid_` prefix, got: \(cid)")
    }

    func test_generate_producesLowercaseHex() {
        let cid = ClientMessageId.generate()
        let suffix = String(cid.dropFirst("cid_".count))
        XCTAssertEqual(suffix, suffix.lowercased(),
                       "UUID suffix must be lowercase to match gateway regex")
    }

    func test_generate_matchesCanonicalRegex() {
        for _ in 0..<100 {
            let cid = ClientMessageId.generate()
            XCTAssertTrue(ClientMessageId.isValid(cid),
                          "Generated id must validate against its own regex: \(cid)")
        }
    }

    func test_generate_isUniqueAcrossInvocations() {
        let count = 1_000
        var seen = Set<String>()
        for _ in 0..<count {
            seen.insert(ClientMessageId.generate())
        }
        XCTAssertEqual(seen.count, count, "Two generated ids collided in \(count) draws")
    }

    func test_generate_total_length_is_40_characters() {
        // "cid_" (4) + UUID lowercase string (36) = 40
        let cid = ClientMessageId.generate()
        XCTAssertEqual(cid.count, 40, "Expected 40 characters, got \(cid.count) for: \(cid)")
    }

    // MARK: - isValid(_:)

    func test_isValid_acceptsCanonicalLowercaseUUID() {
        // UUID v4 — version digit is 4, variant digit in [89ab].
        let valid = "cid_550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(ClientMessageId.isValid(valid))
    }

    func test_isValid_rejectsUppercaseHex() {
        // Swift's UUID().uuidString is uppercase by default — this is the
        // exact failure mode we are guarding against.
        let upper = "cid_550E8400-E29B-41D4-A716-446655440000"
        XCTAssertFalse(ClientMessageId.isValid(upper),
                       "Uppercase hex must be rejected so callers cannot drift from gateway regex")
    }

    func test_isValid_rejectsMissingPrefix() {
        let raw = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertFalse(ClientMessageId.isValid(raw))
    }

    func test_isValid_rejectsWrongPrefix() {
        let other = "cli_550e8400-e29b-41d4-a716-446655440000"
        XCTAssertFalse(ClientMessageId.isValid(other))
    }

    func test_isValid_rejectsNonV4Version() {
        // 3rd group must start with "4" — this one starts with "1".
        let nonV4 = "cid_550e8400-e29b-11d4-a716-446655440000"
        XCTAssertFalse(ClientMessageId.isValid(nonV4))
    }

    func test_isValid_rejectsInvalidVariantDigit() {
        // 4th group must start with [89ab] — this one starts with "c".
        let badVariant = "cid_550e8400-e29b-41d4-c716-446655440000"
        XCTAssertFalse(ClientMessageId.isValid(badVariant))
    }

    func test_isValid_rejectsTruncated() {
        let truncated = "cid_550e8400-e29b-41d4-a716-44665544"
        XCTAssertFalse(ClientMessageId.isValid(truncated))
    }

    func test_isValid_rejectsEmptyString() {
        XCTAssertFalse(ClientMessageId.isValid(""))
    }

    func test_isValid_rejectsLegacyTempPrefix() {
        // Pre-Phase-4 the iOS app produced `temp_<uuid>` / `offline_<uuid>` /
        // `retry_<uuid>` — none of these should be accepted by the new regex.
        XCTAssertFalse(ClientMessageId.isValid("temp_550e8400-e29b-41d4-a716-446655440000"))
        XCTAssertFalse(ClientMessageId.isValid("offline_550e8400-e29b-41d4-a716-446655440000"))
        XCTAssertFalse(ClientMessageId.isValid("retry_550e8400-e29b-41d4-a716-446655440000"))
    }

    func test_regexPattern_isAnchored() {
        // Anchoring guards against `cid_<uuid>extra-trash` slipping through
        // when the value is reused from a partial match elsewhere.
        XCTAssertTrue(ClientMessageId.regexPattern.hasPrefix("^"))
        XCTAssertTrue(ClientMessageId.regexPattern.hasSuffix("$"))
    }
}
