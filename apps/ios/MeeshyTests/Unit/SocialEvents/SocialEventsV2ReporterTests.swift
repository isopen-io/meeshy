import XCTest
import MeeshySDK
@testable import Meeshy

/// #10500 — la file v2 de l'app : requête à part, contexte une fois, sommeil
/// après un 400, types d'un visiteur, échantillonnage servi.
@MainActor
final class SocialEventsV2ReporterTests: XCTestCase {

    @MainActor
    private final class StubContext: SocialEventContextProviding {
        nonisolated deinit {}
        func appSessionId(at now: Date) -> String { "sess-1" }
        func context(at now: Date, sampling: [String: Double]) -> SocialEventContext {
            SocialEventContext(appSessionId: "sess-1", uiLanguage: "fr", consent: .granted, sampling: sampling.isEmpty ? nil : sampling)
        }
    }

    @MainActor
    private final class AnalyticsToggle {
        nonisolated deinit {}
        var isOn = true
    }

    /// Hors isolation : l'horloge de la file (`SocialEventsV2Outbox.clock`) est
    /// une fermeture `@Sendable`, qui ne peut pas lire un membre du MainActor.
    nonisolated private static let epoch = Date(timeIntervalSince1970: 1_760_000_000)

    private func makeReporter(
        service: MockPostService,
        identity: SocialEventsV2Identity? = SocialEventsV2Identity(owner: "u1", credential: .account),
        inbox: SocialNotificationInbox = SocialNotificationInbox(fileURL: nil)
    ) -> SocialEventsV2Reporter {
        SocialEventsV2Reporter(
            outbox: SocialEventsV2Outbox(dbPath: nil, clock: { Self.epoch }),
            postService: service,
            contextProvider: StubContext(),
            identity: { identity },
            now: { Self.epoch },
            flushInterval: .seconds(3_600),
            inbox: inbox,
            observesLifecycle: false
        )
    }

    private func save(_ id: String = "p1") -> SocialEventV2 {
        SocialEventV2(occurredAt: Self.epoch, target: SocialTarget(kind: .post, id: id), payload: .interaction(SocialInteraction(action: .save)))
    }

    private func scroll() -> SocialEventV2 {
        var session = ScrollListingSession(listingSessionId: "L", startedAtMs: 0)
        let summary = session.finish(atMs: 1_000)!
        return SocialEventV2(occurredAt: Self.epoch, target: SocialTarget(kind: .post, id: "p1"), payload: .scrollListing(summary))
    }

    func test_emitThenFlush_sendsOneV2Request_withTheContextOnce() async {
        let service = MockPostService()
        let reporter = makeReporter(service: service)

        reporter.emit(save("p1"))
        reporter.emit(save("p2"))
        await reporter.flushNow()

        XCTAssertEqual(service.recordedSocialEventsV2Bodies.count, 1)
        XCTAssertEqual(service.recordedSocialEventsV2Types, ["interaction", "interaction"])
        XCTAssertTrue(service.recordedSocialEventBatches.isEmpty, "aucun comptage ne part avec la v2")
        let context = service.recordedSocialEventsV2Bodies.first?["context"] as? [String: Any]
        XCTAssertEqual(context?["appSessionId"] as? String, "sess-1")
        XCTAssertEqual(context?["schemaVersion"] as? Int, 2)
    }

    /// #10507 — l'extension de notification dépose « reçue » dans la boîte du
    /// groupe d'app, sans réseau ; l'app la vide au premier lot.
    func test_theNotificationExtensionInbox_isDrainedIntoTheFirstBatch() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("inbox-\(UUID().uuidString).jsonl")
        let inbox = SocialNotificationInbox(fileURL: file)
        let received = try XCTUnwrap(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "n1", "type": "post_like", "postId": "p9"], at: Self.epoch))
        inbox.append(received)
        let service = MockPostService()
        let reporter = makeReporter(service: service, inbox: inbox)

        await reporter.flushNow()

        XCTAssertEqual(service.recordedSocialEventsV2Types, ["notification"])
        let event = (service.recordedSocialEventsV2Bodies.first?["events"] as? [[String: Any]])?.first
        XCTAssertEqual(event?["eventId"] as? String, received.eventId)
        XCTAssertTrue(inbox.drain().isEmpty, "la boîte est vide après le lot")
    }

    func test_a400_dropsTheV2Queue_andSleeps() async {
        let service = MockPostService()
        service.recordSocialEventsV2Result = .failure(MeeshyError.server(statusCode: 400, message: "Invalid discriminator value"))
        let reporter = makeReporter(service: service)

        reporter.emit(save())
        await reporter.flushNow()
        XCTAssertFalse(reporter.gate.isOpen(at: Self.epoch))

        service.recordSocialEventsV2Result = .success(SocialEventsV2Receipt(recorded: 1, rejected: 0))
        reporter.emit(save("p2"))
        await reporter.flushNow()
        XCTAssertEqual(service.recordedSocialEventsV2Bodies.count, 1, "la file dort : rien ne repart avant une heure")
    }

    func test_aVisitor_neverSendsAnInteraction_butSendsAScroll() async {
        let service = MockPostService()
        let reporter = makeReporter(service: service, identity: SocialEventsV2Identity(owner: "visitor:abc", credential: .visitor("visitor_k")))

        reporter.emit(save())
        reporter.emit(scroll())
        await reporter.flushNow()

        XCTAssertEqual(service.recordedSocialEventsV2Types, ["scroll"])
        let context = service.recordedSocialEventsV2Bodies.first?["context"] as? [String: Any]
        XCTAssertNil(context?["appSessionId"], "un visiteur ne porte aucun identifiant de session")
    }

    func test_aServedSamplingOfZero_dropsTheNextScroll_butNeverAnInteraction() async {
        let service = MockPostService()
        service.recordSocialEventsV2Result = .success(SocialEventsV2Receipt(recorded: 1, rejected: 0, sampling: ["scroll": 0]))
        let reporter = makeReporter(service: service)

        reporter.emit(save())
        await reporter.flushNow()
        reporter.emit(scroll())
        reporter.emit(save("p2"))
        await reporter.flushNow()

        XCTAssertEqual(service.recordedSocialEventsV2Types, ["interaction", "interaction"])
    }

    // MARK: - Consentement déclaré (#10499) : vie privée d'abord, seul le serveur accorde

    func test_consent_toggleOff_isDenied_evenWithAServerGrant() {
        XCTAssertEqual(AnalyticsConsentStanding.consent(allowAnalytics: false, serverGranted: false), .denied)
        XCTAssertEqual(AnalyticsConsentStanding.consent(allowAnalytics: false, serverGranted: true), .denied)
    }

    func test_consent_toggleOn_withoutServerConfirmation_isUnknown() {
        XCTAssertEqual(AnalyticsConsentStanding.consent(allowAnalytics: true, serverGranted: false), .unknown)
    }

    func test_consent_toggleOn_withServerConfirmation_isGranted() {
        XCTAssertEqual(AnalyticsConsentStanding.consent(allowAnalytics: true, serverGranted: true), .granted)
    }

    // MARK: - Le lot de COMPTAGE déclare le même consentement (#10552)

    func test_installOnCountingBatches_toggleOffWithAServerGrant_sourceDeclaresDenied() async {
        let source = SocialEventsConsentSource()

        AnalyticsConsentStanding.installOnCountingBatches(source) {
            AnalyticsConsentStanding.consent(allowAnalytics: false, serverGranted: true)
        }

        let declared = await source.current()
        XCTAssertEqual(declared, .denied)
    }

    func test_installOnCountingBatches_standingChanges_nextBatchReadsTheNewOne() async {
        let source = SocialEventsConsentSource()
        let toggle = AnalyticsToggle()
        AnalyticsConsentStanding.installOnCountingBatches(source) {
            AnalyticsConsentStanding.consent(allowAnalytics: toggle.isOn, serverGranted: true)
        }
        let before = await source.current()

        toggle.isOn = false
        let after = await source.current()

        XCTAssertEqual(before, .granted)
        XCTAssertEqual(after, .denied)
    }

    /// Le câblage : l'app hôte a installé la règle sur la source que
    /// `PostService.shared` lit. Sans lui, la règle existerait sans s'appliquer.
    func test_appLaunch_countingConsentSource_declaresTheLiveStanding() async {
        let declared = await SocialEventsConsentSource.shared.current()
        XCTAssertEqual(declared, AnalyticsConsentStanding.live())
    }
}
