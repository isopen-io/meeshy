import XCTest
@testable import Meeshy
import MeeshySDK

/// **Une photo reçue par push, app suspendue, rejoint l'album au réveil** (#8358).
@MainActor
final class PushedMediaAutoSaveQueueTests: XCTestCase {

    private func defaults() -> UserDefaults {
        let name = "PushedMediaAutoSaveQueueTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func photoMessage(_ id: String, conversationId: String = "c1") -> Message {
        let photo = MessageAttachment(id: "att-\(id)", messageId: id, fileName: "p.jpg", mimeType: "image/jpeg",
                                      fileUrl: "https://staging.meeshy.me/\(id).jpg")
        return Message(id: id, conversationId: conversationId, senderId: "autre", content: "",
                       attachments: [photo], isMe: false)
    }

    private func makeSUT(defaults: UserDefaults, cache: [String: [Message]])
        -> (sut: PushedMediaAutoSaveQueue, saver: SpyAutoSaver) {
        let saver = SpyAutoSaver()
        let sut = PushedMediaAutoSaveQueue(defaults: defaults, saver: saver) { cache[$0] ?? [] }
        return (sut, saver)
    }

    func test_drain_afterPush_considersThePushedMessage_only() async {
        let (sut, saver) = makeSUT(defaults: defaults(),
                                   cache: ["c1": [photoMessage("m0"), photoMessage("m1")]])

        sut.notePush(conversationId: "c1", messageId: "m1")
        await sut.drain()

        XCTAssertEqual(saver.considered.flatMap { $0.map(\.id) }, ["m1"])
    }

    func test_drain_pushWithoutMessageId_considersTheWholeWindow_likeOpening() async {
        let (sut, saver) = makeSUT(defaults: defaults(),
                                   cache: ["c1": [photoMessage("m0"), photoMessage("m1")]])

        sut.notePush(conversationId: "c1", messageId: nil)
        await sut.drain()

        XCTAssertEqual(saver.considered.flatMap { $0.map(\.id) }, ["m0", "m1"])
    }

    func test_drain_twice_considersNothingTheSecondTime() async {
        let (sut, saver) = makeSUT(defaults: defaults(), cache: ["c1": [photoMessage("m1")]])

        sut.notePush(conversationId: "c1", messageId: "m1")
        await sut.drain()
        await sut.drain()

        XCTAssertEqual(saver.considered.count, 1)
    }

    func test_notePush_withoutDrain_considersNothing_noDownloadInTheSilentTask() {
        let (sut, saver) = makeSUT(defaults: defaults(), cache: ["c1": [photoMessage("m1")]])

        sut.notePush(conversationId: "c1", messageId: "m1")

        XCTAssertTrue(saver.considered.isEmpty)
    }

    func test_drain_survivesAKill_theNoteIsPersisted() async {
        let store = defaults()
        let (first, _) = makeSUT(defaults: store, cache: [:])
        first.notePush(conversationId: "c1", messageId: "m1")

        let (relaunched, saver) = makeSUT(defaults: store, cache: ["c1": [photoMessage("m1")]])
        await relaunched.drain()

        XCTAssertEqual(saver.considered.flatMap { $0.map(\.id) }, ["m1"])
    }

    func test_notePush_emptyConversation_isIgnored() async {
        let (sut, saver) = makeSUT(defaults: defaults(), cache: ["": [photoMessage("m1")]])

        sut.notePush(conversationId: "", messageId: "m1")
        await sut.drain()

        XCTAssertTrue(saver.considered.isEmpty)
    }

    /// Le câblage : le push NOTE, le premier plan VIDE.
    func test_wiring_pushNotes_andForegroundDrains() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy")
        let delegate = try String(contentsOf: root.appendingPathComponent("AppDelegate.swift"), encoding: .utf8)
        XCTAssertEqual(delegate.components(separatedBy: "PushedMediaAutoSaveQueue.shared.notePush(").count - 1, 2,
                       "le push silencieux ET la bannière au premier plan notent la conversation")
        let transition = try String(contentsOf: root.appendingPathComponent(
            "Features/Main/Services/BackgroundTransitionCoordinator.swift"), encoding: .utf8)
        XCTAssertTrue(transition.contains("PushedMediaAutoSaveQueue.shared.drain()"),
                      "le retour au premier plan vide la note")
    }
}

@MainActor
final class SpyAutoSaver: ReceivedMediaAutoSaving {
    nonisolated deinit {}
    private(set) var considered: [[Message]] = []
    func consider(_ messages: [Message]) { considered.append(messages) }
}
