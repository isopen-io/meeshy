import Foundation

/// **Jusqu'où un objet de scène grandit et rapetisse** — une borne, deux
/// gestes (#4722).
///
/// ## Pourquoi une règle plutôt qu'un littéral
///
/// Le pinch du canvas UIKit clampait en toutes lettres — `max(0.3, min(4.0,
/// …))`, au milieu d'un `case .changed` — et c'était le seul geste qui
/// redimensionnait un objet. La puce audio en ajoute un SECOND, en SwiftUI,
/// sur un objet que le canvas ne saisit pas
/// (`StoryCanvasUIView+Manipulation.manipulable` exclut `.audio`).
///
/// Deux gestes qui bornent la même grandeur avec deux littéraux se
/// ressemblent le jour où on les écrit et divergent au premier ajustement de
/// l'un. Le témoin qui l'attraperait n'existerait pas : chacun est juste
/// vis-à-vis de lui-même.
///
/// > Ce que deux sites partagent n'est pas leur GESTE — l'un est un
/// > `UIPinchGestureRecognizer`, l'autre un `MagnificationGesture` — mais la
/// > grandeur qu'ils bornent. C'est elle qui a un site unique.
///
/// ## Les bornes, et ce qu'elles protègent
///
/// `0.3` en bas : sous ce facteur une puce de 40 pt tombe à 12 pt — moins que
/// la moitié d'une cible tactile, donc un objet qu'on ne peut plus reprendre.
/// La borne basse n'est pas esthétique, elle garde le geste de retour.
///
/// `4.0` en haut : au-delà, un objet couvre la scène entière et masque ce
/// qu'il commente. Reprises telles quelles du pinch UIKit — ce lot ne change
/// aucun comportement existant, il donne un nom à celui qui était écrit.
public nonisolated enum SceneObjectScalePolicy {

    public static let minScale: Double = 0.3
    public static let maxScale: Double = 4.0

    /// L'échelle retenue pour `base` multipliée par le facteur du geste.
    ///
    /// Prend les DEUX termes plutôt que le produit déjà fait : un appelant qui
    /// multiplie lui-même peut dépasser puis revenir, et le clamp appliqué
    /// après coup ne rattrape pas un `base` déjà hors bornes. Ici la
    /// composition et la borne sont le même appel.
    public static func settled(base: Double, gestureScale: Double) -> Double {
        clamped(base * gestureScale)
    }

    /// La borne seule, pour ce qui lit une échelle déjà écrite — un modèle
    /// ancien, une charge décodée — plutôt que pour un geste en cours.
    ///
    /// **Un `scale` de zéro ou négatif ne se ramène pas à la borne basse, il
    /// se ramène à l'IDENTITÉ.** Zéro fait disparaître l'objet et un négatif
    /// le retourne : ni l'un ni l'autre n'est une petite taille, ce sont des
    /// valeurs qu'aucun geste ne produit. Les clamper à `0.3` rendrait
    /// visible, minuscule et impossible à saisir un objet dont la valeur est
    /// simplement corrompue.
    public static func clamped(_ scale: Double) -> Double {
        guard scale > 0, scale.isFinite else { return 1 }
        return min(maxScale, max(minScale, scale))
    }
}
