import CoreGraphics
import Foundation

/// **Un recadrage est une BORNE, jamais un ré-encodage** (#5085, vue `2d`/`4c`).
///
/// > « ces trois gestes écrivent des bornes · aucun ne ré-encode · aucun
/// > n'invalide la montée » — planche `4c`
///
/// C'est cette phrase qui rend le recadrage décidable, et elle dicte la FORME
/// du type : un rectangle NORMALISÉ posé sur la source, en fractions de 0 à 1.
/// Des pixels auraient lié la borne à une résolution — donc au fichier — et
/// c'est exactement ce que la planche interdit : le fichier doit pouvoir partir
/// pendant que l'auteur compose, et continuer de partir quand il recadre.
///
/// La jumelle temporelle existe déjà et fonctionne : `sourceStart`/`sourceEnd`
/// bornent la LECTURE sans toucher au fichier. Ce type borne le CADRE de la
/// même façon.
public struct MediaCropRect: Codable, Equatable, Hashable, Sendable {
    /// Fractions de la source, origine en haut à gauche.
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    /// Le cadre ENTIER — l'absence de recadrage, écrite.
    public static let full = MediaCropRect(x: 0, y: 0, width: 1, height: 1)

    public var isFull: Bool { self == .full }
}

/// Les proportions que la vue `2d` offre — `9:16 · 4:5 · 1:1 · LIBRE`.
public enum MediaCropRatio: String, CaseIterable, Sendable {
    case portrait916
    case portrait45
    case square
    case free

    /// Le rapport largeur/hauteur VISÉ. `nil` pour `LIBRE`, qui n'en impose
    /// aucun — et c'est la seule des quatre qui laisse l'auteur décider.
    public var value: Double? {
        switch self {
        case .portrait916: return 9.0 / 16.0
        case .portrait45:  return 4.0 / 5.0
        case .square:      return 1
        case .free:        return nil
        }
    }
}

public enum MediaCropRule {

    /// **Ramène un rectangle DANS la source.** Une borne qui déborde ne casse
    /// rien au rendu — le moteur clippe — mais elle voyage jusqu'aux deux
    /// autres clients et jusqu'au renderer d'export, où un décodeur plus strict
    /// ou une multiplication par la taille réelle peut en faire autre chose.
    /// Même raison que la normalisation de `StoryMediaRotation`.
    ///
    /// **L'ORIGINE est bornée pour que le plancher TIENNE.** L'écriture
    /// naïve — origine bornée à `1`, puis dimension bornée à `1 - origine` —
    /// laisse la seconde borne DÉFAIRE la première : à `y == 1`,
    /// `min(max(0.01, h), 0)` rend `0`, c'est-à-dire exactement le média
    /// invisible que le plancher existe pour empêcher.
    ///
    /// Le défaut a vécu ici jusqu'au 2026-09-04, et c'est le portage
    /// TypeScript (#5085) qui l'a trouvé : le témoin qui l'attrape doit porter
    /// sur une origine EN DÉBORDEMENT, et les témoins Swift n'éprouvaient que
    /// des rectangles valides — où les deux écritures s'accordent.
    public static func clamped(_ rect: MediaCropRect) -> MediaCropRect {
        let place = 1 - minimumSide
        let l = min(max(0, rect.x), place)
        let h = min(max(0, rect.y), place)
        // Une largeur nulle rendrait un média INVISIBLE sans rien signaler ;
        // le plancher garde une bande étroite plutôt qu'un vide.
        let w = min(max(minimumSide, rect.width), 1 - l)
        let t = min(max(minimumSide, rect.height), 1 - h)
        return MediaCropRect(x: l, y: h, width: w, height: t)
    }

    /// Un pour cent de la source. En dessous, l'auteur ne voit plus ce qu'il
    /// cadre, et le geste devient un piège plutôt qu'un outil.
    public static let minimumSide: Double = 0.01

    /// **Le plus grand rectangle du rapport VISÉ qui tient dans la source**,
    /// centré. C'est ce qu'une pastille de proportion doit poser : l'auteur
    /// choisit une forme, pas un cadrage — il déplacera ensuite s'il veut.
    ///
    /// - Parameter sourceRatio: largeur/hauteur de la SOURCE. Sans lui, un
    ///   9:16 posé sur une photo panoramique et sur un portrait rendrait le
    ///   même rectangle en fractions — donc deux formes différentes à l'écran.
    public static func centered(ratio: MediaCropRatio,
                                sourceRatio: Double) -> MediaCropRect {
        guard let cible = ratio.value, sourceRatio > 0 else { return .full }
        // En fractions de la source, un rectangle de rapport `cible` a
        // w/h × sourceRatio == cible. On garde la plus grande des deux
        // dimensions à 1 et on déduit l'autre.
        let w: Double
        let h: Double
        if cible >= sourceRatio {
            w = 1
            h = min(1, sourceRatio / cible)
        } else {
            h = 1
            w = min(1, cible / sourceRatio)
        }
        return clamped(MediaCropRect(x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h))
    }

    /// **Ce que le recadrage rend au rendu** — le rapport EFFECTIF de l'objet.
    /// Un média recadré n'a plus les proportions de son fichier, et c'est ce
    /// nombre que la carte doit ajuster, pas `aspectRatio`.
    public static func effectiveRatio(sourceRatio: Double, crop: MediaCropRect?) -> Double {
        guard let crop, !crop.isFull, crop.height > 0 else { return sourceRatio }
        return sourceRatio * (crop.width / crop.height)
    }
}
