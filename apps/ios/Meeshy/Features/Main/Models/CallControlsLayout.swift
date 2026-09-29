import Foundation

/// #8394 — la vue d'appel « C adapté ». La pilule du bas porte toujours
/// `(…) · Micro · Sortie · Fin`. #8550 — le `(…)` empile AU-DESSUS de la
/// rangée de base une rangée PAR FAMILLE (« Mon image », « L'appel »), chacune
/// défilant à l'horizontale, en duo comme en groupe. #8578 — une seule chose à
/// la fois : `CallScreenLayer`. La conversation n'est PAS une action : sa
/// seule porte est le bouton de l'en-tête (#8436). Ce fichier tient les RÈGLES
/// (quelles actions, où, quand) ; les vues ne font que les dessiner.

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
    /// #8433 — faire sonner un ami dans l'appel en cours.
    case addPeople
    /// #8439 — envoyer une réaction à tout l'appel.
    case react
    /// #8552 — capturer l'appel en une image montée, ou chaque visage.
    case capture
    case journal
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
    let showsVideo: Bool

    init(
        isOnMac: Bool,
        isVideoEnabled: Bool,
        hasSelectableCameras: Bool,
        isConnected: Bool,
        mayRecord: Bool,
        canPictureInPicture: Bool,
        showsVideo: Bool? = nil
    ) {
        self.isOnMac = isOnMac
        self.isVideoEnabled = isVideoEnabled
        self.hasSelectableCameras = hasSelectableCameras
        self.isConnected = isConnected
        self.mayRecord = mayRecord
        self.canPictureInPicture = canPictureInPicture
        self.showsVideo = showsVideo ?? isVideoEnabled
    }
}

/// Une famille d'actions : « mon image » agit sur ce que j'envoie, « l'appel »
/// sur l'appel lui-même.
enum CallActionFamily: String, CaseIterable, Sendable {
    case myImage
    case theCall
}

/// Une rangée de la pilule : une famille, ses actions dans l'ordre, défilant
/// à l'horizontale.
struct CallActionFamilyRow: Equatable, Identifiable, Sendable {
    let family: CallActionFamily
    let actions: [CallAction]

    var id: CallActionFamily { family }
}

struct CallActionSet: Equatable, Sendable {
    let myImage: [CallAction]
    let theCall: [CallAction]

    var familyRows: [CallActionFamilyRow] {
        [CallActionFamilyRow(family: .myImage, actions: myImage), CallActionFamilyRow(family: .theCall, actions: theCall)]
            .filter { !$0.actions.isEmpty }
    }

    func contains(_ action: CallAction) -> Bool {
        myImage.contains(action) || theCall.contains(action)
    }

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
        let together: [CallAction] = context.isConnected ? [.addPeople, .react] : []
        let capture: [CallAction] = context.isConnected && context.showsVideo ? [.capture] : []
        let recording: [CallAction] = context.mayRecord ? [.recording] : []
        let pip: [CallAction] = context.canPictureInPicture ? [.pictureInPicture] : []
        return [.captions, .journal] + together + capture + recording + pip
    }
}
