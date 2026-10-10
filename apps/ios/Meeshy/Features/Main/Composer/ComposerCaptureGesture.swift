import Foundation

/// Où le doigt est tombé.
nonisolated enum ComposerCaptureZone: Equatable, Sendable {
    case scene
    case chosenThumbnail
    /// Le déclencheur simple de la bande repliée, sans look (#9557).
    case shutter
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

/// Le toucher précédent, et la zone où il est tombé : un double ne se fait
/// jamais d'une zone à l'autre.
nonisolated struct ComposerCaptureLastTap: Equatable, Sendable {
    let zone: ComposerCaptureZone
    let at: Date
}

/// Ce qu'un toucher produit, et la mémoire à garder pour le suivant : `nil`
/// quand il a fini un double — un troisième en ouvre un nouveau.
nonisolated struct ComposerCaptureTapOutcome: Equatable, Sendable {
    let action: ComposerCaptureAction
    let consumedDouble: Bool
    let memory: ComposerCaptureLastTap?
}

/// **La table des gestes de la capture** (#9351, spec § 3) — zone × geste ×
/// phase × verrou → action. Pure : la vue ne décide rien.
///
/// Un `doubleTap` n'est jamais reconnu par un `TapGesture(count: 2)`, qui
/// retarderait le toucher simple : c'est la règle du porteur
/// (`ComposerCaptureTapRule`, #9464) qui dit si un toucher est le second d'un
/// double — `tap(zone:context:now:lastTap:armedAt:)` la consulte, et la
/// session (`tapAction(at:)`) n'en est que la projection.
nonisolated enum ComposerCaptureGesture {

    static func action(zone: ComposerCaptureZone, gesture: ComposerCaptureGestureKind,
                       context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        if context.editing { return editing(zone: zone, gesture: gesture) }
        guard context.stage != .off else { return .none }
        switch zone {
        case .scene: return scene(gesture, context)
        case .chosenThumbnail: return chosen(gesture, context)
        case .shutter: return shutter(gesture, context)
        case .otherThumbnail: return gesture == .tap && !lookIsLocked(context) ? .select : .none
        case .rail: return gesture == .tap && !lookIsLocked(context) ? .openFamily : .none
        }
    }

    /// **Un rail qu'on ne peut pas ouvrir n'est pas montré** (porteur
    /// 2026-10-07, #9576) : il n'existe que si son toucher ouvre une famille —
    /// ni pendant une prise, ni tant que des segments en attente figent le look.
    static func offersRail(_ context: ComposerCaptureGestureContext) -> Bool {
        action(zone: .rail, gesture: .tap, context: context) == .openFamily
    }

    /// **Un toucher, lu par la règle du porteur** (#9464) — le SEUL décideur du
    /// toucher : le premier vise tout de suite ; le second, dans la fenêtre,
    /// après l'armement et DANS LA MÊME ZONE, est un double. Un double que la
    /// table refuse (segments en attente, format sans photo) reste un toucher :
    /// il vise encore. L'issue rend la mémoire à garder pour le toucher suivant.
    static func tap(zone: ComposerCaptureZone, context: ComposerCaptureGestureContext,
                    now: Date, lastTap: ComposerCaptureLastTap?, armedAt: Date?) -> ComposerCaptureTapOutcome {
        let precedent = lastTap.flatMap { $0.zone == zone ? $0.at : nil }
        let regle = ComposerCaptureTapRule.action(stage: context.stage, now: now, lastTapAt: precedent, armedAt: armedAt)
        let double = regle == .photo ? action(zone: zone, gesture: .doubleTap, context: context) : .none
        guard double == .none else {
            return ComposerCaptureTapOutcome(action: double, consumedDouble: true, memory: nil)
        }
        return ComposerCaptureTapOutcome(action: action(zone: zone, gesture: .tap, context: context),
                                         consumedDouble: false,
                                         memory: ComposerCaptureLastTap(zone: zone, at: now))
    }

    /// **Les équivalents VoiceOver** (#9351, contraintes globales § Accessibilité) :
    /// VoiceOver capte le double toucher et l'appui long, donc chaque zone offre
    /// ses prises en actions NOMMÉES, projetées de la table — jamais une liste
    /// réécrite à côté. Une prise lancée par VoiceOver tient sans doigt : en
    /// enregistrement, la scène et la miniature choisie offrent « Arrêter ».
    /// Les autres miniatures et le rail sont des boutons : leur activation suffit.
    static func accessibilityActions(zone: ComposerCaptureZone,
                                     context: ComposerCaptureGestureContext) -> [ComposerCaptureAction] {
        guard !context.editing, context.stage != .off else { return [] }
        switch zone {
        case .scene:
            guard context.stage == .armed else { return [.stopTake, .focus] }
            return [action(zone: .scene, gesture: .doubleTap, context: context),
                    action(zone: .scene, gesture: .longPress, context: context),
                    .focus].filter { $0 != .none }
        case .chosenThumbnail:
            guard context.stage == .armed else { return [.stopTake] }
            return [action(zone: .chosenThumbnail, gesture: .doubleTap, context: context),
                    action(zone: .chosenThumbnail, gesture: .longPress, context: context)].filter { $0 != .none }
        case .shutter:
            guard context.stage == .armed else { return [.stopTake] }
            return [action(zone: .shutter, gesture: .tap, context: context),
                    action(zone: .shutter, gesture: .longPress, context: context)].filter { $0 != .none }
        case .otherThumbnail, .rail:
            return []
        }
    }

    /// Le nom lu par VoiceOver ; `nil` pour une action qui n'est pas offerte.
    static func accessibilityName(of action: ComposerCaptureAction) -> String? {
        switch action {
        case .photoToEdit:
            return String(localized: "composer.capture.a11y.takePhoto", defaultValue: "Prendre une photo", bundle: .main)
        case .filmSegment:
            return String(localized: "composer.capture.a11y.film", defaultValue: "Filmer", bundle: .main)
        case .stopTake:
            return String(localized: "composer.capture.a11y.stop", defaultValue: "Arrêter", bundle: .main)
        case .focus:
            return String(localized: "composer.capture.a11y.focus", defaultValue: "Mettre au point", bundle: .main)
        case .photoToGallery:
            return String(localized: "composer.capture.a11y.photoToGallery", defaultValue: "Photo vers la galerie",
                          bundle: .main)
        case .filmToGallery:
            return String(localized: "composer.capture.a11y.videoToGallery", defaultValue: "Vidéo vers la galerie",
                          bundle: .main)
        case .none, .zoom, .steerTake, .close, .select, .openFamily, .reframe:
            return nil
        }
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

    /// **Le déclencheur simple fait ce que fait la scène, d'UN toucher** (#9557) :
    /// la photo s'ouvre en retouche, l'appui long filme un segment. Un bouton
    /// rond qui attendrait un double toucher ne serait pas un déclencheur.
    private static func shutter(_ gesture: ComposerCaptureGestureKind,
                                _ context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        switch gesture {
        case .tap:
            if context.stage == .recording { return context.locked ? .stopTake : .none }
            return mayShootAlone(context) && context.allowsPhoto ? .photoToEdit : .none
        case .doubleTap: return .none
        case .longPress: return context.stage == .armed && context.allowsVideo ? .filmSegment : .none
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
