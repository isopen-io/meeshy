import Foundation
import Testing
@testable import MeeshySDK

/// #10500 — l'enveloppe v2 de `POST /social/events` : identité d'événement,
/// heure d'occurrence, contexte de lot, requête à part, sommeil après un 400.
@Suite("SocialEventsV2 — l'enveloppe et le fil")
struct SocialEventsV2EnvelopeTests {

    private static let epoch = Date(timeIntervalSince1970: 1_760_000_000)

    private func event(_ id: String = SocialEventV2.newEventId(), payload: SocialEventV2Payload = .interaction(SocialInteraction(action: .save))) -> SocialEventV2 {
        SocialEventV2(eventId: id, occurredAt: Self.epoch, target: SocialTarget(kind: .post, id: "65a1b2c3d4e5f6a7b8c9d0e1"), payload: payload)
    }

    private func json(_ data: Data) throws -> [String: Any] {
        try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func context() -> SocialEventContext {
        SocialEventContext(
            appSessionId: "sess-1", appVersion: "1.2.3", build: "1880",
            os: .init(name: "iOS", version: "18.4.1"), deviceClass: .phone,
            network: .init(type: .wifi), uiLanguage: "fr", deviceLocale: "en-US",
            consent: .granted, capabilities: [.screenshot, .scroll]
        )
    }

    @Test func event_carriesTypeActionEnvelopeAndFlatFields() throws {
        let data = try #require(try SocialEventsV2Wire.encode(event("e-1", payload: .interaction(SocialInteraction(action: .share, destination: .conversation)))))
        let body = try json(data)
        #expect(body["type"] as? String == "interaction")
        #expect(body["action"] as? String == "share")
        #expect(body["eventId"] as? String == "e-1")
        #expect(body["destination"] as? String == "conversation")
        #expect((body["occurredAt"] as? String)?.hasSuffix("Z") == true)
        #expect((body["target"] as? [String: Any])?["kind"] as? String == "post")
        #expect(body["postId"] == nil)
    }

    @Test func eventId_isPostedAtCreation_andUnique() {
        #expect(event().eventId != event().eventId)
        #expect(event().eventId.count == 36)
    }

    @Test func body_writesTheContextOnce_withoutNullKeys() throws {
        let events = try [event(), event()].map { try #require(try SocialEventsV2Wire.encode($0)) }
        let body = try json(try SocialEventsV2Wire.body(context: context().sent(at: Self.epoch), events: events))
        #expect(Set(body.keys) == ["context", "events"])
        let ctx = try #require(body["context"] as? [String: Any])
        #expect(ctx["schemaVersion"] as? Int == 2)
        #expect(ctx["platform"] as? String == "ios")
        #expect(ctx["sentAt"] is String)
        #expect((ctx["os"] as? [String: Any])?["version"] as? String == "18.4")
        let list = try #require(body["events"] as? [[String: Any]])
        #expect(list.count == 2)
        #expect(list.allSatisfy { $0["context"] == nil })
        #expect(!Self.containsNull(body))
    }

    @Test func context_forAVisitor_carriesNoSessionNorDeviceDetail() throws {
        let restricted = context().restricted(for: .visitor("visitor_x"))
        let ctx = try json(try JSONEncoder().encode(restricted))
        #expect(ctx["appSessionId"] == nil)
        #expect(ctx["deviceLocale"] == nil)
        #expect(ctx["os"] == nil)
        #expect(ctx["network"] == nil)
        #expect(ctx["appVersion"] == nil)
        #expect(ctx["uiLanguage"] as? String == "fr")
        #expect(ctx["platform"] as? String == "ios")
    }

    @Test func context_whenConsentIsDenied_isReducedEvenForAnAccount() throws {
        let denied = SocialEventContext(appSessionId: "s", os: .init(name: "iOS", version: "18.0"), uiLanguage: "fr", deviceLocale: "en", consent: .denied)
        let ctx = try json(try JSONEncoder().encode(denied.restricted(for: .account)))
        #expect(ctx["appSessionId"] == nil)
        #expect(ctx["deviceLocale"] == nil)
        #expect(ctx["consent"] as? String == "denied")
    }

    @Test func noFamily_hasAQueryUrlOrContentKey() throws {
        let forbidden: Set<String> = ["query", "url", "text", "content", "image", "ip", "token", "message", "deviceId"]
        let all: [SocialEventV2Payload] = [
            .interaction(SocialInteraction(action: .share, destination: .copyLink, dwellBeforeMs: 3, mutationId: "m")),
            .negative(SocialNegative(action: .reportSubmit, reasonCode: "spam", visibleMs: 2)),
            .playback(PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: 10, mutedAtStart: false).finish(atMs: 5, reason: .closed)),
            .link(SocialLinkEvent(action: .outboundClick, domain: "example.com", trackingLinkId: "t")),
            .discovery(SocialDiscovery(action: .searchSubmitted, searchId: "s", queryLength: 4, queryLanguage: "fr", resultCount: 2, resultKind: .post)),
            .story(SocialStoryEvent(action: .exitBeforeEnd, slideIndex: 1, slideCount: 3, elapsedMs: 400)),
            .notification(SocialNotificationEvent(action: .opened, notificationType: "message", channel: .apns, deliveryLatencyMs: 4)),
            .screenCapture(SocialScreenCapture(action: .recordingStopped, visibleTargets: [SocialVisibleTarget(kind: .post, id: "p", visibleFraction: 0.5)], recordingMs: 900)),
            .scrollContent(ScrollContentAccumulator(contentKind: .carousel, itemsTotal: 3, startedAtMs: 0).finishing(index: 2, atMs: 10)),
            .visibility(SocialVisibility(maxVisibleFraction: 0.7, visibleMs: 1200, viewable: true)),
        ]
        for payload in all {
            let data = try #require(try SocialEventsV2Wire.encode(event(payload: payload)))
            let keys = Self.keys(in: try JSONSerialization.jsonObject(with: data))
            #expect(keys.isDisjoint(with: forbidden), "\(payload.type) porte \(keys.intersection(forbidden))")
        }
    }

    @Test func receipt_decodesAnOldServer_andANewOne() throws {
        let old = try JSONDecoder().decode(APIResponse<SocialEventsV2Receipt>.self, from: Data(#"{"success":true,"data":{"recorded":1,"rejected":0}}"#.utf8))
        #expect(old.data == SocialEventsV2Receipt(recorded: 1, rejected: 0))
        #expect(old.data.accepts(type: "scroll"))
        let new = try JSONDecoder().decode(APIResponse<SocialEventsV2Receipt>.self, from: Data(#"{"success":true,"data":{"recorded":1,"rejected":0,"ignored":2,"accepts":["interaction"],"sampling":{"scroll":0.5}}}"#.utf8))
        #expect(new.data.ignored == 2)
        #expect(new.data.sampling?["scroll"] == 0.5)
        #expect(!new.data.accepts(type: "scroll"))
    }

    @Test func gate_sleepsAnHourAfterARefusal() {
        var gate = SocialEventsV2Gate()
        #expect(gate.isOpen(at: Self.epoch))
        gate.noteRefused(at: Self.epoch)
        #expect(!gate.isOpen(at: Self.epoch.addingTimeInterval(3_599)))
        #expect(gate.isOpen(at: Self.epoch.addingTimeInterval(3_600)))
    }

    @Test func outcome_of400_isUnsupported_of500_isTransient_of403_isRefused() {
        #expect(SocialEventsV2Dispatch.outcome(of: MeeshyError.server(statusCode: 400, message: "bad")) == .unsupported)
        #expect(SocialEventsV2Dispatch.outcome(of: MeeshyError.server(statusCode: 503, message: "down")) == .transient)
        #expect(SocialEventsV2Dispatch.outcome(of: MeeshyError.forbidden(reason: nil, body: nil)) == .refused)
    }

    @Test func appSession_isRenewedAfter30MinutesOfInactivity() {
        var clock = AppSessionClock()
        let first = clock.touch(at: Self.epoch)
        #expect(clock.touch(at: Self.epoch.addingTimeInterval(29 * 60)) == first)
        #expect(clock.touch(at: Self.epoch.addingTimeInterval(58 * 60)) == first)
        #expect(clock.touch(at: Self.epoch.addingTimeInterval(89 * 60)) != first)
    }

    @Test func sampling_isStablePerSession_andRespectsBounds() {
        #expect(SocialEventsSampling.keeps(type: "scroll", rate: 1, appSessionId: "a"))
        #expect(!SocialEventsSampling.keeps(type: "scroll", rate: 0, appSessionId: "a"))
        let verdict = SocialEventsSampling.keeps(type: "scroll", rate: 0.5, appSessionId: "abc")
        #expect((0..<5).allSatisfy { _ in SocialEventsSampling.keeps(type: "scroll", rate: 0.5, appSessionId: "abc") == verdict })
        let kept = (0..<2_000).filter { SocialEventsSampling.keeps(type: "scroll", rate: 0.25, appSessionId: "s\($0)") }.count
        #expect((350...650).contains(kept))
    }

    static func containsNull(_ value: Any) -> Bool {
        if value is NSNull { return true }
        if let dict = value as? [String: Any] { return dict.values.contains(where: containsNull) }
        if let list = value as? [Any] { return list.contains(where: containsNull) }
        return false
    }

    static func keys(in value: Any) -> Set<String> {
        if let dict = value as? [String: Any] {
            return dict.reduce(into: Set(dict.keys)) { $0.formUnion(keys(in: $1.value)) }
        }
        if let list = value as? [Any] { return list.reduce(into: Set<String>()) { $0.formUnion(keys(in: $1)) } }
        return []
    }
}

private extension ScrollContentAccumulator {
    func finishing(index: Int, atMs: Int) -> ScrollContentSummary {
        var copy = self
        copy.noteIndex(index)
        return copy.finish(atMs: atMs)!
    }
}

@Suite("SocialEventsV2 — la file durable et le refus d'un ancien serveur")
struct SocialEventsV2OutboxTests {

    private static let epoch = Date(timeIntervalSince1970: 1_760_000_000)

    private func event(_ id: String) -> SocialEventV2 {
        SocialEventV2(eventId: id, occurredAt: Self.epoch, target: SocialTarget(kind: .post, id: "p"), payload: .interaction(SocialInteraction(action: .save)))
    }

    private func eventIds(in payloads: [Data]) -> [String] {
        payloads.compactMap { (try? JSONSerialization.jsonObject(with: $0) as? [String: Any])?["eventId"] as? String }
    }

    @Test func eventId_isStable_afterANetworkFailureThenTheResend() async {
        let clock = SyncBox(Self.epoch)
        let outbox = SocialEventsV2Outbox(dbPath: nil, clock: { clock.value })
        await outbox.enqueue([event("e-1"), event("e-2")], owner: "u1")

        let first = SyncBox<[String]>([])
        let failed = await outbox.flush(owner: "u1") { payloads in
            first.mutate { $0 = self.eventIds(in: payloads) }
            return .transient
        }
        #expect(failed == .transient)

        clock.mutate { $0 = Self.epoch.addingTimeInterval(600) }
        let second = SyncBox<[String]>([])
        await outbox.flush(owner: "u1") { payloads in
            second.mutate { $0 = self.eventIds(in: payloads) }
            return .delivered(SocialEventsV2Receipt(recorded: 2, rejected: 0))
        }
        #expect(first.value == ["e-1", "e-2"])
        #expect(second.value == first.value)
        #expect(await outbox.pendingCount(owner: "u1") == 0)
    }

    @Test func transientFailures_followTheSocialEventsSchedule() async {
        let clock = SyncBox(Self.epoch)
        let outbox = SocialEventsV2Outbox(dbPath: nil, clock: { clock.value })
        await outbox.enqueue([event("e-1")], owner: "u1")
        await outbox.flush(owner: "u1") { _ in .transient }

        var elapsed: TimeInterval = 0
        for delay in [10.0, 20, 40, 80, 160, 300, 300] {
            elapsed += delay
            clock.mutate { $0 = Self.epoch.addingTimeInterval(elapsed - 1) }
            let early = await outbox.flush(owner: "u1") { _ in .transient }
            #expect(early == nil, "not ready 1 s before the \(delay) s step")
            clock.mutate { $0 = Self.epoch.addingTimeInterval(elapsed) }
            let due = await outbox.flush(owner: "u1") { _ in .transient }
            #expect(due == .transient, "ready once the \(delay) s step elapses")
        }
    }

    @Test func enqueue_twiceTheSameEventId_keepsOneRow() async {
        let outbox = SocialEventsV2Outbox(dbPath: nil, clock: { Self.epoch })
        await outbox.enqueue([event("e-1")], owner: "u1")
        await outbox.enqueue([event("e-1")], owner: "u1")
        #expect(await outbox.pendingEventIds(owner: "u1") == ["e-1"])
    }

    @Test func flush_neverSendsAnotherOwnersEvents() async {
        let outbox = SocialEventsV2Outbox(dbPath: nil, clock: { Self.epoch })
        await outbox.enqueue([event("a-1")], owner: "A")
        await outbox.enqueue([event("b-1")], owner: "B")
        let sent = SyncBox<[String]>([])
        await outbox.flush(owner: "B") { payloads in
            sent.mutate { $0 = self.eventIds(in: payloads) }
            return .delivered(SocialEventsV2Receipt(recorded: 1, rejected: 0))
        }
        #expect(sent.value == ["b-1"])
        #expect(await outbox.pendingEventIds(owner: "A") == ["a-1"])
    }

    @Test func anEventOlderThan72Hours_neverLeaves() async {
        let outbox = SocialEventsV2Outbox(dbPath: nil, clock: { Self.epoch.addingTimeInterval(73 * 3_600) })
        await outbox.enqueue([event("old")], owner: "u1")
        let outcome = await outbox.flush(owner: "u1") { _ in .delivered(SocialEventsV2Receipt(recorded: 1, rejected: 0)) }
        #expect(outcome == nil)
    }

    @Test func a400OnTheV2Request_dropsV2Events_andLeavesTheCountingQueueIntact() async throws {
        let v2 = SocialEventsV2Outbox(dbPath: nil, clock: { Self.epoch })
        let counting = EngagementOutbox(dbPath: FileManager.default.temporaryDirectory.appendingPathComponent("eng-\(UUID().uuidString).db").path)
        let session = EngagementSession(
            sessionId: "s1", userId: "u1", postId: "p1", contentType: .post, surface: .detail,
            startedAt: Self.epoch, dwellMs: 4000, watchMs: nil, mediaDurationMs: nil, completed: false,
            truncated: false, consent: "granted", actions: [], watchSamples: []
        )
        await counting.beginSession(session)
        await counting.finalizeSession(session)
        await v2.enqueue([event("e-1")], owner: "u1")

        let api = MockAPIClient()
        api.stubError("/social/events", error: MeeshyError.server(statusCode: 400, message: "Invalid discriminator value"))
        let service = PostService(api: api)
        let context = SocialEventContext(appSessionId: "s", uiLanguage: "fr")
        let outcome = await v2.flush(owner: "u1") { payloads in
            await SocialEventsV2Dispatch.deliver(payloads, context: context, credential: .account, sentAt: Self.epoch, through: service)
        }

        #expect(outcome == .unsupported)
        #expect(await v2.pendingCount(owner: "u1") == 0)
        let dwells = SyncBox<[String]>([])
        await counting.flush { sessions in
            dwells.mutate { $0 = sessions.map(\.sessionId) }
            return .completed
        }
        #expect(dwells.value == ["s1"])
    }

    @Test func theV2Request_carriesOnlyV2Types() async throws {
        let api = MockAPIClient()
        let receipt = try JSONDecoder().decode(APIResponse<SocialEventsV2Receipt>.self, from: Data(#"{"success":true,"data":{"recorded":1,"rejected":0}}"#.utf8))
        api.stub("/social/events", result: receipt)
        let payloads = try [event("e-1")].map { try #require(try SocialEventsV2Wire.encode($0)) }
        let outcome = await SocialEventsV2Dispatch.deliver(payloads, context: SocialEventContext(appSessionId: "s"), credential: .visitor("visitor_v"), sentAt: Self.epoch, through: PostService(api: api))

        #expect(outcome == .delivered(SocialEventsV2Receipt(recorded: 1, rejected: 0)))
        let request = try #require(api.lastRequest)
        #expect(request.endpoint == "/social/events")
        #expect(request.headers == ["X-Session-Token": "visitor_v"])
        let types = (request.bodyJSON?["events"] as? [[String: Any]])?.compactMap { $0["type"] as? String } ?? []
        #expect(types == ["interaction"])
        #expect(Set(types).isDisjoint(with: ["view", "impression", "dwell", "open", "download"]))
        #expect((request.bodyJSON?["context"] as? [String: Any])?["appSessionId"] == nil)
    }
}
