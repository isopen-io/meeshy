import Foundation

/// #8394 — la vue d'appel « C adapté ». La pilule du bas porte toujours
/// `(…) · Micro · Sortie · Fin` ; le `(…)` déploie les autres actions
/// AU-DESSUS de la pilule (#8432) : une rangée de boutons de verre en duo, deux
/// rangées légendées en groupe. La conversation n'est PAS une action : sa
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
}

/// Les deux groupes d'actions : le premier agit sur « mon image », le second
/// sur « l'appel ». En groupe, ce sont les deux rangées légendées, dans cet
/// ordre ; en duo, la rangée les enchaîne.
struct CallActionSet: Equatable, Sendable {
    static let maxPerRow = 4

    let myImage: [CallAction]
    let theCall: [CallAction]

    /// Duo (#8432) : les actions tiennent sur UNE rangée au-dessus de la
    /// pilule tant qu'elle ne dépasse pas cinq boutons de 44 pt (l'écran le
    /// plus étroit, marges comprises) ; au-delà, « mon image » puis « l'appel ».
    static let maxPerDuoRow = 5

    var duoRows: [[CallAction]] {
        let all = myImage + theCall
        guard all.count > Self.maxPerDuoRow else { return [all] }
        return [myImage, theCall].filter { !$0.isEmpty }
    }

    /// Groupe : chaque groupe légendé se coupe en rangées de quatre colonnes
    /// au plus ; une rangée de trop continue sous le même titre.
    var groupSections: [CallActionSection] {
        [CallActionSection(group: .myImage, actions: myImage), CallActionSection(group: .theCall, actions: theCall)]
            .filter { !$0.rows.isEmpty }
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
        let recording: [CallAction] = context.mayRecord ? [.recording] : []
        let pip: [CallAction] = context.canPictureInPicture ? [.pictureInPicture] : []
        let together: [CallAction] = context.isConnected ? [.addPeople, .react] : []
        return [.captions] + together + recording + pip
    }
}

struct CallActionSection: Equatable, Sendable {
    enum Group: Equatable, Sendable {
        case myImage
        case theCall
    }

    let group: Group
    let rows: [[CallAction]]

    init(group: Group, actions: [CallAction]) {
        self.group = group
        rows = stride(from: 0, to: actions.count, by: CallActionSet.maxPerRow).map {
            Array(actions[$0 ..< min($0 + CallActionSet.maxPerRow, actions.count)])
        }
    }
}

/// Comment les actions déployées se dessinent.
enum CallActionsPresentation: Equatable, Sendable {
    /// `(…)` replié : la pilule seule.
    case hidden
    /// Duo : une rangée de boutons de verre au-dessus de la pilule.
    case row
    /// Groupe : deux rangées légendées au-dessus de la pilule.
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
        return isGroup ? .rows : .row
    }

    var accessibilityState: AccessibilityState {
        isExpanded ? .expanded : .collapsed
    }
}
