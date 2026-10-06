import Foundation

/// Où le doigt est tombé.
nonisolated enum ComposerCaptureZone: Equatable, Sendable {
    case scene
    case chosenThumbnail
    case otherThumbnail
    case rail
}

nonisolated enum ComposerCaptureGestureKind: Equatable, Sendable {
    case tap
    case doubleTap
    case longPress
    case pinch
    case drag
}

/// Ce que le geste produit — la vue l'exécute, la table le décide.
nonisolated enum ComposerCaptureAction: Equatable, Sendable {
    case none
    case focus
    case photoToEdit
    case photoToGallery
    case filmSegment
    case filmToGallery
    case stopTake
    case zoom
    /// Le doigt qui tient la prise glisse : à droite le cadenas, à la verticale le zoom.
    case steerTake
    case close
    case select
    case openFamily
    case reframe
}

nonisolated struct ComposerCaptureGestureContext: Equatable, Sendable {
    var stage: ComposerSceneCameraStage = .armed
    var editing = false
    var holding = false
    var locked = false
    var pendingSegments = 0
    var allowsPhoto = true
    var allowsVideo = true
}

/// **La table des gestes de la capture** (#9351, spec § 3) — zone × geste ×
/// phase × verrou → action. Pure : la vue ne décide rien.
///
/// Un `doubleTap` n'est jamais reconnu par un `TapGesture(count: 2)`, qui
/// retarderait le toucher simple : c'est la règle du porteur
/// (`ComposerCaptureTapRule`, #9464) qui dit si un toucher est le second d'un
/// double — `tap(zone:context:now:lastTapAt:armedAt:)` la consulte.
nonisolated enum ComposerCaptureGesture {

    static func action(zone: ComposerCaptureZone, gesture: ComposerCaptureGestureKind,
                       context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        if context.editing { return editing(zone: zone, gesture: gesture) }
        guard context.stage != .off else { return .none }
        switch zone {
        case .scene: return scene(gesture, context)
        case .chosenThumbnail: return chosen(gesture, context)
        case .otherThumbnail: return gesture == .tap && !lookIsLocked(context) ? .select : .none
        case .rail: return gesture == .tap && !lookIsLocked(context) ? .openFamily : .none
        }
    }

    /// **Un toucher, lu par la règle du porteur** (#9464) : le premier vise tout
    /// de suite ; le second, dans la fenêtre et après l'armement, est un double.
    /// Un double que la table refuse (segments en attente, format sans photo)
    /// reste un toucher : il vise encore.
    static func tap(zone: ComposerCaptureZone, context: ComposerCaptureGestureContext,
                    now: Date, lastTapAt: Date?, armedAt: Date?) -> ComposerCaptureAction {
        let regle = ComposerCaptureTapRule.action(stage: context.stage, now: now, lastTapAt: lastTapAt, armedAt: armedAt)
        let simple = action(zone: zone, gesture: .tap, context: context)
        guard regle == .photo else { return simple }
        let double = action(zone: zone, gesture: .doubleTap, context: context)
        return double == .none ? simple : double
    }

    private static func lookIsLocked(_ context: ComposerCaptureGestureContext) -> Bool {
        ComposerLiveLookRule.isLocked(stage: context.stage, pendingSegments: context.pendingSegments)
    }

    /// Une prise isolée (photo, ou vidéo vers la galerie) ne part que d'un viseur
    /// armé sans segment en attente.
    private static func mayShootAlone(_ context: ComposerCaptureGestureContext) -> Bool {
        context.stage == .armed && context.pendingSegments == 0
    }

    private static func scene(_ gesture: ComposerCaptureGestureKind,
                              _ context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        switch gesture {
        case .tap: return .focus
        case .doubleTap: return mayShootAlone(context) && context.allowsPhoto ? .photoToEdit : .none
        case .longPress: return context.stage == .armed && context.allowsVideo ? .filmSegment : .none
        case .pinch: return .zoom
        case .drag:
            if context.holding { return .steerTake }
            return context.stage == .recording ? .zoom : .close
        }
    }

    private static func chosen(_ gesture: ComposerCaptureGestureKind,
                               _ context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        switch gesture {
        case .tap: return context.stage == .recording && context.locked ? .stopTake : .none
        case .doubleTap: return mayShootAlone(context) && context.allowsPhoto ? .photoToGallery : .none
        case .longPress: return mayShootAlone(context) && context.allowsVideo ? .filmToGallery : .none
        case .pinch: return .zoom
        case .drag: return context.holding ? .steerTake : .none
        }
    }

    private static func editing(zone: ComposerCaptureZone, gesture: ComposerCaptureGestureKind) -> ComposerCaptureAction {
        switch (zone, gesture) {
        case (.scene, .drag), (.scene, .pinch): return .reframe
        case (.otherThumbnail, .tap): return .select
        case (.rail, .tap): return .openFamily
        default: return .none
        }
    }
}
