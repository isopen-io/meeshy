import Foundation

/// #8394 — la vue d'appel « C adapté ». La pilule du bas porte toujours
/// `(…) · Micro · Sortie · Fin` ; le `(…)` déploie les autres actions, en deux
/// rails de verre aux bords en duo, en deux rangées légendées dans la même
/// pilule en groupe. Ce fichier tient les RÈGLES (quelles actions, où, quand) ;
/// les vues ne font que les dessiner.

/// Une action déployée par le `(…)`.
enum CallAction: String, CaseIterable, Sendable {
    case camera
    case flipCamera
    case cameraPicker
    case effects
    case screenShare
    case captions
    case recording
    case pictureInPicture
    case messages
}

/// Ce que l'appel permet, lu une fois par rendu depuis `CallManager`.
struct CallActionContext: Equatable, Sendable {
    let isOnMac: Bool
    let isVideoEnabled: Bool
    /// Plusieurs caméras choisissables (Mac, iPad avec caméra externe) : le
    /// sélecteur remplace le simple « Retourner ».
    let hasSelectableCameras: Bool
    let isConnected: Bool
    let mayRecord: Bool
    let canPictureInPicture: Bool
    let hasConversation: Bool
}

/// Les deux groupes d'actions : le rail GAUCHE agit sur « mon image », le rail
/// DROIT sur « l'appel ». En groupe, ce sont les deux rangées, dans cet ordre.
struct CallActionSet: Equatable, Sendable {
    static let maxPerRow = 4

    let myImage: [CallAction]
    let theCall: [CallAction]

    static func resolve(_ context: CallActionContext) -> CallActionSet {
        CallActionSet(myImage: myImageActions(context), theCall: theCallActions(context))
    }

    private static func myImageActions(_ context: CallActionContext) -> [CallAction] {
        let camera: [CallAction] = [.camera]
        let orientation: [CallAction] = {
            guard context.isVideoEnabled else { return [] }
            if context.hasSelectableCameras { return [.cameraPicker] }
            return context.isOnMac ? [] : [.flipCamera]
        }()
        let effects: [CallAction] = context.isVideoEnabled ? [.effects] : []
        let screen: [CallAction] = !context.isOnMac && context.isConnected ? [.screenShare] : []
        return camera + orientation + effects + screen
    }

    private static func theCallActions(_ context: CallActionContext) -> [CallAction] {
        let recording: [CallAction] = context.mayRecord ? [.recording] : []
        let pip: [CallAction] = context.canPictureInPicture ? [.pictureInPicture] : []
        let messages: [CallAction] = context.hasConversation ? [.messages] : []
        return [.captions] + recording + pip + messages
    }
}

/// Comment les actions déployées se dessinent.
enum CallActionsPresentation: Equatable, Sendable {
    /// `(…)` replié : la pilule seule.
    case hidden
    /// Duo : deux rails verticaux aux bords, à mi-hauteur.
    case rails
    /// Groupe : la pilule grandit vers le haut, deux rangées légendées.
    case rows
}

/// L'état du `(…)` — replié par défaut : l'écran d'appel s'ouvre sur l'image
/// et les quatre commandes essentielles.
struct CallControlsDisclosure: Equatable, Sendable {
    enum AccessibilityState: Equatable, Sendable {
        case collapsed
        case expanded
    }

    let isExpanded: Bool

    init(isExpanded: Bool = false) {
        self.isExpanded = isExpanded
    }

    func toggled() -> CallControlsDisclosure {
        CallControlsDisclosure(isExpanded: !isExpanded)
    }

    func presentation(isGroup: Bool) -> CallActionsPresentation {
        guard isExpanded else { return .hidden }
        return isGroup ? .rows : .rails
    }

    var accessibilityState: AccessibilityState {
        isExpanded ? .expanded : .collapsed
    }
}
