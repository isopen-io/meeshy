import Foundation

/// Les mots que la frise ne choisit pas : l'hôte les passe, déjà traduits. Le
/// groupe, la règle réglable, les six pas d'une piste, les deux poignées au
/// clavier, le zoom nommé et l'invite muette (`nil` ⇒ aucune invite).
public nonisolated struct MeeshyTimelineFriseNames: Sendable, Equatable {
    public let frise: String
    public let playhead: String
    public let earlier: String
    public let later: String
    public let entryEarlier: String
    public let entryLater: String
    public let exitEarlier: String
    public let exitLater: String
    public let start: String
    public let end: String
    public let zoomIn: String
    public let zoomOut: String
    public let zoomHint: String?

    public init(
        frise: String,
        playhead: String,
        earlier: String,
        later: String,
        entryEarlier: String,
        entryLater: String,
        exitEarlier: String,
        exitLater: String,
        start: String,
        end: String,
        zoomIn: String,
        zoomOut: String,
        zoomHint: String? = nil
    ) {
        self.frise = frise
        self.playhead = playhead
        self.earlier = earlier
        self.later = later
        self.entryEarlier = entryEarlier
        self.entryLater = entryLater
        self.exitEarlier = exitEarlier
        self.exitLater = exitLater
        self.start = start
        self.end = end
        self.zoomIn = zoomIn
        self.zoomOut = zoomOut
        self.zoomHint = zoomHint
    }
}

/// Une image clé d'une piste, à son temps ABSOLU dans la scène.
public nonisolated struct MeeshyTimelineFriseKey: Sendable, Equatable, Identifiable {
    public let id: String
    public let time: Double

    public init(id: String, time: Double) {
        self.id = id
        self.time = time
    }
}

/// La hauteur dessinée d'une barre dans sa rangée de 44 : 34, ou 40 pour des vignettes.
public nonisolated enum MeeshyTimelineFriseTrackHeight: String, Sendable, Equatable, CaseIterable {
    case regular
    case tall
}

/// Une piste : un objet de la scène et sa fenêtre d'apparition. Le contenu de
/// sa barre, sa teinte et ses mots sont à l'hôte ; `detail` complète la valeur
/// lue par le lecteur d'écran (« 3 images clés », « verrouillée »).
public nonisolated struct MeeshyTimelineFriseTrack: Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let systemImage: String
    public let range: ClosedRange<Double>
    public let height: MeeshyTimelineFriseTrackHeight
    public let isLocked: Bool
    public let keyframes: [MeeshyTimelineFriseKey]
    public let detail: String?

    public init(
        id: String,
        name: String,
        systemImage: String,
        range: ClosedRange<Double>,
        height: MeeshyTimelineFriseTrackHeight = .regular,
        isLocked: Bool = false,
        keyframes: [MeeshyTimelineFriseKey] = [],
        detail: String? = nil
    ) {
        self.id = id
        self.name = name
        self.systemImage = systemImage
        self.range = range
        self.height = height
        self.isLocked = isLocked
        self.keyframes = keyframes
        self.detail = detail
    }
}

/// Ce qu'un doigt, une commande ou le lecteur d'écran tient : la tête (sur la
/// règle), la barre entière, ou l'une de ses poignées.
public nonisolated enum MeeshyTimelineFrisePart: String, Sendable, Equatable, CaseIterable {
    case playhead
    case move
    case start
    case end
}

/// Le style d'un temps que l'hôte formate : un libellé de la règle, l'instant
/// d'une accroche, la phrase du lecteur d'écran.
public nonisolated enum MeeshyTimelineFriseTimeStyle: String, Sendable, Equatable, CaseIterable {
    case ruler
    case snap
    case spoken
}

public nonisolated enum MeeshyTimelineFriseSnapping: String, Sendable, Equatable, CaseIterable {
    case standard
    case none
}

public nonisolated enum MeeshyTimelineFriseHaptic: String, Sendable, Equatable, CaseIterable {
    case standard
    case none
}

/// Les six pas nommés d'une piste au lecteur d'écran, chacun de `step`.
public nonisolated enum MeeshyTimelineFriseNudge: String, Sendable, Equatable, CaseIterable {
    case earlier
    case later
    case entryEarlier
    case entryLater
    case exitEarlier
    case exitLater

    /// La partie que le pas déplace, et dans quel sens.
    public var part: MeeshyTimelineFrisePart {
        switch self {
        case .earlier, .later: return .move
        case .entryEarlier, .entryLater: return .start
        case .exitEarlier, .exitLater: return .end
        }
    }

    public var isLater: Bool {
        self == .later || self == .entryLater || self == .exitLater
    }

    public func name(in names: MeeshyTimelineFriseNames) -> String {
        switch self {
        case .earlier: return names.earlier
        case .later: return names.later
        case .entryEarlier: return names.entryEarlier
        case .entryLater: return names.entryLater
        case .exitEarlier: return names.exitEarlier
        case .exitLater: return names.exitLater
        }
    }
}

/// Une commande au clavier (iPad, iOS 17+) : ← → valent `step`, Maj + ← → 0,1 s,
/// Début et Fin les butées, Entrée ou Espace choisit, `+` `−` `0` zooment. Le
/// temps ne se met pas en miroir : → va toujours plus tard.
public nonisolated enum MeeshyTimelineFriseCommand: String, Sendable, Equatable, CaseIterable {
    case arrowLeft
    case arrowRight
    case fineLeft
    case fineRight
    case home
    case end
    case choose
    case zoomIn
    case zoomOut
    case zoomReset
}

/// Le retour tactile que la frise demande : un seul, `light`.
public nonisolated enum MeeshyTimelineFriseHapticKind: String, Sendable, Equatable, CaseIterable {
    case light
}

/// Ce qu'un geste ou une commande demande, dans l'ordre où la vue le joue.
public nonisolated enum MeeshyTimelineFriseEffect: Sendable, Equatable {
    case editing(MeeshyTimelineFrisePart, Bool)
    case select(String, Double?)
    case seek(Double)
    case commit(String, ClosedRange<Double>, MeeshyTimelineFrisePart)
    case keyframe(String, String)
    case announce(String, ClosedRange<Double>)
    case haptic(MeeshyTimelineFriseHapticKind)
}

/// Un glissé aimanté : la fenêtre, et l'instant où le bord qui bouge s'est
/// accroché (`nil`, libre).
public nonisolated struct MeeshyTimelineFriseDrag: Sendable, Equatable {
    public let range: ClosedRange<Double>
    public let snappedTime: Double?

    public init(range: ClosedRange<Double>, snappedTime: Double?) {
        self.range = range
        self.snappedTime = snappedTime
    }

    public var isSnapped: Bool { snappedTime != nil }
}
