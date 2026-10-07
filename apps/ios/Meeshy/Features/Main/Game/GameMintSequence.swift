import Foundation
import MeeshySDK

// MARK: - La frappe depuis le compteur de Meeshes : l'animation d'abord, le compteur ensuite (#9537)
//
// Directive porteur 2026-10-06 : la feuille que le compteur de Meeshes (en haut à droite) ouvre montre Mee et Meo qui
// FRAPPENT une Meesh, et le compteur ne s'incrémente qu'APRÈS la fin de l'animation. La mise à jour reste OPTIMISTE
// (`GameOptimistic.afterMint` change l'état à l'instant du toucher, un refus le restaure) : ce qui est SÉQUENCÉ, c'est
// ce que l'écran MONTRE. Pendant les 1,2 s de la scène, il montre l'image d'avant le toucher ; la scène finie, il lâche
// la valeur vivante — déjà incrémentée, ou déjà restaurée si le serveur a refusé entre-temps.
//
// Une pure machine à états : aucune horloge, aucune vue. L'hôte retient ce qu'il montrait (`begin`), dort la durée de la
// scène (`duration`), puis la lâche (`finish`). Générique sur ce qu'on retient : un solde, ou le solde ET la prochaine
// pièce.

struct GameMintSequence<Held: Equatable>: Equatable {

    /// Ce que l'écran montrait au toucher ; `nil` quand rien ne se joue.
    private(set) var held: Held?
    /// Incrémenté à chaque frappe commencée : c'est ce qui relance la minuterie de l'hôte.
    private(set) var generation = 0

    var isStriking: Bool { held != nil }

    /// Retient l'image d'avant et commence. Faux si une frappe se joue déjà — un second toucher ne la rejoue pas.
    @discardableResult
    mutating func begin(holding value: Held) -> Bool {
        guard held == nil else { return false }
        held = value
        generation += 1
        return true
    }

    /// La scène est finie : la valeur vivante reprend la main.
    mutating func finish() {
        held = nil
    }

    /// Ce que l'écran montre : l'image d'avant tant que la scène joue, la valeur vivante ensuite.
    func shown(live: Held) -> Held {
        held ?? live
    }

    /// La durée de la scène : celle de la planche, ou le fondu bref sous « Réduire les animations ».
    static func duration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? GameTimeline.reducedDuration : GameTimeline.strikeDuration
    }
}

/// La prochaine pièce que la scène frappe : son numéro et son édition.
struct GameMintNext: Equatable {
    let number: Int
    let edition: MeeshEdition
}

/// Ce que le compteur et sa feuille montrent à un instant : le solde et la prochaine pièce.
struct GameMintFrame: Equatable {
    let meesh: EngagementMeeshProgress
    let next: GameMintNext?
}

extension GameMintStrike {

    /// LA pièce que la scène de la feuille montre, et sur quelle face.
    ///
    ///  - une frappe vient de RÉUSSIR : la pièce frappée (`struck`) repose sur son revers, à SON numéro. Le vivant
    ///    annonce déjà la suivante (`shown.next`), qui n'existe pas encore : la graver au repos montrait une pièce
    ///    jamais frappée — et, sans points pour la suivante, la scène disparaissait avec le bouton ;
    ///  - une frappe se joue, a été refusée, ou n'a pas encore eu lieu : la prochaine pièce, sur son avers ;
    ///  - ni frappe possible ni frappe en cours, ou un ancien serveur qui ne dit pas la prochaine pièce : pas de scène.
    static func scene(shown: GameMintFrame, struck: GameMintNext?, isStriking: Bool, play: Int, failed: Bool) -> GameMintStrike? {
        if play > 0, !isStriking, !failed, let struck {
            return GameMintStrike(number: struck.number, edition: struck.edition, play: play, restsReversed: true)
        }
        guard let next = shown.next, shown.meesh.canMint || isStriking else { return nil }
        return GameMintStrike(number: next.number, edition: next.edition, play: play, restsReversed: false)
    }
}
