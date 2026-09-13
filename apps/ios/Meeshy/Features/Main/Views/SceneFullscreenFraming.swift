import CoreGraphics
import MeeshySDK
import MeeshyUI

/// **Le ratio auquel une scène se cadre en plein écran.**
///
/// ## Ce que cette loi ferme
///
/// Retour porteur du 2026-09-13 : « lorsqu'on touche un média pour le mettre en
/// plein écran, ça zoome trop au point où on ne voit plus tout le contenu ».
///
/// `SocialSceneFullscreenView` posait `.aspectRatio(9.0 / 16.0, contentMode:
/// .fit)` — un LITTÉRAL. Une scène composée en paysage y était ajustée dans une
/// boîte portrait : son contenu, dessiné pour du 16:9, débordait le cadre et
/// ses bords sortaient de l'écran. Un `.fit` sur le mauvais ratio ne protège de
/// rien — il ajuste fidèlement à une forme qui n'est pas celle du contenu.
///
/// ## La loi existait déjà, sur l'autre surface
///
/// `StoryViewerView.readerCanvasRatio` cadre au ratio RÉEL depuis toujours, et
/// son doc-comment l'écrit : « une story v3-native se peint elle aussi dans son
/// cadre RÉEL, pas systématiquement en 9:16 […] un fond paysage composé
/// nativement en v3 garde donc son 16:9 ; seule une scène qui n'a jamais porté
/// de `carrierAspect` retombe sur le défaut portrait — et c'est alors le bon
/// rendu ».
///
/// Deux surfaces peignent le même document ; une seule suivait la loi. Ce
/// fichier en fait un site UNIQUE, pour que la prochaine surface n'ait pas à
/// la redécouvrir — ni à la contredire.
///
/// ## Pourquoi le littéral était invisible
///
/// Parce qu'il rend le BON cadre pour le cas le plus fréquent. Une scène sans
/// `carrierAspect` EST portrait ; le défaut ne se manifeste que sur la minorité
/// paysage ou carrée. Un défaut qui n'apparaît pas sur le cas nominal ne se
/// trouve pas en relecture — il se trouve à l'usage.
/// `nonisolated` : un moteur de règles SANS ÉTAT est un atome, et la cible app
/// compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` — sans ce mot, la
/// loi ne serait interrogeable que depuis le thread principal, donc pas depuis
/// une suite non isolée. Même déclaration que `MediaStageFraming`.
nonisolated enum SceneFullscreenFraming {

    /// Le ratio (largeur / hauteur) d'une scène.
    ///
    /// `carrierAspect` est le ratio du PORTEUR d'origine, logé par le composer
    /// à l'écriture et restauré par la migration v3 ; son absence signifie
    /// « aucun autre porteur que sa scène », donc portrait.
    ///
    /// Une valeur non finie ou non positive retombe elle aussi sur le portrait :
    /// `aspectRatio(_:contentMode:)` diviserait par zéro, et un cadre qui ne se
    /// peint pas est pire qu'un cadre au mauvais ratio.
    static func ratio(of scene: SceneV3) -> CGFloat {
        guard let carrier = scene.carrierAspect,
              carrier.isFinite, carrier > 0 else { return CanvasGeometry.portraitRatio }
        return CGFloat(carrier)
    }

    /// Le ratio de la scène d'INDEX donné, ou le portrait si l'index sort du
    /// document — un pager monte ses voisines, et une page hors bornes existe
    /// le temps d'une transition.
    static func ratio(of document: CanvasV3, sceneIndex: Int) -> CGFloat {
        guard document.scenes.indices.contains(sceneIndex) else {
            return CanvasGeometry.portraitRatio
        }
        return ratio(of: document.scenes[sceneIndex])
    }
}
