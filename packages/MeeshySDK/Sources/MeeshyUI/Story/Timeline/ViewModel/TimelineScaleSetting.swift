import Foundation
import MeeshySDK

/// **Les réglages d'échelle de la frise suivent la règle du pincement** (#14304).
///
/// Le champ « Taille » de l'inspecteur et le curseur d'une image clé écrivent
/// la même grandeur que le geste : `SceneObjectScalePolicy.entered` la borne,
/// sans plafond, au plus petit côté RENDU que mesure `SceneObjectUnitSide`.
/// Un réglage qui ne touche pas l'échelle la laisse telle quelle, même hors de
/// toute plage qu'un curseur afficherait.
@MainActor
enum TimelineScaleSetting {

    /// Le champ de transformation, l'échelle passée par la règle de l'objet.
    static func settled(_ field: ClipTransform.Field, from current: ClipTransform,
                        object: MeeshySceneObject?) -> ClipTransform.Field {
        guard case .scale(let requested) = field, requested.isFinite else { return field }
        return .scale(SceneObjectScalePolicy.entered(requested, current: current.scale,
                                                     unitSide: unitSide(of: object)))
    }

    /// L'échelle d'une image clé MULTIPLIE celle de l'objet au rendu
    /// (`StoryRenderer.applyKeyframeOverrides`, `CATransform3DScale` sur la
    /// transformation de base) : son côté à l'échelle 1 est le côté rendu de
    /// l'objet.
    static func keyframeScale(_ requested: CGFloat, from current: CGFloat,
                              object: MeeshySceneObject?) -> CGFloat {
        CGFloat(SceneObjectScalePolicy.entered(Double(requested), current: Double(current),
                                               unitSide: keyframeUnitSide(of: object)))
    }

    /// Le plancher qu'affiche le curseur d'une image clé ; 0 quand il ne se
    /// prouve pas.
    static func keyframeFloor(of object: MeeshySceneObject?) -> CGFloat {
        let side = keyframeUnitSide(of: object)
        guard side.isFinite, side > 0 else { return 0 }
        return CGFloat(SceneObjectScalePolicy.floor(unitSide: side))
    }

    private static func keyframeUnitSide(of object: MeeshySceneObject?) -> Double {
        guard let object else { return 0 }
        return unitSide(of: object) * SceneObjectScalePolicy.sanitized(object.scale)
    }

    private static func unitSide(of object: MeeshySceneObject?) -> Double {
        object.map(SceneObjectUnitSide.designSide(of:)) ?? 0
    }
}
