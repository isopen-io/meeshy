import Foundation
import MeeshySDK
import os

/// Les trois effets que la reprise demande à l'hôte : retirer la bulle d'un
/// refus fermant le composeur, tenir la bulle d'un mode lent, et poser le
/// `tempId → serverId` que `message:new` réconcilie.
struct SendRecoveryHooks {
    let withdraw: (String, ConversationWriteRestriction) async -> Void
    let holdSlowMode: (String, NewcomerSlowMode, any Error) async -> Void
    let registerServerId: (String, String) -> Void
}

protocol SendFailureRecoveryProviding {
    func recover(
        from error: any Error,
        outgoing: OutgoingMessage,
        payload: SealedOutgoingPayload,
        context: SendAttemptContext,
        fallbackEligible: Bool,
        coordinator: any ConversationSendCoordinatorProviding,
        hooks: SendRecoveryHooks
    ) async -> Result<SentMessageReceipt, SendFailure>
}

/// Un échec d'envoi se classe : refus DÉFINITIF (rien ne le fera réussir),
/// repli socket, sinon l'outbox durable.
struct SendFailureRecovery: SendFailureRecoveryProviding {
    var toast: FeedbackToastSurfacing = FeedbackToastManager.shared

    func recover(
        from error: any Error,
        outgoing: OutgoingMessage,
        payload: SealedOutgoingPayload,
        context: SendAttemptContext,
        fallbackEligible: Bool,
        coordinator: any ConversationSendCoordinatorProviding,
        hooks: SendRecoveryHooks
    ) async -> Result<SentMessageReceipt, SendFailure> {
        let tempId = context.clientMessageId.rawValue
        if let refusal = await classifyRefusal(error, tempId: tempId, coordinator: coordinator, hooks: hooks) {
            return .failure(refusal)
        }

        let failElapsedMs = Int(Date().timeIntervalSince(context.startedAt) * 1000)
        Logger.messages.warning("perf:ios.send.fail clientMessageId=\(tempId, privacy: .public) durationMs=\(failElapsedMs, privacy: .public) error=\(error.localizedDescription, privacy: .public)")

        if fallbackEligible,
           let receipt = await emitSocketFallback(
               outgoing, payload: payload, context: context, failedAfterMs: failElapsedMs,
               coordinator: coordinator, hooks: hooks
           ) {
            return .success(receipt)
        }

        await coordinator.recordFailure(error, localId: tempId)
        return .failure(await coordinator.enqueueForRetry(outgoing, context: context, cause: error))
    }

    /// Refus DÉFINITIFS : retenter ne réussirait jamais, donc ni repli socket
    /// ni outbox. Un blocage entrant, lui, n'est pas visible d'avance.
    func classifyRefusal(
        _ error: any Error,
        tempId: String,
        coordinator: any ConversationSendCoordinatorProviding,
        hooks: SendRecoveryHooks
    ) async -> SendFailure? {
        if let restriction = ConversationWriteRestriction(refusal: error), restriction.closesComposer {
            await hooks.withdraw(tempId, restriction)
            return .writeRestricted(restriction)
        }
        if let slowMode = NewcomerSlowMode.from(error) {
            await hooks.holdSlowMode(tempId, slowMode, error)
            return .slowMode(slowMode)
        }
        guard error.isUserBlockedError else { return nil }
        Logger.messages.warning("perf:ios.send.fail.blocked clientMessageId=\(tempId, privacy: .public)")
        await coordinator.recordFailure(error, localId: tempId)
        toast.showError(
            String(localized: "conversation.send.blocked", defaultValue: "Vous ne pouvez pas écrire à cet utilisateur.", bundle: .main)
        )
        return .recipientBlocked
    }

    /// Repli socket : le POST REST a échoué — le coordinateur réémet UNE fois
    /// avec le MÊME clientMessageId (dedup gateway). Les envois que le canal
    /// perdrait en silence restent sur le retry REST de l'outbox, qui les
    /// préserve. `pendingServerIds` est posé AVANT l'acquittement GRDB : un
    /// `message:new` qui arrive pendant l'attente se réconcilie sans doublon.
    private func emitSocketFallback(
        _ outgoing: OutgoingMessage,
        payload: SealedOutgoingPayload,
        context: SendAttemptContext,
        failedAfterMs: Int,
        coordinator: any ConversationSendCoordinatorProviding,
        hooks: SendRecoveryHooks
    ) async -> SentMessageReceipt? {
        guard let receipt = await coordinator.emitSocketFallback(outgoing, payload: payload, context: context),
              case .acknowledged(let serverId, let at, _) = receipt.delivery else { return nil }
        let tempId = context.clientMessageId.rawValue
        hooks.registerServerId(tempId, serverId.rawValue)
        _ = await coordinator.acknowledge(localId: tempId, serverId: serverId.rawValue, at: at)
        Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(serverId.rawValue, privacy: .public) transport=socket-fallback durationMs=\(failedAfterMs, privacy: .public)")
        return receipt
    }
}
