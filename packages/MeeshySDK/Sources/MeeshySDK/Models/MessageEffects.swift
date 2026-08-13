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

    /// Ce qu'il faut RÉELLEMENT rendre pour ce message, ici et maintenant.
    ///
    /// Règle pure, partagée par toutes les surfaces (bulle de conversation,
    /// commentaire de post, commentaire de story) — voir `MessageEffectPlan`.
    public func playbackPlan(hasPlayedAppearance: Bool, reduceMotion: Bool) -> MessageEffectPlan {
        MessageEffectPlan(effects: self, hasPlayedAppearance: hasPlayedAppearance, reduceMotion: reduceMotion)
    }
}

// MARK: - MessageEffectPlan (règle de lecture — pure, sans dépendance UI)

/// Décide quels effets d'un message doivent être rendus à un instant donné.
///
/// Trois entrées, aucune dépendance : les flags du message, le fait que son
/// animation d'apparition a DÉJÀ joué, et la préférence système « Réduire les
/// animations ». Séparé des `ViewModifier` pour être testable sans SwiftUI, et
/// partagé pour que les trois surfaces qui affichent des effets (conversation,
/// commentaires de post, commentaires de story) ne puissent pas diverger.
///
/// **Les effets d'apparition ne jouent qu'UNE fois par message.** C'est ce que
/// `hasPlayedAppearance` encode : une cellule recyclée par une liste paresseuse
/// est reconstruite avec `true` et ne rejoue rien. L'appelant est responsable de
/// la persistance de ce booléen entre deux instanciations (côté app :
/// `MessageEffectPlaybackStore`).
///
/// **Sous `reduceMotion`, le message ne perd pas son intention, il perd son
/// mouvement** : aucune apparition one-shot ne joue, et seuls les effets
/// persistants qui gardent un sens en rendu FIXE survivent (halo, bordure
/// arc-en-ciel). `pulse` et `sparkle` sont du mouvement pur — sans animation
/// ils ne veulent plus rien dire — donc ils sont retirés plutôt que figés.
public struct MessageEffectPlan: Equatable, Sendable {

    /// Effets persistants qui gardent du sens sans animation.
    public static let reduceMotionSafeMask: MessageEffectFlags = [.glow, .rainbow]

    /// Effets d'apparition one-shot à jouer MAINTENANT (vide si déjà joués).
    public let appearance: MessageEffectFlags
    /// Effets persistants à rendre en continu.
    public let persistent: MessageEffectFlags
    /// `false` sous `reduceMotion` : les effets persistants sont rendus FIXES
    /// (pas de `repeatForever`), sans être supprimés.
    public let animatesPersistent: Bool

    public init(effects: MessageEffects, hasPlayedAppearance: Bool, reduceMotion: Bool) {
        let requestedAppearance = effects.flags.intersection(.appearanceMask)
        let requestedPersistent = effects.flags.intersection(.persistentMask)

        appearance = (hasPlayedAppearance || reduceMotion) ? MessageEffectFlags() : requestedAppearance
        persistent = reduceMotion
            ? requestedPersistent.intersection(Self.reduceMotionSafeMask)
            : requestedPersistent
        animatesPersistent = !reduceMotion
    }

    /// `true` quand il n'y a strictement rien à rendre — l'appelant DOIT alors
    /// laisser sa vue intacte plutôt que l'envelopper dans des modifiers inertes
    /// (cas de l'écrasante majorité des messages, `effectFlags == 0`).
    public var isEmpty: Bool { appearance.isEmpty && persistent.isEmpty }

    public func plays(_ flag: MessageEffectFlags) -> Bool {
        !appearance.intersection(flag).isEmpty || !persistent.intersection(flag).isEmpty
    }
}

// MARK: - Supporting Enums

public enum ExplodeStyle: String, Codable, Sendable, CaseIterable {
    case burst, shatter, dissolve
}
