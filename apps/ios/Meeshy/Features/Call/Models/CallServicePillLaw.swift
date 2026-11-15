import Foundation

/// L'avis discret sur ma vidéo, miroir de Android `CallVideoNotice` : image réduite pour laisser
/// refroidir le téléphone, ou lumière insuffisante.
nonisolated enum CallVideoNotice: Equatable, Sendable {
    case none
    case reduced
    case lowLight

    /// Mêmes vecteurs que Android `CallThermalPlanTest` : la chaleur qui coupe les effets avancés
    /// (`serious`, `critical`) réduit l'image, et passe avant la lumière.
    static func of(thermal: ProcessInfo.ThermalState, isLowLight: Bool) -> CallVideoNotice {
        switch thermal {
        case .serious, .critical: return .reduced
        default: return isLowLight ? .lowLight : .none
        }
    }
}

/// Ce que la loi des pastilles de service lit de l'appel : `isOnHold` est l'attente imposée par le
/// système (CallKit, `CXSetHeldCallAction`), `videoNotice` vient de `CallVideoNotice.of`.
nonisolated struct CallServicePillSignals: Equatable, Sendable {
    let isConnectedLayout: Bool
    let isPictureInPicture: Bool
    let isOnHold: Bool
    let isVideoCall: Bool
    let isCameraOn: Bool
    let videoNotice: CallVideoNotice
}

/// Les pastilles de service montrées : « En attente » (E3) et l'avis sur ma vidéo (E4).
nonisolated struct CallServicePills: Equatable, Sendable {
    let isHoldShown: Bool
    let videoNotice: CallVideoNotice

    static let none = CallServicePills(isHoldShown: false, videoNotice: .none)

    /// Les maillons qu'elles occupent dans la pile des bannières du haut.
    var banners: Set<CallTopBanner> {
        var banners: Set<CallTopBanner> = []
        if isHoldShown { banners.insert(.hold) }
        if videoNotice != .none { banners.insert(.videoNotice) }
        return banners
    }
}

/// #18227 · #18215 — quand les pastilles de service se montrent (planche E3 · E4), miroir de Android
/// `CallServicePillLaw`, mêmes vecteurs nommés :
/// - « En attente » dès que l'appel est en attente, quel que soit l'écran : c'est elle qui dit
///   pourquoi on n'entend plus rien ;
/// - « Vidéo réduite / Faible lumière » seulement sur l'appel établi à l'écran, en vidéo, caméra
///   allumée, hors image dans l'image.
nonisolated enum CallServicePillLaw {
    static func of(_ signals: CallServicePillSignals) -> CallServicePills {
        CallServicePills(isHoldShown: signals.isOnHold, videoNotice: showsVideoNotice(signals) ? signals.videoNotice : .none)
    }

    private static func showsVideoNotice(_ signals: CallServicePillSignals) -> Bool {
        signals.isConnectedLayout && !signals.isPictureInPicture && signals.isVideoCall && signals.isCameraOn
    }
}
