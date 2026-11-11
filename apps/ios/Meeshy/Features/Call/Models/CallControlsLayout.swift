import CoreGraphics
import Foundation

/// #8394 — la vue d'appel « C adapté ». La pilule du bas porte toujours
/// `(…) · Micro · Sortie · Fin`. #8550 — le `(…)` range les actions par FAMILLE
/// (« Mon image », « L'appel »). #17327 — la disposition suit le nombre de
/// participants (`CallControlsDisposition`) : à deux, un rail par famille sur
/// les bords ; à plusieurs, une rangée légendée par famille dans la pilule.
/// #8578 — une seule chose à la fois : `CallScreenLayer`. La conversation n'est PAS une action : sa
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
    /// #8552 — capturer l'appel en une image montée, ou chaque visage. #9287 — c'est aussi
    /// là que se choisit le cadre en direct d'un duo : capture et cadre sont une seule fonction.
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
        let recording: [CallAction] = context.mayRecord ? [.recording] : []
        let add: [CallAction] = context.isConnected ? [.addPeople] : []
        let react: [CallAction] = context.isConnected ? [.react] : []
        let capture: [CallAction] = context.isConnected && context.showsVideo ? [.capture] : []
        let pip: [CallAction] = context.canPictureInPicture ? [.pictureInPicture] : []
        return [.captions] + recording + add + [.journal] + react + capture + pip
    }
}

// MARK: - #17327 — la disposition selon le nombre de participants

/// Le côté de l'écran où se pose le rail d'une famille. « Mon image » ouvre la
/// marche, « l'appel » la ferme : en écriture de droite à gauche, les rails
/// se retournent avec le reste de l'écran.
enum CallRailSide: Equatable, Sendable {
    case leading
    case trailing
}

extension CallActionFamily {
    var railSide: CallRailSide {
        switch self {
        case .myImage: return .leading
        case .theCall: return .trailing
        }
    }
}

/// #17327 — où se rangent les actions que `(…)` déploie.
/// - `rails` : à deux, un rail vertical par famille sur les bords de l'écran ;
///   la pilule ne grandit pas.
/// - `rows` : à plusieurs, deux rangées légendées DANS la pilule. Aucun rail
///   ne se pose par-dessus la grille : il masquerait des vignettes.
/// La disposition est une fonction du nombre de participants, jamais un état :
/// le passage de deux à trois en cours d'appel change la forme, pas l'état du
/// `(…)` (`CallScreenLayer`).
enum CallControlsDisposition: Equatable, Sendable {
    case rails
    case rows

    static let maxParticipantsOnRails = 2

    /// `showsGroupGrid` : la grille de groupe est à l'écran (#9085 : elle remplace
    /// l'écran 1:1 dès qu'un membre est tenu par le maillage, même à deux).
    static func resolve(participantCount: Int, showsGroupGrid: Bool = false) -> CallControlsDisposition {
        showsGroupGrid || participantCount > maxParticipantsOnRails ? .rows : .rails
    }

    /// Les rails à l'écran : ceux que le `(…)` ouvert fait sortir. Enregistrer et
    /// Réagir s'ouvrent dans la pilule (`CallScreenPanel.isDrawnInThePill`) : les
    /// rails leur cèdent la place.
    func railRows(_ set: CallActionSet, layer: CallScreenLayer) -> [CallActionFamilyRow] {
        guard self == .rails, layer.showsFamilyRows else { return [] }
        return set.familyRows
    }

    /// Les rangées légendées que le `(…)` ouvert déplie dans la pilule.
    func pillRows(_ set: CallActionSet, layer: CallScreenLayer) -> [CallActionFamilyRow] {
        guard self == .rows, layer.showsFamilyRows else { return [] }
        return set.familyRows
    }

    /// La pilule grandit pour une option qu'elle contient, et, en groupe, pour
    /// ses rangées. À deux, `(…)` seul ne la fait pas grandir.
    func unfoldsPill(for layer: CallScreenLayer) -> Bool {
        layer.pillPanel != nil || (self == .rows && layer.showsFamilyRows)
    }
}

/// #17327 — la géométrie des rails : des boutons de 44 pt dans une capsule de
/// verre, à `edgeInset` du bord (zone sûre en plus), centrée verticalement.
enum CallRailsLayout {
    static let buttonSide: CGFloat = 44
    static let buttonSpacing: CGFloat = 8
    static let padding: CGFloat = 8
    static let edgeInset: CGFloat = 8
    static let pillMaxWidth: CGFloat = CallPillWidth.resting
    static let pillSidePadding: CGFloat = 16
    static let pillHeight: CGFloat = 68
    static let pillGap: CGFloat = 8

    static var railWidth: CGFloat { buttonSide + 2 * padding }

    /// Ce que les rails laissent libre au pied de l'écran : rien quand la pilule
    /// tient ENTRE eux (paysage, tablette) — ils se centrent alors sur toute la
    /// hauteur —, la hauteur de la pilule quand elle occupe leur colonne (portrait).
    static func bottomClearance(containerWidth: CGFloat, safeHorizontal: CGFloat) -> CGFloat {
        let pillWidth = min(pillMaxWidth, containerWidth - 2 * pillSidePadding)
        let between = containerWidth - 2 * (safeHorizontal + edgeInset + railWidth)
        return between >= pillWidth ? 0 : pillHeight + pillGap
    }

    /// La translation d'un rail HORS de l'écran : vers son bord, le sien
    /// (« mon image » ouvre la marche, « l'appel » la ferme), retourné en
    /// écriture de droite à gauche.
    static func slideOffset(side: CallRailSide, isRightToLeft: Bool, safeHorizontal: CGFloat) -> CGFloat {
        let travel = railWidth + edgeInset + safeHorizontal
        let towardsLeft = (side == .leading) != isRightToLeft
        return towardsLeft ? -travel : travel
    }
}
