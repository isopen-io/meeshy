import Testing
import Foundation
@testable import MeeshySDK

/// Pure-model tests for `CallSummaryMetadata`: JSON decode (gateway shape),
/// per-viewer direction, and the duration / data-size formatters that mirror
/// the shared TypeScript source of truth (`packages/shared/utils/call-summary.ts`).
struct CallSummaryMetadataTests {

    private func decode(_ json: String) throws -> CallSummaryMetadata {
        try JSONDecoder().decode(CallSummaryMetadata.self, from: Data(json.utf8))
    }

    @Test func decodesGatewayCallPayload() throws {
        let meta = try decode("""
        {
          "kind": "call",
          "callId": "c1",
          "initiatorId": "u_a",
          "callType": "video",
          "outcome": "completed",
          "durationSeconds": 272,
          "bytesTotal": 2400000,
          "bytesEstimated": false,
          "networkQuality": "good"
        }
        """)
        #expect(meta.callId == "c1")
        #expect(meta.callType == .video)
        #expect(meta.outcome == .completed)
        #expect(meta.durationSeconds == 272)
        #expect(meta.bytesTotal == 2_400_000)
        #expect(meta.bytesEstimated == false)
        #expect(meta.networkQuality == .good)
    }

    @Test func rejectsNonCallMetadata() {
        #expect(throws: (any Error).self) {
            _ = try decode(#"{"kind":"poll","callId":"x"}"#)
        }
    }

    @Test func toleratesMissingOptionalFields() throws {
        let meta = try decode("""
        {"kind":"call","callId":"c2","initiatorId":"u_b","callType":"audio","outcome":"missed"}
        """)
        #expect(meta.durationSeconds == 0)
        #expect(meta.bytesTotal == nil)
        #expect(meta.bytesEstimated == false)
        #expect(meta.networkQuality == nil)
        #expect(meta.dataSpentLabel == nil)
    }

    @Test func roundTripsThroughCodable() throws {
        let original = CallSummaryMetadata(
            callId: "c3", initiatorId: "u_c", callType: .audio, outcome: .completed,
            durationSeconds: 65, bytesTotal: 1_500_000, bytesEstimated: true, networkQuality: .fair
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallSummaryMetadata.self, from: data)
        #expect(decoded == original)
    }

    @Test func directionIsResolvedPerViewer() {
        let meta = CallSummaryMetadata(
            callId: "c", initiatorId: "alice", callType: .audio, outcome: .completed,
            durationSeconds: 10, bytesTotal: nil, bytesEstimated: false, networkQuality: nil
        )
        #expect(meta.isOutgoing(currentUserId: "alice") == true)
        #expect(meta.isOutgoing(currentUserId: "bob") == false)
        #expect(meta.isOutgoing(currentUserId: "") == false)
    }

    @Test func durationLabelMirrorsSharedFormatter() {
        #expect(CallSummaryMetadata.formatDuration(0) == "00:00")
        #expect(CallSummaryMetadata.formatDuration(272) == "04:32")
        #expect(CallSummaryMetadata.formatDuration(3661) == "1:01:01")
        #expect(CallSummaryMetadata.formatDuration(-5) == "00:00")
    }

    @Test func dataSizeFormatterMirrorsSharedFormatter() {
        #expect(CallSummaryMetadata.formatDataSize(0) == "0 KB")
        #expect(CallSummaryMetadata.formatDataSize(400) == "1 KB")
        #expect(CallSummaryMetadata.formatDataSize(512_000) == "512 KB")
        #expect(CallSummaryMetadata.formatDataSize(2_400_000) == "2.4 MB")
        #expect(CallSummaryMetadata.formatDataSize(3_000_000) == "3 MB")
        #expect(CallSummaryMetadata.formatDataSize(1_100_000_000) == "1.1 GB")
    }

    @Test func dataSpentLabelPrefixesEstimatesWithTilde() {
        let estimated = CallSummaryMetadata(
            callId: "c", initiatorId: "a", callType: .audio, outcome: .completed,
            durationSeconds: 60, bytesTotal: 1_500_000, bytesEstimated: true, networkQuality: nil
        )
        #expect(estimated.dataSpentLabel == "~1.5 MB")

        let measured = CallSummaryMetadata(
            callId: "c", initiatorId: "a", callType: .video, outcome: .completed,
            durationSeconds: 60, bytesTotal: 2_400_000, bytesEstimated: false, networkQuality: nil
        )
        #expect(measured.dataSpentLabel == "2.4 MB")
    }

    @Test func networkQualityIsOrdered() {
        #expect(CallSummaryMetadata.NetworkQuality.poor < .fair)
        #expect(CallSummaryMetadata.NetworkQuality.good < .excellent)
    }
}
