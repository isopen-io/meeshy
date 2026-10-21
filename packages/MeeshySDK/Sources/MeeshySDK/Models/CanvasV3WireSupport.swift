import Foundation
import CoreGraphics

// Aides de fil partagées par CanvasV3Migration.swift et CanvasV3RenderRules.swift.

let centerPivot = CGPoint(x: 0.5, y: 0.5)

func nonEmpty(_ value: String?) -> String? {
    value.flatMap { $0.isEmpty ? nil : $0 }
}

func decodeWireArray<T: Decodable>(_ type: T.Type, from array: [CanvasJSONValue]?) -> [T]? {
    guard let array, let data = try? JSONEncoder().encode(array) else { return nil }
    return try? JSONDecoder().decode([T].self, from: data)
}

func decodeWire<T: Decodable>(_ type: T.Type, from object: [String: CanvasJSONValue]?) -> T? {
    guard let object, let data = try? JSONEncoder().encode(object) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
}

extension [String: CanvasJSONValue] {
    func string(_ key: String) -> String? {
        if case .string(let value)? = self[key] { return value }
        return nil
    }

    func double(_ key: String) -> Double? {
        if case .number(let value)? = self[key] { return value }
        return nil
    }

    func bool(_ key: String) -> Bool? {
        if case .bool(let value)? = self[key] { return value }
        return nil
    }

    func array(_ key: String) -> [CanvasJSONValue]? {
        if case .array(let value)? = self[key] { return value }
        return nil
    }

    func object(_ key: String) -> [String: CanvasJSONValue]? {
        if case .object(let value)? = self[key] { return value }
        return nil
    }

    func stringMap(_ key: String) -> [String: String]? {
        guard let object = object(key) else { return nil }
        let pairs = object.compactMap { entry -> (String, String)? in
            if case .string(let value) = entry.value { return (entry.key, value) }
            return nil
        }
        return pairs.isEmpty ? nil : [String: String](uniqueKeysWithValues: pairs)
    }
}

extension StoryKeyframe {
    init(rendering keyframe: KeyframeV3) {
        self.init(time: Float(keyframe.time),
                  x: keyframe.x.map { CGFloat($0) },
                  y: keyframe.y.map { CGFloat($0) },
                  scale: keyframe.scale.map { CGFloat($0) },
                  opacity: keyframe.opacity.map { CGFloat($0) },
                  volume: keyframe.volume.map { Float($0) },
                  easing: keyframe.easing.flatMap(StoryEasing.init(rawValue:)))
    }
}
