import Foundation
import MeeshySDK

/// La demande d'un cran, partagée par « Mes cercles » et le profil (#13938, #13940) : elle part par la file durable
/// (`.sendFriendRequest` + `targetLevel`), attend la reconnexion hors ligne, et rend la main à l'appelant si la file y
/// renonce pour de bon (saut de phase, inéligibilité, cool-down) pour qu'il défasse son état optimiste.
@MainActor
struct CircleRaiseSender {
    let offlineQueue: OfflineQueueing

    func send(to userId: String, level: RelationLevel, onExhausted: @escaping @MainActor () -> Void) async throws {
        let cmid = ClientMutationId.generate()
        CircleOutboxWatch.exhaustion(of: cmid, in: offlineQueue, onExhausted: onExhausted)
        let payload = SendFriendRequestPayload(clientMutationId: cmid, targetUserId: userId, targetLevel: level.rawValue)
        try await offlineQueue.enqueue(.sendFriendRequest, payload: payload, conversationId: nil)
    }
}

/// La réponse à une proposition de cercle reçue, depuis la fiche (#19449) : la même file durable que « Mes cercles »
/// (`.respondFriendRequest`), et la même main rendue quand la file y renonce (le serveur a refusé).
@MainActor
struct CircleAnswerSender {
    let offlineQueue: OfflineQueueing

    func send(_ requestId: String, action: RespondFriendRequestPayload.Action,
              onExhausted: @escaping @MainActor () -> Void) async throws {
        let cmid = ClientMutationId.generate()
        CircleOutboxWatch.exhaustion(of: cmid, in: offlineQueue, onExhausted: onExhausted)
        let payload = RespondFriendRequestPayload(clientMutationId: cmid, friendRequestId: requestId, action: action)
        try await offlineQueue.enqueue(.respondFriendRequest, payload: payload, conversationId: nil)
    }
}

@MainActor
enum CircleOutboxWatch {
    static func exhaustion(of cmid: String, in queue: OfflineQueueing, onExhausted: @escaping @MainActor () -> Void) {
        Task { @MainActor in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                guard case .exhausted = event else { continue }
                onExhausted()
            }
        }
    }
}
