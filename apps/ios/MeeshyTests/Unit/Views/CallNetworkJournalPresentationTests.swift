import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CallNetworkJournalPresentationTests: XCTestCase {

    private let start = Date(timeIntervalSince1970: 0)
    private let locale = Locale(identifier: "en_US")

    private func journal(_ kinds: [(TimeInterval, CallNetworkEventKind)]) -> CallNetworkJournal {
        CallNetworkJournal(
            callId: "call-1",
            startedAt: start,
            events: kinds.map { CallNetworkEvent(at: start.addingTimeInterval($0.0), kind: $0.1) }
        )
    }

    private func sample(loss: Double, rtt: Double) -> CallNetworkEventKind {
        .sample(CallNetworkSample(packetLossPercent: loss, roundTripTimeMs: rtt, jitterMs: 8, audioKbps: 24, videoKbps: 0))
    }

    func test_summary_withSamples_showsLossLatencyAndJitter() {
        let presentation = CallNetworkJournalPresentation(
            journal: journal([(15, sample(loss: 1, rtt: 100)), (30, sample(loss: 3, rtt: 300))]),
            locale: locale
        )

        XCTAssertEqual(presentation.summary.map(\.id), ["loss", "latency", "jitter", "reconnections"])
        XCTAssertTrue(presentation.summary.first { $0.id == "latency" }?.value.contains("300") ?? false, "the peak is shown next to the mean")
    }

    func test_summary_withoutSamples_neverInventsMeasures() {
        let presentation = CallNetworkJournalPresentation(journal: journal([(2, .reconnected)]), locale: locale)

        XCTAssertEqual(presentation.summary.map(\.id), ["reconnections"])
        XCTAssertEqual(presentation.summary.first?.value, "1")
    }

    func test_summary_routeProfilesAndFaults_appearWhenKnown() {
        let presentation = CallNetworkJournalPresentation(
            journal: journal([
                (1, .route(relayed: true)),
                (2, .profile(name: "wifi")),
                (40, .profile(name: "cellular")),
                (50, .mediaFault(reason: "camera: busy"))
            ]),
            locale: locale
        )

        XCTAssertEqual(presentation.summary.map(\.id), ["reconnections", "route", "profiles", "faults"])
        XCTAssertEqual(
            presentation.summary.first { $0.id == "profiles" }?.value,
            "\(CallDataProfile.wifi.label) → \(CallDataProfile.cellular.label)"
        )
    }

    func test_timeline_skipsSamples_andKeepsMilestonesInOrder() {
        let presentation = CallNetworkJournalPresentation(
            journal: journal([
                (0, .link(state: "connecting")),
                (15, sample(loss: 1, rtt: 100)),
                (20, .reconnecting(attempt: 1)),
                (25, .reconnected),
                (90, .ended(reason: "local"))
            ]),
            locale: locale
        )

        XCTAssertEqual(presentation.timeline.count, 4)
        XCTAssertEqual(presentation.timeline.map(\.isAlert), [false, true, false, false])
    }

    func test_timeline_mediaFault_carriesItsReason() {
        let presentation = CallNetworkJournalPresentation(
            journal: journal([(5, .mediaFault(reason: "camera: busy"))]),
            locale: locale
        )

        XCTAssertEqual(presentation.timeline.first?.detail, "camera: busy")
        XCTAssertEqual(presentation.timeline.first?.isAlert, true)
    }

    func test_timeline_newAndClosedLinks_areNoise() {
        let presentation = CallNetworkJournalPresentation(
            journal: journal([(0, .link(state: "new")), (9, .link(state: "closed"))]),
            locale: locale
        )

        XCTAssertTrue(presentation.timeline.isEmpty)
    }

    func test_isEmpty_forAJournalWithOnlyReconnectionRow_isFalse() {
        let presentation = CallNetworkJournalPresentation(journal: journal([]), locale: locale)

        XCTAssertFalse(presentation.isEmpty, "the reconnection count always reads, even at zero")
    }
}

@MainActor
final class CallDetailSheetsJournalSourceGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callLogDetail_mountsNetworkAndTranscriptSections() throws {
        let sheet = try source("Features/Contacts/CallDetailSheet.swift")

        XCTAssertTrue(sheet.contains("CallNetworkJournalStore.shared.journal(for: record.callId)"))
        XCTAssertTrue(sheet.contains("CallNetworkJournalSection(presentation:"))
        XCTAssertTrue(sheet.contains("CallTranscriptLoader.load(callId: record.callId)"))
        XCTAssertTrue(sheet.contains("CallTranscriptSection(transcript:"))
    }

    func test_callNoticeDetail_mountsTheSameSections() throws {
        let sheet = try source("Features/Main/Views/Bubble/BubbleCallNoticeView.swift")

        XCTAssertTrue(sheet.contains("CallNetworkJournalStore.shared.journal(for: summary.callId)"))
        XCTAssertTrue(sheet.contains("CallNetworkJournalSection(presentation:"))
        XCTAssertTrue(sheet.contains("CallTranscriptSection(transcript:"))
    }

    func test_callManagerHost_bindsTheJournal() throws {
        let host = try source("Features/Main/Services/CallManagerHost.swift")

        XCTAssertTrue(host.contains("CallNetworkJournalBinding.shared.bind(candidate)"))
    }
}
