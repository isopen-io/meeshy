import Foundation

/// #17323 — la loi pure qui choisit le traitement de verre de CHAQUE bouton de
/// l'appel (pilule, rangées du (…), panneaux, puces). Directive du porteur :
/// le Liquid Glass interactif l'emporte quand l'OS le permet
/// (iOS 26 et plus), le verre dessiné de `adaptiveLiquidGlass` le remplace
/// avant, et Fin reste rouge.
///
/// La vue (`CallButtonGlassModifier`) ne décide rien : elle applique ce que
/// cette loi rend, et la loi est testée sans écran.
enum CallButtonGlassSurface: Equatable {
    /// Un verre neutre : Liquid Glass (iOS 26+) ou verre dessiné (avant).
    case liquidGlass
    /// Le verre rouge de Fin : teinté sous iOS 26, rouge plein dessiné avant.
    case prominentRed
}

struct CallButtonGlassTreatment: Equatable {
    let surface: CallButtonGlassSurface
    /// Le verre réagit au doigt (iOS 26), comme celui de l'en-tête de conversation.
    let isInteractive: Bool
    /// Actif = disque blanc plein à icône sombre : le contraste de l'icône ne
    /// dépend jamais de la teinte que le verre voudrait bien prendre.
    let hasSolidWhiteBacking: Bool
    /// Avant iOS 26 le verre dessiné ne réagit pas seul : il s'éclaircit sous
    /// le doigt. Sous iOS 26 l'effet est celui du système, rien n'est dessiné.
    let drawsPressHighlight: Bool
}

enum CallButtonGlassRule {
    static func treatment(for kind: CallPillButtonKind, isLiquidGlassAvailable: Bool) -> CallButtonGlassTreatment {
        CallButtonGlassTreatment(
            surface: kind == .destructive ? .prominentRed : .liquidGlass,
            isInteractive: true,
            hasSolidWhiteBacking: kind == .active,
            drawsPressHighlight: !isLiquidGlassAvailable
        )
    }
}

/// L1.3 — l'état de « Sortie » dans la pilule. En appel vidéo le haut-parleur
/// démarre allumé d'office : c'est l'état de repos, la planche ne l'allume pas
/// (disque blanc = un choix de l'utilisateur, jamais le défaut). Un appareil
/// externe (AirPods, Bluetooth) reste un choix, donc actif.
enum CallOutputButtonRule {
    static func kind(isSpeaker: Bool, routesExternally: Bool, isVideoCall: Bool) -> CallPillButtonKind {
        guard !routesExternally else { return .active }
        return isSpeaker && !isVideoCall ? .active : .normal
    }
}
