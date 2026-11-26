import Foundation
import CoreGraphics

// Aides de migration v1 ⇄ v3 partagées par CanvasV3Migration.swift et ses extensions.

let sceneAspect = Double(SceneShape.aspect)

/// `Double(Float(0.6))` vaudrait 0.6000000238… — la représentation décimale la
/// plus courte restitue la valeur que le JSON d'origine portait.
func exactDouble(_ value: Float) -> Double {
    Double("\(value)") ?? Double(value)
}

func wireObject<T: Encodable>(_ value: T) -> [String: CanvasJSONValue]? {
    guard let data = try? JSONEncoder().encode(value) else { return nil }
    return try? JSONDecoder().decode([String: CanvasJSONValue].self, from: data)
}

func wireArray<T: Encodable>(_ value: [T]) -> [CanvasJSONValue]? {
    guard let data = try? JSONEncoder().encode(value) else { return nil }
    return try? JSONDecoder().decode([CanvasJSONValue].self, from: data)
}

func remapFreeAnchor(_ anchor: ObjectAnchor, carrierAspect: Double) -> ObjectAnchor {
    guard case .free(let x, let y) = anchor else { return anchor }
    guard carrierAspect.isFinite, carrierAspect > 0 else { return anchor }
    if carrierAspect > sceneAspect {
        let h = sceneAspect / carrierAspect
        let top = (1 - h) / 2
        return .free(x: x, y: top + y * h)
    }
    if carrierAspect < sceneAspect {
        let w = carrierAspect / sceneAspect
        let left = (1 - w) / 2
        return .free(x: left + x * w, y: y)
    }
    return anchor
}

/// L'INVERSE exact de `remapFreeAnchor`. Les deux sens sont affines et se
/// déduisent du seul `carrierAspect` : `y' = top + y·h` s'inverse en
/// `y = (y' − top) / h`. C'est ce qui rend l'aller-retour v1→v3→v1 FIDÈLE dès
/// lors que la scène a logé son porteur (révision de S8).
func unmapFreeAnchor(_ anchor: ObjectAnchor, carrierAspect: Double) -> ObjectAnchor {
    guard case .free(let x, let y) = anchor else { return anchor }
    guard carrierAspect.isFinite, carrierAspect > 0 else { return anchor }
    if carrierAspect > sceneAspect {
        let h = sceneAspect / carrierAspect
        let top = (1 - h) / 2
        return .free(x: x, y: (y - top) / h)
    }
    if carrierAspect < sceneAspect {
        let w = carrierAspect / sceneAspect
        let left = (1 - w) / 2
        return .free(x: (x - left) / w, y: y)
    }
    return anchor
}

func anchorPosition(_ anchor: ObjectAnchor) -> (x: Double, y: Double) {
    switch anchor {
    case .free(let x, let y): return (x, y)
    case .band(.top): return (0.5, CanvasBandAnchorY.top)
    case .band(.bottom): return (0.5, CanvasBandAnchorY.bottom)
    }
}

func timingV3(start: Double?, end: Double?, keyframes: [StoryKeyframe]?) -> TimingV3? {
    let frames = keyframes.map { $0.map(KeyframeV3.init(migrating:)) }
    guard start != nil || end != nil || frames != nil else { return nil }
    return TimingV3(start: start, end: end, rate: nil, keyframes: frames)
}

func pivotWire(_ pivot: CGPoint) -> CanvasJSONValue {
    .object(["x": .number(Double(pivot.x)), "y": .number(Double(pivot.y))])
}

func wireAnchor(_ memo: [String: ObjectAnchor.Edge]?,
                        _ id: String,
                        x: Double,
                        y: Double) -> ObjectAnchor {
    memo?[id].map(ObjectAnchor.band) ?? .free(x: x, y: y)
}

extension KeyframeV3 {
    init(migrating keyframe: StoryKeyframe) {
        self.init(time: exactDouble(keyframe.time),
                  x: keyframe.x.map(Double.init),
                  y: keyframe.y.map(Double.init),
                  scale: keyframe.scale.map(Double.init),
                  opacity: keyframe.opacity.map(Double.init),
                  volume: keyframe.volume.map(exactDouble),
                  easing: keyframe.easing?.rawValue)
    }
}

extension StoryEffects {
    /// Miroir du `z++` du convertisseur gateway : le rang d'un objet dont le
    /// blob v1 ne déclarait AUCUN `zIndex` est son rang d'insertion, jamais le
    /// 0 que le décodeur a posé.
    func wireZ(_ id: String, _ declared: Int?, _ fallback: Int) -> Int {
        guard let declared, wireMissingZIndex?.contains(id) != true else { return fallback }
        return declared
    }
}

extension ObjectV3 {
    func replacingPayload(_ payload: [String: CanvasJSONValue]) -> ObjectV3 {
        ObjectV3(id: id, kind: kind, anchor: anchor, plane: plane, z: z,
                 transform: transform, timing: timing, locale: locale, payload: payload)
    }

    func replacingAnchor(_ anchor: ObjectAnchor) -> ObjectV3 {
        ObjectV3(id: id, kind: kind, anchor: anchor, plane: plane, z: z,
                 transform: transform, timing: timing, locale: locale, payload: payload)
    }
}
