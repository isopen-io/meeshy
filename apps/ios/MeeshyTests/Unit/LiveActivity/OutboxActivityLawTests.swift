import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un envoi long se suit dans la Dynamic Island, et l'activité se ferme sur
/// son issue** (#9680).
@MainActor
final class OutboxActivityLawTests: XCTestCase {

    private let wording = OutboxActivityLaw.Wording(
        label: { "label.\($0.id)" },
        sent: "Envoyé",
        failed: "Échec de l'envoi"
    )

    private func item(
        _ id: String,
        kind: OutboxUIItem.Kind = .message,
        icon: OutboxUIItem.IconKind = .image,
        attachments: Int = 1,
        status: OutboxStatus = .inflight
    ) -> OutboxUIItem {
        OutboxUIItem(
            id: id,
            kind: kind,
            titlePreview: nil,
            iconKind: icon,
            attachmentCount: attachments,
            source: .unknown,
            status: status,
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }

    private func step(
        _ running: OutboxActivityLaw.Running?,
        _ items: [OutboxUIItem],
        offline: Bool = false
    ) -> OutboxActivityLaw.Step {
        OutboxActivityLaw.step(running: running, items: items, isOffline: offline, wording: wording)
    }

    func test_isLong_onlyForWhatUploads() {
        XCTAssertTrue(OutboxActivityLaw.isLong(item("a", icon: .image)))
        XCTAssertTrue(OutboxActivityLaw.isLong(item("b", icon: .audio, attachments: 0)),
                      "un vocal porte son fichier local, pas encore d'attachement")
        XCTAssertTrue(OutboxActivityLaw.isLong(item("c", icon: .text, attachments: 2)),
                      "un texte accompagné de médias téléverse")
        XCTAssertTrue(OutboxActivityLaw.isLong(item("d", kind: .story, attachments: 0)))
        XCTAssertTrue(OutboxActivityLaw.isLong(item("e", kind: .other("createReel"), icon: .video, attachments: 1)))

        XCTAssertFalse(OutboxActivityLaw.isLong(item("f", icon: .text, attachments: 0)), "un texte seul est bref")
        XCTAssertFalse(OutboxActivityLaw.isLong(item("g", kind: .other("createPost"), icon: .text, attachments: 0)))
        XCTAssertFalse(OutboxActivityLaw.isLong(item("h", kind: .reaction, icon: .reaction, attachments: 0)))
        XCTAssertFalse(OutboxActivityLaw.isLong(item("i", kind: .other("markAsRead"), icon: .none, attachments: 0)))
    }

    func test_aShortQueue_neverOpensTheIsland() {
        let result = step(nil, [item("t", icon: .text, attachments: 0)])
        XCTAssertNil(result.running)
        XCTAssertEqual(result.action, .none)
    }

    func test_aLongSend_opensTheActivityWithItsLabelAndCount() {
        let result = step(nil, [item("a"), item("b", icon: .video), item("t", icon: .text, attachments: 0)])

        let expected = OutboxActivitySnapshot(phase: .sending, remaining: 2, label: "label.a", symbol: "photo.fill")
        XCTAssertEqual(result.action, .start(expected))
        XCTAssertEqual(result.running?.trackedIds, ["a", "b"])
    }

    func test_theQueueMoving_updatesOnlyWhenWhatIsShownChanges() {
        let opened = step(nil, [item("a"), item("b")])
        let same = step(opened.running, [item("a"), item("b")])
        XCTAssertEqual(same.action, .none, "une émission identique de la file ne réveille pas l'activité")

        let moved = step(opened.running, [item("b", icon: .video)])
        XCTAssertEqual(moved.action, .update(
            OutboxActivitySnapshot(phase: .sending, remaining: 1, label: "label.b", symbol: "play.rectangle.fill")
        ))
    }

    func test_goingOffline_keepsTheActivityAndSaysItWaits() {
        let opened = step(nil, [item("a", status: .pending)])
        let offline = step(opened.running, [item("a", status: .pending)], offline: true)
        XCTAssertEqual(offline.action, .update(
            OutboxActivitySnapshot(phase: .waitingForNetwork, remaining: 1, label: "label.a", symbol: "photo.fill")
        ))
    }

    func test_theQueueEmptying_endsOnSuccess() {
        let opened = step(nil, [item("a")])
        let done = step(opened.running, [])
        XCTAssertNil(done.running)
        XCTAssertEqual(done.action, .end(
            OutboxActivitySnapshot(phase: .sent, remaining: 0, label: "Envoyé", symbol: "checkmark.circle.fill")
        ))
    }

    func test_aTrackedSendThatFails_endsOnFailure_evenAfterItLeavesTheQueue() {
        let opened = step(nil, [item("a"), item("b")])
        let oneFailed = step(opened.running, [item("a", status: .exhausted), item("b")])
        XCTAssertEqual(oneFailed.running?.failedIds, ["a"])

        let done = step(oneFailed.running, [])
        XCTAssertEqual(done.action, .end(
            OutboxActivitySnapshot(phase: .failed, remaining: 0, label: "Échec de l'envoi", symbol: "exclamationmark.circle.fill")
        ))
    }

    func test_anOldFailureItNeverTracked_doesNotSpoilASuccess() {
        let opened = step(nil, [item("old", status: .exhausted), item("a")])
        let done = step(opened.running, [item("old", status: .exhausted)])
        XCTAssertEqual(done.action, .end(
            OutboxActivitySnapshot(phase: .sent, remaining: 0, label: "Envoyé", symbol: "checkmark.circle.fill")
        ))
    }

    func test_dismissal_isShort() {
        XCTAssertLessThanOrEqual(OutboxActivityLaw.dismissalDelay(for: .sent), 5)
        XCTAssertLessThanOrEqual(OutboxActivityLaw.dismissalDelay(for: .failed), 15)
    }
}
