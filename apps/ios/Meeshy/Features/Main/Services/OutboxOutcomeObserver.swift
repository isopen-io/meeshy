import Foundation
import MeeshySDK
import MeeshyUI

/// Mécanisme partagé des « observeOutcome » des ViewModels à mutation optimiste :
/// s'abonne à `outcomeStream(for: cmid)` de la file et, si l'OutboxFlusher
/// escalade la ligne à `.exhausted` (budget de retries épuisé, rejet serveur
/// définitif), exécute `rollback` puis affiche le toast d'erreur.
/// `.applied` est sans effet : l'état optimiste est déjà final.
///
/// ⚠️ Le corps du Task ne capture PAS d'appelant : hors-ligne le stream peut ne
/// jamais émettre, et un `guard let self` fort aurait retenu un VM fermé
/// indéfiniment (un Task fantôme par mutation). La file est capturée seule.
enum OutboxOutcomeObserver {

    /// - Parameters:
    ///   - honorsDailyGestureLimit: remplace `toast` par le texte du quota
    ///     quotidien quand la ligne épuisée en est la victime.
    ///   - hapticOnFailure: déclenche `HapticFeedback.error()` après le toast.
    static func observe(
        queue: OfflineQueueing,
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String,
        honorsDailyGestureLimit: Bool = false,
        hapticOnFailure: Bool = false
    ) {
        Task { @MainActor in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    let text = honorsDailyGestureLimit
                        ? (DailyGestureLimitNotice.exhaustedText(clientMutationId: cmid) ?? toast)
                        : toast
                    FeedbackToastManager.shared.showError(text)
                    if hapticOnFailure { HapticFeedback.error() }
                }
            }
        }
    }
}
