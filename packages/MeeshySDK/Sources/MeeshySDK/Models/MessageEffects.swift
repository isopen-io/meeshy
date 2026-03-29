import Foundation

// MARK: - MessageEffectFlags (OptionSet — single UInt32 bitfield)
// Bit assignments are the source of truth shared with packages/shared/types/message-effect-flags.ts

public struct MessageEffectFlags: OptionSet, Codable, Sendable, Hashable {
    public let rawValue: UInt32
    public init(rawValue: UInt32) { self.rawValue = rawValue }

    // Axe 1: Comportement de cycle de vie (bits 0-7)
    public static let ephemeral  = MessageEffectFlags(rawValue: 1 << 0)
    public static let blurred    = MessageEffectFlags(rawValue: 1 << 1)
    public static let viewOnce   = MessageEffectFlags(rawValue: 1 << 2)

    // Axe 2: Effets visuels d'apparition — one-shot (bits 8-15)
    public static let shake      = MessageEffectFlags(rawValue: 1 << 8)
    public static let zoom       = MessageEffectFlags(rawValue: 1 << 9)
    public static let explode    = MessageEffectFlags(rawValue: 1 << 10)
    public static let confetti   = MessageEffectFlags(rawValue: 1 << 11)
    public static let fireworks  = MessageEffectFlags(rawValue: 1 << 12)
    public static let waoo       = MessageEffectFlags(rawValue: 1 << 13)

    // Axe 3: Effets visuels persistants (bits 16-23)
    public static let glow       = MessageEffectFlags(rawValue: 1 << 16)
    public static let pulse      = MessageEffectFlags(rawValue: 1 << 17)
    public static let rainbow    = MessageEffectFlags(rawValue: 1 << 18)
    public static let sparkle    = MessageEffectFlags(rawValue: 1 << 19)

    // Convenience masks
    public static let lifecycleMask: MessageEffectFlags   = [.ephemeral, .blurred, .viewOnce]
    public static let appearanceMask: MessageEffectFlags   = [.shake, .zoom, .explode, .confetti, .fireworks, .waoo]
    public static let persistentMask: MessageEffectFlags   = [.glow, .pulse, .rainbow, .sparkle]

    public var hasLifecycleEffect: Bool { !intersection(.lifecycleMask).isEmpty }
    public var hasAppearanceEffect: Bool { !intersection(.appearanceMask).isEmpty }
    public var hasPersistentEffect: Bool { !intersection(.persistentMask).isEmpty }
    public var hasAnyEffect: Bool { rawValue != 0 }
}

// MARK: - MessageEffects (flags + parameters)

public struct MessageEffects: Codable, Sendable, Hashable {
    public var flags: MessageEffectFlags

    // Lifecycle parameters
    public var ephemeralDuration: Int?
    public var maxViewOnceCount: Int?
    public var blurRevealDuration: TimeInterval?

    // Appearance parameters
    public var zoomScale: Double?
    public var explodeStyle: ExplodeStyle?

    // Persistent parameters
    public var glowIntensity: Double?
    public var pulseFrequency: Double?
    public var rainbowColors: [String]?
    public var sparkleIntensity: Double?

    public init(flags: MessageEffectFlags = [],
                ephemeralDuration: Int? = nil,
                maxViewOnceCount: Int? = nil,
                blurRevealDuration: TimeInterval? = nil,
                zoomScale: Double? = nil,
                explodeStyle: ExplodeStyle? = nil,
                glowIntensity: Double? = nil,
                pulseFrequency: Double? = nil,
                rainbowColors: [String]? = nil,
                sparkleIntensity: Double? = nil) {
        self.flags = flags
        self.ephemeralDuration = ephemeralDuration
        self.maxViewOnceCount = maxViewOnceCount
        self.blurRevealDuration = blurRevealDuration
        self.zoomScale = zoomScale
        self.explodeStyle = explodeStyle
        self.glowIntensity = glowIntensity
        self.pulseFrequency = pulseFrequency
        self.rainbowColors = rainbowColors
        self.sparkleIntensity = sparkleIntensity
    }

    public static let none = MessageEffects()
    public var hasAnyEffect: Bool { flags.hasAnyEffect }
}

// MARK: - Supporting Enums

public enum ExplodeStyle: String, Codable, Sendable, CaseIterable {
    case burst, shatter, dissolve
}
