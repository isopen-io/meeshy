import CoreGraphics
import MeeshySDK

/// **Où vont les contrôles du compositeur de story** (#13839, L6, spec iOS § 2.5).
///
/// Posés SUR la scène (`overlay`, le téléphone tenu droit), ou rangés dans deux rails libellés de part et d'autre
/// d'elle (`rails`, iPad, Split View 2/3, fenêtre Stage Manager assez large, téléphone couché). Le conteneur racine
/// décide, jamais la classe de taille ni le modèle d'appareil : en rails, la scène est le plus grand 9:16 qui tient
/// en HAUTEUR une fois Publier posé sous elle et les marges déduits ; s'il reste à côté d'elle la place de deux rails
/// et de leurs marges, on les pose. Une hystérésis empêche un redimensionnement de faire clignoter la disposition.
///
/// Jumelle Android : `ComposerSceneArrangement` (`apps/android/core/model/.../composer`), mêmes valeurs en dp.
nonisolated enum ComposerSceneArrangement: Equatable, Sendable {
    case overlay
    case rails

    static let railWidth: CGFloat = 112
    static let margin: CGFloat = 16
    /// Publier sous la scène : une cible de 44 pt, son écart à la scène et à la zone du geste d'accueil.
    static let publishReserve: CGFloat = 56
    static let hysteresis: CGFloat = 16
    static let threshold: CGFloat = 2 * railWidth + 2 * margin
    static let minimumPublishWidth: CGFloat = 300
    /// La rangée des diapos, posée au-dessus de la scène dès deux diapos : 44 pt et son écart.
    static let slideRowReserve: CGFloat = 52

    private static let ratio: CGFloat = SceneShape.aspect

    static func railsSceneHeight(height: CGFloat) -> CGFloat {
        max(0, height - publishReserve - 2 * margin)
    }

    static func freeWidth(width: CGFloat, height: CGFloat) -> CGFloat {
        width - min(width, railsSceneHeight(height: height) * ratio)
    }

    /// `previous` : la disposition en place, que l'hystérésis retient tant que le conteneur ne passe pas franchement
    /// le seuil.
    static func resolve(width: CGFloat, height: CGFloat,
                        previous: ComposerSceneArrangement? = nil) -> ComposerSceneArrangement {
        guard width.isFinite, height.isFinite, railsSceneHeight(height: height) > 0 else { return .overlay }
        let seuil = previous == .rails ? threshold - hysteresis : threshold
        return freeWidth(width: width, height: height) >= seuil ? .rails : .overlay
    }

    /// **Le repli de Dynamic Type** : aux tailles d'accessibilité, un libellé ne tient plus dans 112 pt ; la
    /// scène reprend ses contrôles en surimpression, qui ont chacun leur libellé VoiceOver.
    static func served(width: CGFloat, height: CGFloat, previous: ComposerSceneArrangement?,
                       accessibilityText: Bool) -> ComposerSceneArrangement {
        accessibilityText ? .overlay : resolve(width: width, height: height, previous: previous)
    }

    /// Publier se pose sous la scène, à sa largeur ou au moins à 300 pt, sans jamais déborder sur un rail.
    static func publishWidth(width: CGFloat, height: CGFloat) -> CGFloat {
        let colonne = max(0, width - 2 * (railWidth + margin))
        let scene = railsSceneHeight(height: height) * ratio
        return min(colonne, max(scene, minimumPublishWidth))
    }

    /// La colonne de la scène, entre les deux rails : là où vivent la scène, la rangée des diapos et les feuilles.
    static func columnWidth(width: CGFloat) -> CGFloat {
        max(0, width - 2 * (railWidth + margin))
    }
}
