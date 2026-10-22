import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
private final class StubAudioQueueHost: ConversationAudioQueueHosting {
    var messages: [Message] = []
    let conversationId = "conv-1"
    var audioQueueUserId: String? = "me"
    var listenedAttachmentIds: Set<String> = []
    let audioCoordinator: ConversationAudioCoordinator

    init(coordinator: ConversationAudioCoordinator) { audioCoordinator = coordinator }

    func queuedAudio(for attachment: MessageAttachment, message: Message) -> QueuedAudio {
        QueuedAudio(
            attachmentId: attachment.id, messageId: message.id, conversationId: message.conversationId,
            fileUrl: "https://cdn.example/\(attachment.id).m4a", durationMs: 1_000, senderName: "Alice",
            senderAvatarURL: nil, receivedAt: message.createdAt
        )
    }
}

@MainActor
final class ConversationAudioQueueFeedTests: XCTestCase {

    private struct Fixture {
        let feed: ConversationAudioQueueFeed
        let host: StubAudioQueueHost
        let coordinator: ConversationAudioCoordinator
        let engine: MockAudioPlaybackEngine
        let emissions: PassthroughSubject<[Message], Never>
        let subscription: AnyCancellable
    }

    private func makeSUT() -> Fixture {
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        let host = StubAudioQueueHost(coordinator: coordinator)
        let feed = ConversationAudioQueueFeed()
        let emissions = PassthroughSubject<[Message], Never>()
        let subscription = feed.followMessages(of: host, publishing: emissions.eraseToAnyPublisher())
        return Fixture(feed: feed, host: host, coordinator: coordinator, engine: engine, emissions: emissions, subscription: subscription)
    }

    private func audioMessage(
        _ id: String, senderId: String = "alice", conversationId: String = "conv-1", attachmentId: String? = nil
    ) -> Message {
        let attachment = MeeshyMessageAttachment(
            id: attachmentId ?? "att-\(id)", mimeType: "audio/mp4", fileUrl: "https://cdn.example/\(id).m4a", duration: 1_000
        )
        return Message(
            id: id, conversationId: conversationId, senderId: senderId, content: "", messageType: .audio,
            createdAt: Date(timeIntervalSince1970: 1_000), attachments: [attachment], senderName: "Alice"
        )
    }

    private func queued(_ message: Message) -> QueuedAudio {
        QueuedAudio(
            attachmentId: message.attachments[0].id, messageId: message.id, conversationId: message.conversationId,
            fileUrl: "https://cdn.example/\(message.id).m4a", durationMs: 1_000, senderName: "Alice",
            senderAvatarURL: nil, receivedAt: message.createdAt
        )
    }

    private func emit(_ messages: [Message], on fx: Fixture) async {
        fx.host.messages = messages
        fx.emissions.send(messages)
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
    }

    private func startPlaying(_ head: Message, on fx: Fixture) {
        fx.coordinator.play(current: queued(head), tail: [], conversationName: "Conv", conversationArtworkURL: nil)
    }

    /// Le coordinateur publie l'événement depuis une `Task` MainActor : on attend SON arrivée, par
    /// un second abonné posé après celui du flux, donc servi après lui sur la file principale.
    private func awaitFinishedEvent(on fx: Fixture, trigger: () -> Void) async {
        let arrived = expectation(description: "attachmentFinished")
        let probe = fx.coordinator.attachmentFinishedPublisher
            .receive(on: DispatchQueue.main)
            .sink { _ in arrived.fulfill() }
        trigger()
        await fulfillment(of: [arrived], timeout: 2)
        probe.cancel()
    }

    func test_firstEmission_seedsBaseline_appendsNothing() async {
        let fx = makeSUT()
        let head = audioMessage("m1")
        startPlaying(head, on: fx)

        await emit([head, audioMessage("m2")], on: fx)

        XCTAssertEqual(fx.coordinator.queueCount, 1, "le premier tirage ne fait que poser la référence")
    }

    func test_newForeignAudioInActiveConversation_appendsUpcoming() async {
        let fx = makeSUT()
        let head = audioMessage("m1")
        await emit([head], on: fx)
        startPlaying(head, on: fx)

        await emit([head, audioMessage("m2")], on: fx)

        XCTAssertEqual(fx.coordinator.queueCount, 2)
    }

    func test_ownMessage_orListened_isSkipped() async {
        let fx = makeSUT()
        let head = audioMessage("m1")
        await emit([head], on: fx)
        startPlaying(head, on: fx)
        fx.host.listenedAttachmentIds = ["att-heard"]

        await emit([head, audioMessage("own", senderId: "me"), audioMessage("heard", attachmentId: "att-heard")], on: fx)

        XCTAssertEqual(fx.coordinator.queueCount, 1)
    }

    func test_audioOfAnotherConversation_isNotAppended() async {
        let fx = makeSUT()
        let head = audioMessage("m1")
        await emit([head], on: fx)
        startPlaying(head, on: fx)

        await emit([head, audioMessage("far", conversationId: "conv-2")], on: fx)

        XCTAssertEqual(fx.coordinator.queueCount, 1)
    }

    func test_finishedEventOfOwnConversation_marksTheAttachmentListened() async {
        let fx = makeSUT()
        let head = audioMessage("m1")
        let finished = fx.feed.followFinishedEvents(of: fx.host)
        startPlaying(head, on: fx)

        await awaitFinishedEvent(on: fx) { fx.engine.simulateFinishPlayback() }

        XCTAssertTrue(fx.host.listenedAttachmentIds.contains("att-m1"))
        finished.cancel()
    }

    func test_finishedEventOfOtherConversation_isIgnored() async {
        let fx = makeSUT()
        let foreign = audioMessage("far", conversationId: "conv-2")
        let finished = fx.feed.followFinishedEvents(of: fx.host)
        startPlaying(foreign, on: fx)

        await awaitFinishedEvent(on: fx) { fx.engine.simulateFinishPlayback() }

        XCTAssertTrue(fx.host.listenedAttachmentIds.isEmpty)
        finished.cancel()
    }

    func test_feed_doesNotRetainHost() async {
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        let feed = ConversationAudioQueueFeed()
        let emissions = PassthroughSubject<[Message], Never>()
        var host: StubAudioQueueHost? = StubAudioQueueHost(coordinator: coordinator)
        weak var weakHost: StubAudioQueueHost?
        weakHost = host
        let subscriptions = [
            feed.followMessages(of: host!, publishing: emissions.eraseToAnyPublisher()),
            feed.followFinishedEvents(of: host!)
        ]

        host = nil

        XCTAssertNil(weakHost, "les abonnements rangés dans les cancellables ne retiennent pas le modèle de vue")
        XCTAssertEqual(subscriptions.count, 2)
    }
}
