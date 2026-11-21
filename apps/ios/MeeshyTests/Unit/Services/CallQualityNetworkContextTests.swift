import XCTest
@testable import Meeshy

@MainActor
final class CallStatsRelayedRouteTests: XCTestCase {

    private func candidate(_ id: String, type: String) -> CallStats.RawEntry {
        CallStats.RawEntry(id: id, type: "local-candidate", strings: ["candidateType": type])
    }

    private func remote(_ id: String, type: String) -> CallStats.RawEntry {
        CallStats.RawEntry(id: id, type: "remote-candidate", strings: ["candidateType": type])
    }

    private func pair(_ id: String, local: String, remote: String, nominated: Bool = true, state: String = "succeeded") -> CallStats.RawEntry {
        CallStats.RawEntry(
            id: id,
            type: "candidate-pair",
            values: ["nominated": nominated ? 1 : 0],
            strings: ["localCandidateId": local, "remoteCandidateId": remote, "state": state]
        )
    }

    func test_relayedRoute_selectedPairOnTurn_isRelayed() {
        let entries = [
            CallStats.RawEntry(id: "T01", type: "transport", strings: ["selectedCandidatePairId": "CP1"]),
            pair("CP1", local: "L1", remote: "R1"),
            candidate("L1", type: "relay"),
            remote("R1", type: "srflx")
        ]

        XCTAssertEqual(CallStats.relayedRoute(in: entries), true)
    }

    func test_relayedRoute_selectedPairOnHostAndSrflx_isDirect() {
        let entries = [
            CallStats.RawEntry(id: "T01", type: "transport", strings: ["selectedCandidatePairId": "CP2"]),
            pair("CP1", local: "L1", remote: "R1"),
            pair("CP2", local: "L2", remote: "R2"),
            candidate("L1", type: "relay"),
            remote("R1", type: "relay"),
            candidate("L2", type: "host"),
            remote("R2", type: "srflx")
        ]

        XCTAssertEqual(CallStats.relayedRoute(in: entries), false, "Only the SELECTED pair decides the route")
    }

    func test_relayedRoute_withoutTransport_fallsBackToTheNominatedPair() {
        let entries = [
            pair("CP1", local: "L1", remote: "R1", nominated: false, state: "in-progress"),
            pair("CP2", local: "L2", remote: "R2"),
            candidate("L1", type: "host"),
            remote("R1", type: "host"),
            candidate("L2", type: "relay"),
            remote("R2", type: "srflx")
        ]

        XCTAssertEqual(CallStats.relayedRoute(in: entries), true)
    }

    func test_relayedRoute_noSelectedPair_isUnknown() {
        let entries = [pair("CP1", local: "L1", remote: "R1", nominated: false, state: "in-progress")]

        XCTAssertNil(CallStats.relayedRoute(in: entries))
    }

    func test_reduce_carriesTheRouteIntoTheStats() {
        let entries = [
            CallStats.RawEntry(id: "T01", type: "transport", strings: ["selectedCandidatePairId": "CP1"]),
            pair("CP1", local: "L1", remote: "R1"),
            candidate("L1", type: "relay"),
            remote("R1", type: "relay")
        ]

        XCTAssertEqual(CallStats.reduce(entries: entries).relayed, true)
    }

    func test_rawProjection_readsNumbersAndRouteStrings() {
        let entry = CallStats.RawEntry(
            id: "CP1",
            type: "candidate-pair",
            raw: [
                "currentRoundTripTime": NSNumber(value: 0.12),
                "nominated": NSNumber(value: true),
                "localCandidateId": "L1" as NSString,
                "state": "succeeded" as NSString,
                "unrelated": "x" as NSString
            ]
        )

        XCTAssertEqual(entry.values["currentRoundTripTime"], 0.12)
        XCTAssertEqual(entry.values["nominated"], 1)
        XCTAssertEqual(entry.strings, ["localCandidateId": "L1", "state": "succeeded"])
    }

    // MARK: - #20098 — RTT, débit et route se lisent sur la MÊME paire élue

    private func measuredPair(_ id: String, local: String, remote: String, nominated: Bool = true,
                              state: String = "succeeded", rtt: Double? = nil, bitrate: Double? = nil) -> CallStats.RawEntry {
        let measures = ["currentRoundTripTime": rtt, "availableOutgoingBitrate": bitrate].compactMapValues { $0 }
        return CallStats.RawEntry(
            id: id,
            type: "candidate-pair",
            values: measures.merging(["nominated": nominated ? 1 : 0]) { current, _ in current },
            strings: ["localCandidateId": local, "remoteCandidateId": remote, "state": state]
        )
    }

    private func transport(selecting id: String) -> CallStats.RawEntry {
        CallStats.RawEntry(id: "T01", type: "transport", strings: ["selectedCandidatePairId": id])
    }

    func test_selectedCandidatePair_transportNamesACandidate_fallsBackToTheNominatedPair() {
        let entries = [
            transport(selecting: "L1"),
            measuredPair("CP1", local: "L1", remote: "R1", rtt: 0.05),
            candidate("L1", type: "relay"),
            remote("R1", type: "srflx"),
            measuredPair("CP9", local: "L9", remote: "R9", nominated: false, state: "in-progress", rtt: 0.4)
        ]

        XCTAssertEqual(CallStats.selectedCandidatePair(in: entries)?.id, "CP1")
        XCTAssertEqual(CallStats.relayedRoute(in: entries), true)
        XCTAssertEqual(CallStats.reduce(entries: entries).roundTripTimeMs, 50, accuracy: 0.001)
    }

    func test_selectedCandidatePair_transportNamesAnAbsentPair_fallsBackToTheNominatedPair() {
        let entries = [
            transport(selecting: "ghost"),
            measuredPair("CP1", local: "L1", remote: "R1", rtt: 0.05),
            candidate("L1", type: "relay"),
            remote("R1", type: "host"),
            measuredPair("CP9", local: "L9", remote: "R9", nominated: false, state: "in-progress", rtt: 0.4)
        ]

        XCTAssertEqual(CallStats.selectedCandidatePair(in: entries)?.id, "CP1")
        XCTAssertEqual(CallStats.relayedRoute(in: entries), true)
        XCTAssertEqual(CallStats.reduce(entries: entries).roundTripTimeMs, 50, accuracy: 0.001)
    }

    func test_selectedCandidatePair_transportNamesARealUnnominatedPair_keepsIt() {
        let entries = [
            transport(selecting: "CP2"),
            measuredPair("CP2", local: "L2", remote: "R2", nominated: false, state: "in-progress", rtt: 0.08),
            measuredPair("CP1", local: "L1", remote: "R1", rtt: 0.3),
            candidate("L1", type: "relay"),
            remote("R1", type: "relay"),
            candidate("L2", type: "host"),
            remote("R2", type: "srflx")
        ]

        XCTAssertEqual(CallStats.selectedCandidatePair(in: entries)?.id, "CP2")
        XCTAssertEqual(CallStats.relayedRoute(in: entries), false)
        XCTAssertEqual(CallStats.reduce(entries: entries).roundTripTimeMs, 80, accuracy: 0.001)
    }

    func test_reduce_probePairListedLast_readsRttAndBitrateOnTheElectedPair() {
        let entries = [
            transport(selecting: "CP1"),
            measuredPair("CP1", local: "L1", remote: "R1", rtt: 0.05, bitrate: 900_000),
            measuredPair("CP9", local: "L9", remote: "R9", nominated: false, state: "in-progress", rtt: 0.4, bitrate: 100_000)
        ]

        let stats = CallStats.reduce(entries: entries)

        XCTAssertEqual(stats.roundTripTimeMs, 50, accuracy: 0.001)
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 900_000)
    }

    func test_reduce_noElectedPair_readsTheSmallestPairIdCarryingTheMeasure() {
        let entries = [
            measuredPair("CP2", local: "L2", remote: "R2", nominated: false, state: "in-progress", rtt: 0.12),
            measuredPair("CP1", local: "L1", remote: "R1", nominated: false, state: "in-progress", rtt: 0.05, bitrate: 900_000)
        ]

        let stats = CallStats.reduce(entries: entries)

        XCTAssertNil(CallStats.selectedCandidatePair(in: entries))
        XCTAssertEqual(stats.roundTripTimeMs, 50, accuracy: 0.001)
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 900_000)
    }

    func test_reduce_electedPairWithAberrantRtt_readsZero() {
        let entries = [
            transport(selecting: "CP1"),
            measuredPair("CP1", local: "L1", remote: "R1", rtt: .nan, bitrate: -5)
        ]

        let stats = CallStats.reduce(entries: entries)

        XCTAssertEqual(stats.roundTripTimeMs, 0)
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 0)
    }

    func test_codableRoundTrip_neverPersistsTheRoute() throws {
        let stats = CallStats(roundTripTimeMs: 40, relayed: true)

        let decoded = try JSONDecoder().decode(CallStats.self, from: JSONEncoder().encode(stats))

        XCTAssertNil(decoded.relayed)
    }
}

@MainActor
final class CallQualityNetworkContextTests: XCTestCase {

    private func makeReading(relayed: Bool? = nil, profile: CallDataProfile? = nil) -> CallQualityReading {
        CallQualityReading(packetLossPercent: 1, roundTripTimeMs: 90, jitterMs: 4, audioKbps: 24, videoKbps: 0, relayed: relayed, profile: profile)
    }

    func test_derive_carriesRouteAndProfileFromTheCurrentSample() {
        let sample = CallQualitySample(
            stats: CallStats(roundTripTimeMs: 90, relayed: true),
            packetLossPercent: 1,
            at: Date(timeIntervalSince1970: 1),
            profile: .cellular
        )

        let reading = CallQualityReading.derive(current: sample, previous: nil)

        XCTAssertEqual(reading.relayed, true)
        XCTAssertEqual(reading.profile, .cellular)
    }

    func test_context_withoutRouteNorProfile_isNil() {
        XCTAssertNil(CallQualityNetworkContext.from(makeReading()))
        XCTAssertNil(CallQualityNetworkContext.from(nil))
    }

    func test_context_routeLabel_saysRelayOrDirect() {
        let relayed = CallQualityNetworkContext.from(makeReading(relayed: true))
        let direct = CallQualityNetworkContext.from(makeReading(relayed: false))

        XCTAssertNotNil(relayed?.routeLabel)
        XCTAssertNotNil(direct?.routeLabel)
        XCTAssertNotEqual(relayed?.routeLabel, direct?.routeLabel)
    }

    func test_viewModel_exposesTheActiveProfile() {
        let feed = MockCallQualityStatsFeed(initial: makeReading(relayed: false, profile: .dataSaver))
        let sut = CallQualityDetailViewModel(feed: feed, locale: Locale(identifier: "en_US"))

        sut.start()

        XCTAssertEqual(sut.network?.profile, .dataSaver)
        XCTAssertEqual(sut.network?.relayed, false)
    }

    func test_viewModel_liveTick_followsAProfileChange() {
        let feed = MockCallQualityStatsFeed(initial: makeReading(profile: .wifi))
        let sut = CallQualityDetailViewModel(feed: feed, locale: Locale(identifier: "en_US"))
        sut.start()

        feed.subject.send(makeReading(profile: .degraded))

        XCTAssertEqual(sut.network?.profile, .degraded)
    }
}

// MARK: - #20121 — l'élection ne dépend pas de l'ordre du relevé

/// `RTCStatisticsReport.statistics` est un dictionnaire : l'ordre de ses entrées
/// est celui du hachage. Un même relevé, lu dans n'importe quel ordre, élit la
/// même paire et en tire le même RTT, le même débit et la même route (miroir
/// Android `CallStatsElectionOrderTest`).
@MainActor
final class CallStatsElectionOrderTests: XCTestCase {

    private struct Reading: Hashable {
        let pairId: String?
        let rttMs: Double
        let bitrate: Int
        let relayed: Bool?
    }

    private func candidate(_ id: String, type: String, local: Bool = true) -> CallStats.RawEntry {
        CallStats.RawEntry(id: id, type: local ? "local-candidate" : "remote-candidate", strings: ["candidateType": type])
    }

    private func pair(_ id: String, local: String, remote: String, priority: Double? = nil, nominated: Bool = true,
                      state: String = "succeeded", rtt: Double? = nil, bitrate: Double? = nil) -> CallStats.RawEntry {
        let measures = ["priority": priority, "currentRoundTripTime": rtt, "availableOutgoingBitrate": bitrate].compactMapValues { $0 }
        return CallStats.RawEntry(
            id: id,
            type: "candidate-pair",
            values: measures.merging(["nominated": nominated ? 1 : 0]) { current, _ in current },
            strings: ["localCandidateId": local, "remoteCandidateId": remote, "state": state]
        )
    }

    private func transport(_ id: String, selecting pairId: String) -> CallStats.RawEntry {
        CallStats.RawEntry(id: id, type: "transport", strings: ["selectedCandidatePairId": pairId])
    }

    private func orders(_ entries: [CallStats.RawEntry]) -> [[CallStats.RawEntry]] {
        let rotations = { (list: [CallStats.RawEntry]) in list.indices.map { Array(list[$0...] + list[..<$0]) } }
        return rotations(entries) + rotations(Array(entries.reversed()))
    }

    private func readings(_ entries: [CallStats.RawEntry]) -> Set<Reading> {
        Set(orders(entries).map { order in
            let stats = CallStats.reduce(entries: order)
            return Reading(pairId: CallStats.selectedCandidatePair(in: order)?.id, rttMs: stats.roundTripTimeMs,
                           bitrate: stats.availableOutgoingBitrateBps, relayed: stats.relayed)
        })
    }

    func test_selectedCandidatePair_twoTransports_electsTheSmallestTransportIdInEveryOrder() {
        let report = [
            transport("T02", selecting: "CP1"),
            transport("T01", selecting: "CP2"),
            pair("CP1", local: "L1", remote: "R1", priority: 200, rtt: 0.05, bitrate: 2_000_000),
            pair("CP2", local: "L2", remote: "R2", priority: 100, bitrate: 800_000),
            pair("CP3", local: "L3", remote: "R3", priority: 50, nominated: false, state: "in-progress", rtt: 0.3),
            candidate("L1", type: "relay"), candidate("R1", type: "relay", local: false),
            candidate("L2", type: "host"), candidate("R2", type: "srflx", local: false)
        ]

        XCTAssertEqual(readings(report), [Reading(pairId: "CP2", rttMs: 50, bitrate: 800_000, relayed: false)])
    }

    func test_selectedCandidatePair_twoNominatedPairs_electsTheHighestPriorityInEveryOrder() {
        let report = [
            pair("CP1", local: "L1", remote: "R1", priority: 100, rtt: 0.2, bitrate: 300_000),
            pair("CP2", local: "L2", remote: "R2", priority: 300, rtt: 0.04, bitrate: 1_500_000),
            pair("CP3", local: "L3", remote: "R3", priority: 500, nominated: false, state: "in-progress", rtt: 0.9, bitrate: 50_000),
            candidate("L1", type: "relay"), candidate("R1", type: "srflx", local: false),
            candidate("L2", type: "host"), candidate("R2", type: "host", local: false)
        ]

        XCTAssertEqual(readings(report), [Reading(pairId: "CP2", rttMs: 40, bitrate: 1_500_000, relayed: false)])
    }

    func test_reduce_noElectedPair_readsTheMeasureOnTheHighestPriorityThenSmallestId() {
        let report = [
            pair("CP2", local: "L2", remote: "R2", nominated: false, state: "in-progress", rtt: 0.12, bitrate: 900_000),
            pair("CP1", local: "L1", remote: "R1", nominated: false, state: "in-progress", rtt: 0.05),
            pair("CP0", local: "L0", remote: "R0", priority: 10, nominated: false, state: "waiting")
        ]

        XCTAssertEqual(readings(report), [Reading(pairId: nil, rttMs: 50, bitrate: 900_000, relayed: nil)])
    }

    func test_selectedCandidatePair_equalPriority_electsTheSmallestId() {
        let report = [
            pair("CPb", local: "L2", remote: "R2", priority: 7, rtt: 0.08),
            pair("CPa", local: "L1", remote: "R1", priority: 7, rtt: 0.02)
        ]

        XCTAssertEqual(Set(orders(report).map { CallStats.selectedCandidatePair(in: $0)?.id }), ["CPa"])
    }

    func test_selectedCandidatePair_transportNamingAnAbsentPair_yieldsToTheNextTransport() {
        let report = [
            transport("T01", selecting: "ghost"),
            transport("T02", selecting: "CP2"),
            pair("CP1", local: "L1", remote: "R1", priority: 900, rtt: 0.3),
            pair("CP2", local: "L2", remote: "R2", priority: 1, nominated: false, state: "in-progress", rtt: 0.01)
        ]

        XCTAssertEqual(Set(orders(report).map { CallStats.selectedCandidatePair(in: $0)?.id }), ["CP2"])
    }

    func test_rawProjection_readsThePairPriority() {
        let entry = CallStats.RawEntry(id: "CP1", type: "candidate-pair", raw: ["priority": NSNumber(value: 4_611_686_018_427_387_904 as UInt64)])

        XCTAssertEqual(entry.values["priority"], 4_611_686_018_427_387_904)
    }
}
