import Foundation
import MeeshySDK

/// **D'où à où un objet apparaît** (#4634, directive porteur 2026-08-31 :
/// « puisque la sélection d'un élément, on doit pouvoir indiquer d'où à où il
/// apparaît […] et position temporelle avec la vision dans le plan 2D »).
///
/// ## Pourquoi une règle et pas deux glissières
///
/// Le modèle porte `startTime` et `duration`, tous deux OPTIONNELS, et les deux
/// `nil` ont un sens différent : `startTime = nil` veut dire « dès le début »,
/// `duration = nil` veut dire « jusqu'à la fin ». Une interface qui les traite
/// comme des nombres perdrait cette distinction au premier réglage — et un
/// objet « permanent » deviendrait un objet qui dure exactement la longueur
/// affichée le jour où la slide s'allonge.
///
/// **La fenêtre se manipule donc en DÉBUT et FIN**, ce que l'auteur voit sur le
/// plan 2D, et se range en début + durée, ce que le modèle stocke. La
/// conversion est ici, une fois.
nonisolated struct ComposerObjectTiming: Equatable {

    /// Seconde à laquelle l'objet apparaît. Jamais négative.
    let start: Double
    /// Seconde à laquelle il disparaît. `nil` ⇒ il reste jusqu'à la fin.
    let end: Double?

    /// La durée minimale d'une fenêtre — sous elle, l'objet clignote plus qu'il
    /// n'apparaît, et les deux poignées du plan 2D se recouvrent.
    static let minimumWindow: Double = 0.3

    static func timing(start: Double?, duration: Double?) -> ComposerObjectTiming {
        let debut = max(0, start ?? 0)
        guard let duration, duration > 0 else {
            return ComposerObjectTiming(start: debut, end: nil)
        }
        return ComposerObjectTiming(start: debut, end: debut + duration)
    }

    /// **Un objet permanent posé à zéro range DEUX `nil`**, jamais `0` + `nil`
    /// (défaut mesuré au simulateur, #4634).
    ///
    /// `Plan2DLayout.bar()` ne rend une barre FANTÔME — celle qui dit « présent
    /// tout du long » — que si le début ET la durée sont absents. Écrire
    /// `startTime = 0` faisait donc dessiner au plan une barre PLEINE de six
    /// secondes pendant que la section APPARITION, juste au-dessus, affichait
    /// « à la fin ». Deux lectures du même objet, dans le même écran, qui se
    /// contredisent.
    ///
    /// > Un zéro EXPLICITE n'est pas la même valeur qu'une absence, dès qu'un
    /// > lecteur en aval distingue les deux. Le modèle offrait la distinction ;
    /// > c'est l'écriture qui l'avait perdue.
    var storedStartTime: Double? {
        guard end != nil || start > 0 else { return nil }
        return start
    }

    /// Ce que le modèle range. **`nil` est PRÉSERVÉ** : une fin absente reste
    /// absente, elle ne devient pas « la durée de la slide » — sans quoi
    /// allonger la slide raccourcirait rétroactivement tous ses objets
    /// permanents.
    var storedDuration: Double? {
        guard let end else { return nil }
        return max(Self.minimumWindow, end - start)
    }

    /// Déplacer la fenêtre ENTIÈRE — le geste `onMove` du plan 2D. Sa longueur
    /// ne change pas : c'est ce qui distingue un déplacement d'un rognage, et
    /// les confondre ferait raccourcir l'objet chaque fois qu'on le recule
    /// contre zéro.
    func moved(to nouveauDebut: Double, slideDuration: Double) -> ComposerObjectTiming {
        let longueur = end.map { $0 - start }
        let borneHaute = max(0, slideDuration - (longueur ?? 0))
        let debut = min(max(0, nouveauDebut), borneHaute)
        return ComposerObjectTiming(start: debut, end: longueur.map { debut + $0 })
    }

    /// Rogner le bord GAUCHE — la fin ne bouge pas.
    func trimmingStart(to nouveauDebut: Double) -> ComposerObjectTiming {
        guard let end else {
            return ComposerObjectTiming(start: max(0, nouveauDebut), end: nil)
        }
        let debut = min(max(0, nouveauDebut), end - Self.minimumWindow)
        return ComposerObjectTiming(start: debut, end: end)
    }

    /// Rogner le bord DROIT — le début ne bouge pas.
    func trimmingEnd(to nouvelleFin: Double, slideDuration: Double) -> ComposerObjectTiming {
        let fin = min(max(nouvelleFin, start + Self.minimumWindow), max(slideDuration, start + Self.minimumWindow))
        return ComposerObjectTiming(start: start, end: fin)
    }

    /// **Rendre l'objet permanent** — la seule façon de RETROUVER le `nil` une
    /// fois qu'on l'a quitté. Sans ce chemin, régler une fin serait
    /// irréversible, et l'interface offrirait un aller sans retour.
    var madePermanent: ComposerObjectTiming {
        ComposerObjectTiming(start: start, end: nil)
    }

    var isPermanent: Bool { end == nil }
}
