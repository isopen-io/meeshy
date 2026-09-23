import SwiftUI
import MeeshySDK
import MeeshyUI

/// La protection qui DONNE SA COULEUR à la barre du composeur (#7667).
///
/// Directive porteur 2026-09-24 : « l'universal bar adopte la couleur de
/// l'effet le plus impactant éphémère > vue unique > flou […] Le message ne
/// peut pas être flou et vue unique ! »
///
/// La barre relisait jusqu'ici un accent substitué par son HÔTE
/// (`ConversationView.composerAccent`) : l'éphémère y virait au rouge
/// d'erreur, le flou à l'indigo de traçage, la vue unique à rien du tout — et
/// les quatre autres hôtes de la barre (commentaires, story, réponse à un
/// média) ne substituaient rien. La décision vit désormais ICI, lue par la
/// barre elle-même depuis ses propres bascules : aucun hôte ne peut l'oublier.
///
/// **Une protection a UNE couleur partout** : la teinte est le jeton d'état
/// que le fil peint sur la capsule de la même protection
/// (`MessageProtectionChrome.presentation`, #7599) — orange éphémère, violet
/// vue unique, gris flou.
enum ComposerProtection: Equatable, CaseIterable {
    case ephemeral
    case viewOnce
    case blurred

    /// La protection la plus forte parmi celles qui sont armées, ou `nil`.
    static func dominant(ephemeral: Bool, viewOnce: Bool, blurred: Bool) -> ComposerProtection? {
        if ephemeral { return .ephemeral }
        if viewOnce { return .viewOnce }
        if blurred { return .blurred }
        return nil
    }

    var tintHex: String {
        switch self {
        case .ephemeral: return MeeshyColors.stateEphemeralHex
        case .viewOnce: return MeeshyColors.stateViewOnceHex
        case .blurred: return MeeshyColors.stateConcealedHex
        }
    }

    var tint: Color {
        switch self {
        case .ephemeral: return MeeshyColors.stateEphemeral
        case .viewOnce: return MeeshyColors.stateViewOnce
        case .blurred: return MeeshyColors.stateConcealed
        }
    }

    /// L'accent que la barre sert : celui de l'hôte sans protection, la
    /// teinte de la protection sur LES DEUX arrêts du dégradé sinon — un
    /// second arrêt resté à l'accent de la conversation donnerait un dégradé
    /// hybride qui a l'air d'un bug de teinte plutôt que d'un état voulu.
    static func servedAccent(
        for protection: ComposerProtection?,
        hostAccent: String,
        hostSecondary: String
    ) -> (primary: String, secondary: String) {
        guard let protection else { return (hostAccent, hostSecondary) }
        return (protection.tintHex, protection.tintHex)
    }

    /// Bascule d'un VOILE (flou ou vue unique) : allumer l'un éteint l'autre.
    /// L'éphémère n'est pas un voile — il cohabite avec les deux, et le
    /// passer ici ne change rien.
    static func togglingVeil(
        _ veil: ComposerProtection,
        blurred: Bool,
        viewOnce: Bool
    ) -> (blurred: Bool, viewOnce: Bool) {
        switch veil {
        case .blurred:
            let next = !blurred
            return (next, next ? false : viewOnce)
        case .viewOnce:
            let next = !viewOnce
            return (next ? false : blurred, next)
        case .ephemeral:
            return (blurred, viewOnce)
        }
    }

    /// Ce que le lecteur d'écran entend du champ quand la barre est teintée :
    /// la couleur ne se voit pas, l'état doit se dire.
    var accessibilityState: String {
        switch self {
        case .ephemeral:
            return String(localized: "composer.protection.ephemeral.state", defaultValue: "Mode éphémère actif", bundle: .main)
        case .viewOnce:
            return String(localized: "composer.viewonce.active", defaultValue: "Mode vue unique actif", bundle: .main)
        case .blurred:
            return String(localized: "composer.blur.active", defaultValue: "Mode flou actif", bundle: .main)
        }
    }
}
