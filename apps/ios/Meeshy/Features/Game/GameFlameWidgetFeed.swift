import Foundation
import MeeshySDK

// MARK: - Ce que le widget « Ma Flamme » reçoit (#20562, tranche iOS de #17369)
//
// La Flamme et les actes du jour du compte connecté, LUS dans le bloc `game` servi : jours et état de la Flamme
// (`flame.days`, `flame.status`), actes réalisés sur ceux du jour (`GameActsRing`, la même loi que l'anneau du menu).
// Aucune règle recalculée, rien d'autrui. « Jeu masqué » ⇒ `.hidden`, qui vide le widget.

enum GameFlameWidgetFeed {
    static func state(of game: GameBlock, hidden: Bool) -> WidgetGameFlameState {
        guard !hidden else { return .hidden }
        let ring = GameActsRing.of(game, hidden: false)
        return .shown(WidgetGameFlame(days: game.flame.days, status: game.flame.status.rawValue,
                                      actsDone: ring?.done ?? 0, actsTotal: ring?.total ?? 0))
    }
}
