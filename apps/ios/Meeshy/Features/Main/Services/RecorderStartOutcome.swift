import Foundation

/// **Un enregistreur qui démarre hors du fil principal revient dans une
/// situation qui a pu changer** (#18489). `record()` lance le matériel audio —
/// jusqu'à 1,5 s sur iPhone — et ne doit jamais tenir l'écran ; pendant ce
/// temps l'utilisateur a pu arrêter ou annuler : la tentative a alors changé,
/// et l'enregistreur revenu est périmé, qu'il ait démarré ou non.
nonisolated enum RecorderStartOutcome: Equatable {
    /// La tentative est toujours la bonne et le matériel tourne : l'enregistrement vit.
    case live
    /// Arrêt ou annulation entre-temps : on arrête ce qui a pu démarrer et on jette son fichier.
    case stale
    /// Le matériel n'a pas démarré : échec, la session se rend.
    case failed

    static func resolve(attemptAtStart: Int, attemptNow: Int, started: Bool) -> Self {
        guard attemptAtStart == attemptNow else { return .stale }
        return started ? .live : .failed
    }
}
