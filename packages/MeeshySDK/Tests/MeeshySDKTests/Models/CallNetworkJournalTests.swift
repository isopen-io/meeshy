import Testing
import Foundation
@testable import MeeshySDK

struct CallNetworkJournalTests {

    private func at(_ seconds: TimeInterval) -> Date {
        Date(timeIntervalSince1970: seconds)
    }

    private func sample(loss: Double = 0, rtt: Double = 40, jitter: Double = 5) -> CallNetworkSample {
        CallNetworkSample(packetLossPercent: loss, roundTripTimeMs: rtt, jitterMs: jitter, audioKbps: 24, videoKbps: 300)
    }

    private func journal(_ events: [CallNetworkEvent]) -> CallNetworkJournal {
        CallNetworkJournal(callId: "call-1", startedAt: at(0), events: events)
    }

    @Test func id_equalsCallId() {
        #expect(journal([]).id == "call-1")
    }

    @Test func codable_roundTripsEveryEventKind() throws {
        let original = journal([
            CallNetworkEvent(at: at(1), kind: .link(state: "connected")),
            CallNetworkEvent(at: at(2), kind: .route(relayed: true)),
            CallNetworkEvent(at: at(3), kind: .sample(sample(loss: 2))),
            CallNetworkEvent(at: at(4), kind: .tier(level: "poor")),
            CallNetworkEvent(at: at(5), kind: .profile(name: "cellular")),
            CallNetworkEvent(at: at(6), kind: .reconnecting(attempt: 1)),
            CallNetworkEvent(at: at(7), kind: .reconnected),
            CallNetworkEvent(at: at(8), kind: .mediaFault(reason: "camera-permission-denied")),
            CallNetworkEvent(at: at(9), kind: .ended(reason: "connection-lost"))
        ])
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallNetworkJournal.self, from: data)
        #expect(decoded == original)
    }

    @Test func appending_keepsChronologicalOrder() {
        let next = journal([CallNetworkEvent(at: at(1), kind: .reconnected)])
            .appending(CallNetworkEvent(at: at(2), kind: .route(relayed: false)))
        #expect(next.events.map(\.at) == [at(1), at(2)])
    }

    @Test func appending_beyondCeiling_dropsOldestSamplesBeforeAnyMilestone() {
        let milestone = CallNetworkEvent(at: at(0), kind: .link(state: "connected"))
        let samples = (1...CallNetworkJournal.eventCeiling).map {
            CallNetworkEvent(at: at(TimeInterval($0)), kind: .sample(sample()))
        }
        let full = journal([milestone] + samples)
        let next = full.appending(CallNetworkEvent(at: at(10_000), kind: .reconnected))

        #expect(next.events.count == CallNetworkJournal.eventCeiling)
        #expect(next.events.first == milestone)
        #expect(next.events.last?.kind == .reconnected)
        #expect(!next.events.contains(samples[0]))
        #expect(!next.events.contains(samples[1]))
    }

    @Test func appending_beyondCeilingWithoutSamples_dropsOldestEvents() {
        let events = (0..<CallNetworkJournal.eventCeiling).map {
            CallNetworkEvent(at: at(TimeInterval($0)), kind: .reconnecting(attempt: $0))
        }
        let next = journal(events).appending(CallNetworkEvent(at: at(9_999), kind: .reconnected))

        #expect(next.events.count == CallNetworkJournal.eventCeiling)
        #expect(next.events.first == events[1])
    }

    @Test func merging_interleavesByDateAndKeepsEarliestStart() {
        let stored = CallNetworkJournal(callId: "call-1", startedAt: at(0), events: [
            CallNetworkEvent(at: at(1), kind: .link(state: "connected")),
            CallNetworkEvent(at: at(3), kind: .reconnected)
        ])
        let live = CallNetworkJournal(callId: "call-1", startedAt: at(2), events: [
            CallNetworkEvent(at: at(2), kind: .reconnecting(attempt: 1))
        ])
        let merged = stored.merging(live)

        #expect(merged.startedAt == at(0))
        #expect(merged.events.map(\.at) == [at(1), at(2), at(3)])
    }

    @Test func summary_aggregatesSamplesReconnectionsRouteFaultsAndProfiles() {
        let summary = journal([
            CallNetworkEvent(at: at(1), kind: .profile(name: "wifi")),
            CallNetworkEvent(at: at(2), kind: .route(relayed: false)),
            CallNetworkEvent(at: at(3), kind: .sample(sample(loss: 1, rtt: 100, jitter: 10))),
            CallNetworkEvent(at: at(4), kind: .reconnecting(attempt: 1)),
            CallNetworkEvent(at: at(5), kind: .reconnected),
            CallNetworkEvent(at: at(6), kind: .route(relayed: true)),
            CallNetworkEvent(at: at(7), kind: .profile(name: "cellular")),
            CallNetworkEvent(at: at(8), kind: .sample(sample(loss: 5, rtt: 300, jitter: 30))),
            CallNetworkEvent(at: at(9), kind: .mediaFault(reason: "camera-permission-denied")),
            CallNetworkEvent(at: at(10), kind: .profile(name: "wifi"))
        ]).summary

        #expect(summary.sampleCount == 2)
        #expect(summary.meanPacketLossPercent == 3)
        #expect(summary.peakPacketLossPercent == 5)
        #expect(summary.meanRoundTripTimeMs == 200)
        #expect(summary.peakRoundTripTimeMs == 300)
        #expect(summary.meanJitterMs == 20)
        #expect(summary.reconnectionCount == 1)
        #expect(summary.relayed == true)
        #expect(summary.faultCount == 1)
        #expect(summary.profiles == ["wifi", "cellular"])
    }

    @Test func summary_withoutSamples_reportsZeroesAndUnknownRoute() {
        let summary = journal([]).summary
        #expect(summary.sampleCount == 0)
        #expect(summary.meanPacketLossPercent == 0)
        #expect(summary.relayed == nil)
        #expect(summary.profiles.isEmpty)
    }
}
