import Foundation
import MeeshySDK

/// **Ce qu'on peut dire d'UN objet de la scène, sans rien rendre** (#4063).
///
/// ## Pourquoi ces trois prédicats sortent de la vue
///
/// Ils vivaient sur `StoryCanvasUIView`, où ils servaient le menu d'appui long.
/// Le rail *trailing* pose EXACTEMENT les mêmes questions — l'objet est-il
/// verrouillé, est-il au fond, a-t-il un frère de plan — pour offrir les mêmes
/// actions dans une autre géographie.
///
/// Les recopier côté app aurait fait deux implémentations d'une même règle, et
/// c'est le genre de divergence qu'aucun témoin ne voit : chaque copie reste
/// cohérente avec elle-même, et le menu se met à offrir « Monter » là où le
/// rail ne l'offre plus. La règle est donc PURE et partagée ; la vue n'en garde
/// que des projections d'une ligne.
///
/// **Elle ne dépend d'aucune vue** : une `StorySlide` suffit. C'est ce qui la
/// rend testable sans UIKit, et utilisable par un hôte SwiftUI qui n'a jamais
/// vu le canvas.
public nonisolated enum StorySceneObjectPredicates {

    /// Le VERROU — le badge d'attribution d'une republication est le seul
    /// porteur de `StoryTextObject.isLocked`. Il interdit tout ce qui retire ou
    /// dénature l'attribution : édition, duplication, suppression, sortie de
    /// scène. L'empilement lui reste : il ne touche pas au contenu.
    public static func isLocked(slide: StorySlide, id: String) -> Bool {
        slide.effects.textObjects.first(where: { $0.id == id })?.isLocked == true
    }

    /// Un objet du plan `background`. **Deux places** y vivent — un visuel ET un
    /// son (#4052) —, d'où les deux lectures.
    public static func isBackground(slide: StorySlide, id: String) -> Bool {
        slide.effects.mediaObjects?.first(where: { $0.id == id })?.isBackground == true
            || slide.effects.audioPlayerObjects?.first(where: { $0.id == id })?.isBackground == true
    }

    /// **Cet objet a-t-il une source à ROGNER ?** (#4082)
    ///
    /// Une image et un texte n'en ont pas : ils n'ont pas de temps propre, et
    /// leur durée sur la scène se règle par la timeline de la slide, pas par
    /// une fenêtre dans un fichier. Une vidéo et un son, si.
    ///
    /// Le prédicat interroge le MODÈLE et non un type d'UI, pour la même raison
    /// que ses voisins : c'est ce qu'un objet ADMET, distinct de ce qu'un hôte
    /// SAIT FAIRE — cette seconde moitié reste app-side, dans le jeu `served`.
    public static func hasTrimmableSource(slide: StorySlide, id: String) -> Bool {
        if slide.effects.mediaObjects?.contains(where: { $0.id == id && $0.kind == .video }) == true {
            return true
        }
        return slide.effects.audioPlayerObjects?.contains(where: { $0.id == id }) == true
    }

    /// **Un FRÈRE de plan, tous types confondus.**
    ///
    /// L'empilement raisonne sur les `zIndex` de TOUS les éléments — c'est ce
    /// que `bringForward` fait, et ce que le rendu trie. Compter les seuls
    /// médias dirait « seul » d'un objet posé sous un texte, et retirerait une
    /// action qui a bel et bien un effet.
    public static func sharesPlaneWithAnother(slide: StorySlide, besides id: String) -> Bool {
        let effets = slide.effects
        var voisins = 0
        for objet in effets.mediaObjects ?? [] where objet.id != id && objet.isBackground != true {
            voisins += 1
        }
        for objet in effets.audioPlayerObjects ?? [] where objet.id != id && objet.isBackground != true {
            voisins += 1
        }
        voisins += effets.textObjects.filter { $0.id != id }.count
        voisins += (effets.stickerObjects ?? []).filter { $0.id != id }.count
        voisins += slide.locationObjects.filter { $0.id != id }.count
        return voisins > 0
    }
}
