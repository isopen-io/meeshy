import SwiftUI

/// Ce que le survol au pointeur peint pour un état : l'échelle du soulèvement,
/// l'opacité de l'anneau et celle de l'ombre portée, et si le pointeur
/// s'aimante sur la forme de la commande.
public nonisolated struct MeeshyPointerLiftPaint: Sendable, Equatable {
    public let scale: CGFloat
    public let ringOpacity: Double
    public let shadowOpacity: Double
    public let magnetizes: Bool

    public init(scale: CGFloat, ringOpacity: Double, shadowOpacity: Double, magnetizes: Bool) {
        self.scale = scale
        self.ringOpacity = ringOpacity
        self.shadowOpacity = shadowOpacity
        self.magnetizes = magnetizes
    }
}

/// **Le survol au pointeur de K23, en VALEURS** (planche iPad-Split, bouton
/// « Itinéraire ») : la commande survolée se soulève (1,08), se cerne d'un anneau
/// de 7 pt à la teinte de l'hôte (20 %) et porte une ombre de cette teinte
/// (décalée de 14, flou 34, 50 %). K02, K32 et K40 l'appliquent par
/// `meeshyPointerLift` ; aucune ne la redessine.
///
/// Sous « réduire les animations » (K26), rien ne bouge : ni soulèvement, ni
/// ombre qui le suggère, ni fondu, ni aimantation. L'anneau, immobile, dit
/// seul que la commande est sous le pointeur. Éteinte, une commande ne répond
/// pas au pointeur.
public nonisolated enum MeeshyPointerLiftRecipe {
    public static let liftScale: CGFloat = 1.08
    public static let ringWidth: CGFloat = 7
    public static let ringOpacity = 0.2
    /// Le flou de la planche (CSS) ; SwiftUI prend un rayon de moitié.
    public static let shadowBlur: CGFloat = 34
    public static let shadowRadius: CGFloat = 17
    public static let shadowOffsetY: CGFloat = 14
    public static let shadowOpacity = 0.5
    public static let fadeIn = 0.15
    public static let fadeOut = 0.1

    public static func paint(isHovered: Bool, isEnabled: Bool, reduceMotion: Bool) -> MeeshyPointerLiftPaint {
        let lit = isHovered && isEnabled
        return MeeshyPointerLiftPaint(
            scale: lit && !reduceMotion ? liftScale : 1,
            ringOpacity: lit ? ringOpacity : 0,
            shadowOpacity: lit && !reduceMotion ? shadowOpacity : 0,
            magnetizes: magnetizes(isEnabled: isEnabled, reduceMotion: reduceMotion)
        )
    }

    /// L'aimantation iPadOS ne dépend pas du survol : elle est posée sur la
    /// forme dès que la commande répond, et retirée sous « réduire les animations ».
    public static func magnetizes(isEnabled: Bool, reduceMotion: Bool) -> Bool {
        isEnabled && !reduceMotion
    }

    /// Le fondu : 150 ms à l'apparition, 100 ms au retrait, aucun sous « réduire les animations ».
    public static func fade(appearing: Bool, reduceMotion: Bool) -> Animation? {
        MeeshyMotion.animation(.easeOut(duration: appearing ? fadeIn : fadeOut), reduce: reduceMotion)
    }
}
