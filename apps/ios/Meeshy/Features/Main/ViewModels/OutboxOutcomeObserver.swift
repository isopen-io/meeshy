import MeeshySDK

/// Site unique de l'observation d'issue d'une mutation en outbox : rejoue `rollback` (et toaste)
/// quand la file escalade la ligne en `.exhausted`. Partagé par `FeedViewModel` et `PostDetailViewModel`.
/// ⚠️ Le corps du Task ne capture rien d'autre que la file : aucun VM n'est retenu hors-ligne.
enum OutboxOutcomeObserver {
    static func observe(
        queue: OfflineQueueing,
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String
    ) {
        Task { @MainActor in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    FeedbackToastManager.shared.showError(DailyGestureLimitNotice.exhaustedText(clientMutationId: cmid) ?? toast)
                }
            }
        }
    }
}
