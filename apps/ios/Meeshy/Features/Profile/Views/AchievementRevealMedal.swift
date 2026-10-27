import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Ce que la célébration plein écran montre du jeu (#9466, #9390)
//
// Deux lectures PURES, que `AchievementRevealView` habille :
//
//  - la MÉDAILLE d'un badge d'accumulation célébré — la même `GameMedalView` que l'étagère de Progression, avec la
//    famille de l'axe, son pictogramme et la matière de son palier, à la place du symbole `medal.fill` d'avant ;
//  - le LISERÉ DE RARETÉ d'un succès célébré — la couleur que la ligne du succès porte déjà sur Progression, quand la
//    rareté a le droit de se montrer (20 titulaires, 1 000 comptes, conformité G-2). Le client est FAIL-CLOSED : une
//    rareté non mesurée ne pose aucun liseré.

/// La médaille d'un badge d'accumulation célébré.
nonisolated struct RevealMedal: Equatable, Sendable {
    let family: GameMedalFamily
    let glyph: GameMedalGlyph
    let material: GameMaterial
    /// Le seuil du palier, écrit sur le cartouche du ruban (à partir de l'Or).
    let threshold: Int

    /// `nil` pour tout ce qui n'est pas un badge d'accumulation — et pour un axe que ce client ne connaît pas encore
    /// (ajouté au serveur avant la mise à jour) : le symbole d'avant reste, jamais une médaille inventée.
    init?(reveal: EngagementReveal) {
        guard case .badge(let axis, let threshold) = reveal, let key = EngagementAxisKey(rawValue: axis) else { return nil }
        self.family = GameMedalFamily(key.family)
        self.glyph = GameMedalGlyph(axis: key)
        self.material = GameBadges.material(forThreshold: threshold)
        self.threshold = threshold
    }
}

extension EngagementReveal {
    /// La clé sous laquelle la passerelle mesure la rareté d'un succès — celle du dictionnaire `achievementRarities`.
    /// `nil` pour un badge, une série ou un niveau : la rareté ne mesure que les succès.
    var achievementRarityKey: String? {
        switch self {
        case .achievement(let key): key.rawValue
        case .composedAchievement(let family, let tier): family.key(tier: tier)
        case .badge, .streak, .level: nil
        }
    }

    /// La rareté mesurée de ce succès dans un bloc `game`, `nil` quand il n'y en a aucune.
    func rarity(in game: GameBlock?) -> GameRarityEntry? {
        achievementRarityKey.flatMap { game?.wave2.achievementRarities?[$0] }
    }
}

enum RevealRim {
    /// La rareté mesurée du succès célébré, ou `nil` : un badge, une série, un niveau, une rareté absente — et « Jeu
    /// masqué », où le jeu disparaît des écrans de l'appareil, liseré compris.
    @MainActor
    static func entry(of reveal: EngagementReveal, in game: GameBlock?, hidden: Bool) -> GameRarityEntry? {
        hidden ? nil : reveal.rarity(in: game)
    }

    /// Le liseré à poser : celui de la rareté qu'on a le droit de montrer, `nil` sinon.
    nonisolated static func border(for entry: GameRarityEntry?) -> RarityBorder? {
        entry?.visibleRarity.map { GameRarity.border(for: $0) }
    }
}
