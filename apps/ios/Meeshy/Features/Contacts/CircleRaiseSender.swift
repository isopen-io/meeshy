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
        observe(cmid: cmid, onExhausted: onExhausted)
        let payload = SendFriendRequestPayload(clientMutationId: cmid, targetUserId: userId, targetLevel: level.rawValue)
        try await offlineQueue.enqueue(.sendFriendRequest, payload: payload, conversationId: nil)
    }

    private func observe(cmid: String, onExhausted: @escaping @MainActor () -> Void) {
        let queue = offlineQueue
        Task { @MainActor in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                guard case .exhausted = event else { continue }
                onExhausted()
            }
        }
    }
}
