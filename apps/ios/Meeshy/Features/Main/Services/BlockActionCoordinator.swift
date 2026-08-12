import Foundation
import MeeshySDK
import MeeshyUI

/// R6-4 — orchestration app-side du block/unblock durable pour les call sites
/// qui sont des `View` struct (ConversationListView swipe/dialog, +Overlays,
/// ConversationView), lesquels ne peuvent pas héberger le pattern
/// optimistic+outbox+observeOutcome sans le dupliquer inline.
///
/// Encapsule le pattern EXACT de `UserProfileViewModel.blockUser` :
/// 1. flip optimiste de la blocklist canonique (`BlockService.setBlockedOptimistic`,
///    lue par les swipe labels) ;
/// 2. `OfflineQueue.enqueue(.blockUser/.unblockUser)` durable (survit offline + kill) ;
/// 3. `observeOutcome` → rollback du flip optimiste sur `.exhausted` + toast ;
/// 4. rollback synchrone si l'enqueue lui-même échoue.
///
/// SDK purity : ce coordinateur VIT app-side (il orchestre des services SDK pour
/// exprimer une décision UX Meeshy) — le SDK reste paramétrique
/// (`setBlockedOptimistic` + `enqueue` sont des building blocks agnostiques).
@MainActor
final class BlockActionCoordinator {
    static let shared = BlockActionCoordinator()

    private let blockService: BlockServiceProviding
    private let offlineQueue: OfflineQueueing

    init(
        blockService: BlockServiceProviding = BlockService.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) {
        self.blockService = blockService
        self.offlineQueue = offlineQueue
    }

    func block(userId: String) async {
        await mutate(
            userId: userId,
            blocked: true,
            kind: .blockUser,
            makePayload: { BlockUserPayload(clientMutationId: $0, targetUserId: userId) },
            failureToast: "Impossible de bloquer cet utilisateur"
        )
    }

    func unblock(userId: String) async {
        await mutate(
            userId: userId,
            blocked: false,
            kind: .unblockUser,
            makePayload: { UnblockUserPayload(clientMutationId: $0, targetUserId: userId) },
            failureToast: "Impossible de debloquer cet utilisateur"
        )
    }

    private func mutate<P: Codable & Sendable>(
        userId: String,
        blocked: Bool,
        kind: OutboxKind,
        makePayload: (String) -> P,
        failureToast: String
    ) async {
        let cmid = ClientMutationId.generate()
        let wasBlocked = blockService.isBlocked(userId: userId)
        blockService.setBlockedOptimistic(userId: userId, blocked: blocked)
        observeOutcome(cmid: cmid, userId: userId, restoreTo: wasBlocked, toast: failureToast)
        do {
            _ = try await offlineQueue.enqueue(kind, payload: makePayload(cmid), conversationId: nil)
        } catch {
            blockService.setBlockedOptimistic(userId: userId, blocked: wasBlocked)
            FeedbackToastManager.shared.showError(failureToast)
            HapticFeedback.error()
        }
    }

    private func observeOutcome(cmid: String, userId: String, restoreTo: Bool, toast: String) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let stream = await self.offlineQueue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    self.blockService.setBlockedOptimistic(userId: userId, blocked: restoreTo)
                    FeedbackToastManager.shared.showError(toast)
                    HapticFeedback.error()
                }
            }
        }
    }
}
