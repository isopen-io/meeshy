import AVFoundation

/// La file de boucle du lecteur partagé : un successeur du MÊME média tenu en
/// file derrière l'élément en cours (#9702, #10555). Fonctions statiques sur le
/// lecteur reçu ; l'inventaire des éléments du moteur reste chez lui.
@MainActor
enum PlaybackLoopQueue {
    /// Met en file UN successeur du média en cours, s'il n'y est pas déjà.
    /// Rend `queued` (un successeur attend) et, si on vient de l'insérer, son
    /// élément — que le moteur inscrit dans ses éléments écoutés.
    static func queueSuccessor(on player: AVPlayer) -> (queued: Bool, inserted: AVPlayerItem?) {
        guard let queue = player as? AVQueuePlayer, let current = queue.currentItem else { return (false, nil) }
        if queue.items().count > 1 { return (true, nil) }
        let successor = AVPlayerItem(asset: current.asset)
        successor.preferredForwardBufferDuration = current.preferredForwardBufferDuration
        guard queue.canInsert(successor, after: current) else { return (false, nil) }
        queue.insert(successor, after: current)
        return (true, successor)
    }

    /// La file enchaînera d'elle-même à la fin de l'élément en cours.
    static func advancesToQueuedSuccessor(_ player: AVPlayer) -> Bool {
        guard let queue = player as? AVQueuePlayer else { return false }
        return queue.actionAtItemEnd == .advance && queue.items().count > 1
    }

    static func dropSuccessors(of player: AVPlayer) {
        guard let queue = player as? AVQueuePlayer else { return }
        queue.items().dropFirst().forEach { queue.remove($0) }
    }
}

/// La règle de zone morte de la reprise vidéo : une position sauvegardée n'est
/// honorée que bien à l'intérieur du média. Miroir strict de la règle de
/// `AudioPlaybackManager` (mêmes seuils).
nonisolated enum VideoResumeRules {
    static let minResumableDuration: TimeInterval = 2.0
    static let resumeEdgeGuard: TimeInterval = 1.0

    static func isResumable(_ saved: TimeInterval, totalDuration: TimeInterval) -> Bool {
        totalDuration >= minResumableDuration
            && saved > resumeEdgeGuard
            && saved < totalDuration - resumeEdgeGuard
    }
}
