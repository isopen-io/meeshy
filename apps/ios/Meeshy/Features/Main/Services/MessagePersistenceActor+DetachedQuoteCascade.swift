import Foundation
import MeeshySDK
import os

// MARK: - Les réponses d'un mort quittent la BASE avec lui, sans retenir l'écran (#10433)

extension MessagePersistenceActor {

    /// Lance `purgeQuoteCascade(fromDead:)` sans attendre son résultat : l'hôte
    /// qui retire un éphémère de l'écran n'a rien à faire de la purge, et un
    /// échec se journalise sans remonter. Sans cette purge, les réponses d'un
    /// mort revenaient au fil dès que le message cité sortait de la fenêtre.
    nonisolated func purgeQuoteCascadeDetached(fromDead ids: [String]) {
        guard !ids.isEmpty else { return }
        Task {
            do {
                try await purgeQuoteCascade(fromDead: ids)
            } catch {
                Logger.messages.warning("[EphemeralExpiry] purgeQuoteCascade failed \(ids.count, privacy: .public) id(s): \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
