import Foundation

/// LA RÈGLE DU RAPPORT D'UNE CHUTE (#18748) — pure, sans HealthKit : quels échantillons neufs rapporter, et ce que la
/// réponse de la passerelle fait du curseur et de l'observateur. L'app l'appelle avec les instants que la requête
/// ancrée de HealthKit vient de rendre ; elle seule sait les lire.
public enum FallReportPlanner {

    /// Ce qu'il faut faire après une réponse.
    public enum Next: Sendable, Equatable {
        /// Avancer : la chute est rangée, dédupliquée, ou refusée pour toujours (trop ancienne) — ne pas la renvoyer.
        case advance
        /// Garder pour plus tard : hors ligne, le rapport sera refait au prochain réveil.
        case retryLater
        /// L'accord n'est plus là : arrêter l'observateur et la livraison d'arrière-plan.
        case stopObserving
    }

    /// Les instants à rapporter, du plus ancien au plus récent : ceux qui suivent le dernier rapporté, et assez récents
    /// pour être acceptés (`maxReportAge`) — une chute plus vieille serait refusée, et l'alerte trompeuse.
    public static func toReport(_ samples: [Date], lastReported: Date?, now: Date,
                                maxAge: TimeInterval = FallDetectionContract.maxReportAge) -> [Date] {
        samples
            .filter { sample in lastReported.map { sample > $0 } ?? true }
            .filter { now.timeIntervalSince($0) <= maxAge }
            .sorted()
    }

    public static func next(after outcome: FallReportOutcome) -> Next {
        switch outcome {
        case .recorded, .deduplicated, .rejected: return .advance
        case .failed: return .retryLater
        case .consentRequired: return .stopObserving
        }
    }
}
