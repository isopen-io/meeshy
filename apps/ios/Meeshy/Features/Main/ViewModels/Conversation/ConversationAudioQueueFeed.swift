import Foundation
import Combine
import MeeshySDK

@MainActor
protocol ConversationAudioQueueHosting: AnyObject {
    var messages: [Message] { get }
    var conversationId: String { get }
    var audioQueueUserId: String? { get }
    var listenedAttachmentIds: Set<String> { get set }
    var audioCoordinator: ConversationAudioCoordinator { get }
    func queuedAudio(for attachment: MessageAttachment, message: Message) -> QueuedAudio
}

@MainActor
protocol ConversationAudioQueueFeeding {
    func followMessages(
        of host: any ConversationAudioQueueHosting,
        publishing messages: AnyPublisher<[Message], Never>
    ) -> AnyCancellable
    func followFinishedEvents(of host: any ConversationAudioQueueHosting) -> AnyCancellable
}

/// Ce que la conversation confie au lecteur partagé : les vocaux NOUVEAUX d'un autre auteur,
/// dans la conversation jouée, rejoignent la file ; chaque fin de lecture marque le vocal écouté.
/// Les abonnements se rangent dans les `cancellables` de l'hôte, qui n'est tenu que faiblement.
@MainActor
final class ConversationAudioQueueFeed: ConversationAudioQueueFeeding {
    nonisolated deinit {}

    private var tracker = AudioQueueAppendTracker()

    /// `$messages` tire à CHAQUE mutation (insertion, édition, réaction, traduction…) : seule la
    /// suite des identifiants change quand un message entre ou sort, d'où le dédoublonnage.
    func followMessages(
        of host: any ConversationAudioQueueHosting,
        publishing messages: AnyPublisher<[Message], Never>
    ) -> AnyCancellable {
        messages
            .map { $0.map(\.id) }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak host, weak self] _ in
                guard let host, let self else { return }
                self.appendArrivals(of: host.messages, to: host)
            }
    }

    /// Filtré par conversation : le coordinateur est un singleton de processus, et la file d'une
    /// autre conversation ne doit jamais polluer les vocaux écoutés de celle-ci.
    func followFinishedEvents(of host: any ConversationAudioQueueHosting) -> AnyCancellable {
        let ownConversationId = host.conversationId
        return host.audioCoordinator.attachmentFinishedPublisher
            .filter { event in event.conversationId == ownConversationId }
            .receive(on: DispatchQueue.main)
            .sink { [weak host] event in
                host?.listenedAttachmentIds.insert(event.attachmentId)
            }
    }

    private func appendArrivals(of snapshot: [Message], to host: any ConversationAudioQueueHosting) {
        let coordinator = host.audioCoordinator
        let arrivals = tracker.newAudios(
            in: snapshot,
            activeConversationId: coordinator.activeContext?.conversationId,
            conversationId: host.conversationId,
            currentUserId: host.audioQueueUserId,
            listenedAttachmentIds: host.listenedAttachmentIds
        )
        for (message, attachment) in arrivals {
            coordinator.appendUpcoming(host.queuedAudio(for: attachment, message: message))
        }
    }
}
