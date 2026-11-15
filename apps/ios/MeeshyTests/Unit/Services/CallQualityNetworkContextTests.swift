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
