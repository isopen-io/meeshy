import CoreGraphics
import Foundation

// MARK: - AnyEditCommand (type-erased Codable wrapper)

/// Type-erased wrapper around `EditCommand` allowing the 12 concrete command
/// types to be persisted as a single homogeneous array (`CommandStack`).
/// Encoded as `{"type": "<tag>", "payload": <concrete>}`.
public enum AnyEditCommand: Codable, Sendable {
    case addClip(AddClipCommand)
    case deleteClip(DeleteClipCommand)
    case moveClip(MoveClipCommand)
    case trimClip(TrimClipCommand)
    case splitClip(SplitClipCommand)
    case addTransition(AddTransitionCommand)
    case removeTransition(RemoveTransitionCommand)
    case changeTransition(ChangeTransitionCommand)
    case addKeyframe(AddKeyframeCommand)
    case moveKeyframe(MoveKeyframeCommand)
    case deleteKeyframe(DeleteKeyframeCommand)
    case setClipProperty(SetClipPropertyCommand)
    case setSlideDuration(SetSlideDurationCommand)

    public var underlying: any EditCommand {
        switch self {
        case .addClip(let c):           return c
        case .deleteClip(let c):        return c
        case .moveClip(let c):          return c
        case .trimClip(let c):          return c
        case .splitClip(let c):         return c
        case .addTransition(let c):     return c
        case .removeTransition(let c):  return c
        case .changeTransition(let c):  return c
        case .addKeyframe(let c):       return c
        case .moveKeyframe(let c):      return c
        case .deleteKeyframe(let c):    return c
        case .setClipProperty(let c):   return c
        case .setSlideDuration(let c):  return c
        }
    }

    public func apply(to project: inout TimelineProject) throws {
        try underlying.apply(to: &project)
    }

    public func revert(from project: inout TimelineProject) throws {
        try underlying.revert(from: &project)
    }

    public var typeTag: String {
        switch self {
        case .addClip:           return "addClip"
        case .deleteClip:        return "deleteClip"
        case .moveClip:          return "moveClip"
        case .trimClip:          return "trimClip"
        case .splitClip:         return "splitClip"
        case .addTransition:     return "addTransition"
        case .removeTransition:  return "removeTransition"
        case .changeTransition:  return "changeTransition"
        case .addKeyframe:       return "addKeyframe"
        case .moveKeyframe:      return "moveKeyframe"
        case .deleteKeyframe:    return "deleteKeyframe"
        case .setClipProperty:   return "setClipProperty"
        case .setSlideDuration:  return "setSlideDuration"
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type, payload
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let tag = try c.decode(String.self, forKey: .type)
        switch tag {
        case "addClip":
            self = .addClip(try c.decode(AddClipCommand.self, forKey: .payload))
        case "deleteClip":
            self = .deleteClip(try c.decode(DeleteClipCommand.self, forKey: .payload))
        case "moveClip":
            self = .moveClip(try c.decode(MoveClipCommand.self, forKey: .payload))
        case "trimClip":
            self = .trimClip(try c.decode(TrimClipCommand.self, forKey: .payload))
        case "splitClip":
            self = .splitClip(try c.decode(SplitClipCommand.self, forKey: .payload))
        case "addTransition":
            self = .addTransition(try c.decode(AddTransitionCommand.self, forKey: .payload))
        case "removeTransition":
            self = .removeTransition(try c.decode(RemoveTransitionCommand.self, forKey: .payload))
        case "changeTransition":
            self = .changeTransition(try c.decode(ChangeTransitionCommand.self, forKey: .payload))
        case "addKeyframe":
            self = .addKeyframe(try c.decode(AddKeyframeCommand.self, forKey: .payload))
        case "moveKeyframe":
            self = .moveKeyframe(try c.decode(MoveKeyframeCommand.self, forKey: .payload))
        case "deleteKeyframe":
            self = .deleteKeyframe(try c.decode(DeleteKeyframeCommand.self, forKey: .payload))
        case "setClipProperty":
            self = .setClipProperty(try c.decode(SetClipPropertyCommand.self, forKey: .payload))
        case "setSlideDuration":
            self = .setSlideDuration(try c.decode(SetSlideDurationCommand.self, forKey: .payload))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c,
                debugDescription: "Unknown AnyEditCommand type: \(tag)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(typeTag, forKey: .type)
        switch self {
        case .addClip(let v):           try c.encode(v, forKey: .payload)
        case .deleteClip(let v):        try c.encode(v, forKey: .payload)
        case .moveClip(let v):          try c.encode(v, forKey: .payload)
        case .trimClip(let v):          try c.encode(v, forKey: .payload)
        case .splitClip(let v):         try c.encode(v, forKey: .payload)
        case .addTransition(let v):     try c.encode(v, forKey: .payload)
        case .removeTransition(let v):  try c.encode(v, forKey: .payload)
        case .changeTransition(let v):  try c.encode(v, forKey: .payload)
        case .addKeyframe(let v):       try c.encode(v, forKey: .payload)
        case .moveKeyframe(let v):      try c.encode(v, forKey: .payload)
        case .deleteKeyframe(let v):    try c.encode(v, forKey: .payload)
        case .setClipProperty(let v):   try c.encode(v, forKey: .payload)
        case .setSlideDuration(let v):  try c.encode(v, forKey: .payload)
        }
    }
}
