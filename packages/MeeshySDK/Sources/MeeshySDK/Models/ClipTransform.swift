import Foundation

/// Place d'une piste dans le PLAN : position, taille, orientation, et rang de
/// superposition.
///
/// Les modèles (`StoryMediaObject`, `StoryTextObject`, `StorySticker`,
/// `StoryAudioPlayerObject`) portent ces champs depuis toujours, mais rien ne
/// les remontait jusqu'à la fiche d'édition de la timeline : elle restituait le
/// temps d'une piste et jamais son espace. Ce type est le véhicule commun,
/// borné, entre le projet et la fiche.
///
/// Vit dans `MeeshySDK` et non dans `MeeshyUI` parce que
/// `SetClipPropertyCommand` le transporte : le core ne peut pas dépendre de la
/// couche UI. Aucune dépendance SwiftUI ici — valeur pure.
///
/// `x` et `y` sont NORMALISÉS (0–1) comme dans les modèles ; la fiche les
/// présente en pourcentage, plus lisible qu'un `0,5`, mais la valeur stockée ne
/// change pas d'unité en chemin. `rotation` est en DEGRÉS, jamais en radians.
public struct ClipTransform: Codable, Equatable, Sendable {

    /// Centre du cadre, taille d'origine, aucune rotation, plan neutre.
    public static let identity = ClipTransform(x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 0)

    /// Bornes de saisie. La position déborde volontairement de [0, 1] : un
    /// élément partiellement hors cadre est un effet recherché, l'interdire
    /// bloquerait des compositions légitimes.
    public static let positionRange: ClosedRange<Double> = -0.5...1.5
    public static let scaleRange: ClosedRange<Double> = 0.05...8
    public static let rotationRange: ClosedRange<Double> = -180...180
    public static let zIndexRange: ClosedRange<Int> = -100...100

    public let x: Double
    public let y: Double
    public let scale: Double
    public let rotation: Double
    public let zIndex: Int

    public init(x: Double, y: Double, scale: Double, rotation: Double, zIndex: Int) {
        self.x = x
        self.y = y
        self.scale = scale
        self.rotation = rotation
        self.zIndex = zIndex
    }

    /// Champ édité, pour n'écrire qu'une valeur à la fois sans perdre les autres.
    public enum Field: Equatable, Sendable {
        case x(Double)
        case y(Double)
        case scale(Double)
        case rotation(Double)
        case zIndex(Int)
    }

    /// Applique une édition en la bornant. Une valeur non finie laisse la
    /// transformation intacte : un `NaN` qui atteindrait le modèle y resterait,
    /// invisible jusqu'au rendu.
    public func applying(_ field: Field) -> ClipTransform {
        func clamped(_ v: Double, _ range: ClosedRange<Double>) -> Double? {
            guard v.isFinite else { return nil }
            return min(max(v, range.lowerBound), range.upperBound)
        }
        switch field {
        case .x(let v):
            guard let c = clamped(v, Self.positionRange) else { return self }
            return ClipTransform(x: c, y: y, scale: scale, rotation: rotation, zIndex: zIndex)
        case .y(let v):
            guard let c = clamped(v, Self.positionRange) else { return self }
            return ClipTransform(x: x, y: c, scale: scale, rotation: rotation, zIndex: zIndex)
        case .scale(let v):
            guard let c = clamped(v, Self.scaleRange) else { return self }
            return ClipTransform(x: x, y: y, scale: c, rotation: rotation, zIndex: zIndex)
        case .rotation(let v):
            guard let c = clamped(v, Self.rotationRange) else { return self }
            return ClipTransform(x: x, y: y, scale: scale, rotation: c, zIndex: zIndex)
        case .zIndex(let v):
            let c = min(max(v, Self.zIndexRange.lowerBound), Self.zIndexRange.upperBound)
            return ClipTransform(x: x, y: y, scale: scale, rotation: rotation, zIndex: c)
        }
    }
}
