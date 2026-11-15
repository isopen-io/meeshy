import SwiftUI

/// **La pastille ne bat qu'au premier plan** (#17250).
///
/// Relevé sur appareil : application en arrière-plan, pastille affichée (une publication en file),
/// le battement `dotTimer` de 0,5 s réveillait le processeur deux fois par seconde, et chaque tic réévaluait le corps
/// de la pastille — libellés d'accessibilité `sync.*` et titre de la confirmation `feed.unsent.waiting` relus dans le
/// bundle à chaque fois. Hors de la phase active, personne ne voit ni les points ni la rotation : l'horloge s'arrête.
nonisolated enum SyncPillDotClock {
    /// Le battement des points tourne-t-il ? Seulement quand la scène est active.
    static func runs(in phase: ScenePhase) -> Bool {
        phase == .active
    }

    /// La rotation des entrées tourne-t-elle ? Au premier plan, et tant que l'utilisateur ne l'a pas mise en pause.
    static func rotates(in phase: ScenePhase, pausedByUser: Bool) -> Bool {
        runs(in: phase) && !pausedByUser
    }
}
