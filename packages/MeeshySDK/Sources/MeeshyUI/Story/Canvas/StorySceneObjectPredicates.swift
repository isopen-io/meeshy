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
        // `isLocked` n'existe que sur un TEXTE — le badge d'attribution d'une
        // republication en est le seul porteur.
        if case .text(let objet) = slide.sceneObject(id: id) { return objet.isLocked == true }
        return false
    }

    /// Un objet du plan `background`. **Deux places** y vivent — un visuel ET un
    /// son (#4052) —, d'où les deux lectures.
    public static func isBackground(slide: StorySlide, id: String) -> Bool {
        slide.sceneObject(id: id)?.isBackground == true
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
        switch slide.sceneObject(id: id) {
        case .media(let objet): return objet.kind == .video
        case .audio:            return true
        case .text, .sticker, .location, nil: return false
        }
    }

    /// **Un FRÈRE de plan, tous types confondus.**
    ///
    /// L'empilement raisonne sur les `zIndex` de TOUS les éléments — c'est ce
    /// que `bringForward` fait, et ce que le rendu trie. Compter les seuls
    /// médias dirait « seul » d'un objet posé sous un texte, et retirerait une
    /// action qui a bel et bien un effet.
    public static func sharesPlaneWithAnother(slide: StorySlide, besides id: String) -> Bool {
        // **Douze lignes, cinq tableaux, un seul prédicat** — c'est ce que
        // l'absence de `MeeshySceneObject` coûtait ici (#4591).
        //
        // L'équivalence est terme à terme, vérifiée avant réécriture :
        // - texte, sticker, lieu : toujours de premier plan, tous comptés — la
        //   somme rend `isBackground == false` pour les trois, le modèle ne
        //   leur donnant pas le champ ;
        // - média : `isBackground` est un `Bool` non-optionnel, donc
        //   `!= true` ≡ `!isBackground` ;
        // - son : `isBackground` est optionnel, et la somme le résout en
        //   `== true`, donc `!` rend exactement `!= true`.
        //
        // `contains` remplace un comptage : on ne cherchait jamais COMBIEN de
        // voisins, seulement s'il en existait un — et la sortie anticipée était
        // déjà due.
        slide.sceneObjects.contains { $0.id != id && !$0.isBackground }
    }
}
