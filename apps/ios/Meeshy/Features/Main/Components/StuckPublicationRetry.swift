import Foundation
import MeeshySDK
import os

/// **Ce que fait le doigt sur une entrée terminale de la pastille** (#5830) —
/// « Réel non publié », mais aussi bien « Message non envoyé » ou « Blocage non
/// effectué » : le mécanisme est celui de la LIGNE, pas celui du réel.
///
/// Le vocabulaire l'a suivi après vérification au simulateur : l'indice
/// VoiceOver promettait « relancer la publication » AU-DESSUS d'un blocage. Une
/// promesse trop précise sur un mécanisme général est un indice menteur — le
/// même défaut que celui qu'on corrige, dans les mots.
///
/// Écrit UNE fois, appelé depuis `ConnectionBanner` — le seul étage que
/// `RootView` (iPhone) et `iPadRootView` montent tous les deux. Un geste écrit
/// deux fois diverge, et la divergence ne rougit nulle part : c'est exactement
/// ce qui est arrivé au drapeau du composer de fil, dont seul l'hôte iPhone
/// avait un lecteur.
///
/// Ce que ce type ne fait PAS : décider si une ligne est relançable. Cette
/// question se répond sur le STATUT (`OutboxStatus.failed`/`.exhausted`), et
/// elle a un seul site — `retryableOutboxId(for:)` ci-dessous — que la pastille
/// et ses témoins partagent.
enum StuckPublicationRetry {

    private static let logger = Logger(subsystem: "com.meeshy.ios", category: "stuck-publication-retry")

    /// L'identifiant à relancer pour cet item, ou `nil` si la ligne n'est pas
    /// dans un état terminal.
    ///
    /// `.exhausted` (budget de rejeu épuisé) ET `.failed` (échec transitoire
    /// que le flusher n'a plus programmé) sont les deux états où plus rien
    /// n'avance tout seul. Un `.pending` ou un `.inflight` est déjà en route :
    /// le relancer remettrait `attempts` à zéro pour rien, et masquerait un
    /// envoi en cours derrière un faux redémarrage.
    static func retryableOutboxId(for item: OutboxUIItem) -> String? {
        switch item.status {
        case .failed, .exhausted: return item.id
        default: return nil
        }
    }

    /// Relance la ligne et le DIT — un contrôle qui n'a pas d'effet visible
    /// n'existe pas (loi 4).
    ///
    /// L'accusé de réception est immédiat et local : la file rendra son verdict
    /// dans les secondes qui suivent, par la pastille elle-même, qui repasse en
    /// « Publication de réel » puis disparaît. Attendre ce verdict pour donner
    /// un retour laisserait le doigt sans réponse pendant tout un téléversement.
    @MainActor
    static func retry(
        outboxId: String,
        queue: any OfflineQueuePillProviding = OfflineQueue.shared,
        toasts: FeedbackToastManager = .shared
    ) {
        HapticFeedback.light()
        toasts.show(String(localized: "sync.pill.retry.started",
                           defaultValue: "Nouvelle tentative…",
                           bundle: .main))
        Task {
            do {
                try await queue.retryItem(outboxId)
                Self.logger.info("Relance manuelle de la ligne \(outboxId, privacy: .public)")
            } catch {
                Self.logger.error("Relance manuelle refusée pour \(outboxId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                await MainActor.run {
                    toasts.showError(String(localized: "sync.pill.retry.failed",
                                            defaultValue: "Impossible de réessayer cette opération.",
                                            bundle: .main))
                }
            }
        }
    }
}
