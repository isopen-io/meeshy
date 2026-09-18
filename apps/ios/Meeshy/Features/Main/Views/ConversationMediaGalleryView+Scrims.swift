import SwiftUI
import MeeshySDK
import MeeshyUI

// =============================================================================
//  Le VOILE de lisibilité du visualiseur — celui de la STORY (#6904, tour 5)
// =============================================================================
//
//  Directive porteur du 2026-09-18, verbatim :
//
//  > « Il faut bien faire attention à l'ombre dégradé pour rendre le texte
//  > lisible qui doit être mis sur tous l'écran à partir du bas de l'écran. »
//
//  ## Ce que le visualiseur avait, et pourquoi ce n'était pas ça
//
//  `cadreOverlay` posait un `LinearGradient` en FOND DU BLOC BAS DU CADRE. Un
//  dégradé de la taille de ce bloc, donc borné deux fois :
//
//  - il s'ARRÊTAIT au bord du bloc, AU-DESSUS du couloir de la pellicule — le
//    bas de l'écran restait clair ;
//  - il ne prenait que la LARGEUR DE LA CARTE, et une carte cadrée est plus
//    étroite que l'écran (378 pt sur 402, cas nominal) : les deux gouttières
//    latérales n'étaient pas voilées.
//
//  Mesuré à la recette du tour 4, repère F2 en cadré : la légende « REPÈRE F2 —
//  … » se lisait sur le bleu du média sans voile visible, pendant que la MÊME
//  légende, sur la story F7, se lisait sur un bas d'écran fondu au noir sur
//  toute la largeur.
//
//  ## Ce qu'il a maintenant : le composant de la story, tel quel
//
//  `StoryReaderScrims` (#6701) — deux dégradés pleine largeur ancrés au HAUT et
//  au BAS DE L'ÉCRAN, `.ignoresSafeArea()`, sourds au doigt, muets pour
//  VoiceOver, et qui SUIVENT le chrome au même ressort. Rien n'est réécrit :
//  « partir du fait que le composant est déjà fait » est la directive du
//  2026-09-17, et elle vaut pour le voile comme elle a valu pour la carte
//  (`SceneCard`) et pour le sol (`SceneFloorView`).
//
//  **Son nom garde « StoryReader », et c'est juste** : c'est le voile de la
//  story qu'on réutilise, comme la CARTE de la story et le SOL de la story. Le
//  renommer masquerait la seule information que ce montage porte — que la
//  surface de RÉFÉRENCE est le lecteur de stories.

extension ConversationMediaGalleryView {

    /// **Le voile de lisibilité du visualiseur — une couche de l'ÉCRAN, pas d'un
    /// bloc, pas d'une page.**
    ///
    /// Trois propriétés, et chacune répond à une moitié du défaut qu'elle ferme :
    ///
    /// - **`topInset` est celui de la FENÊTRE** (`DeviceLayout.safeAreaTop`),
    ///   comme le lecteur le prend de son `geometry` — jamais
    ///   `plateauTopInset`, qui est la hauteur du couloir du PLATEAU : un voile
    ///   ancré sur le plateau se déplacerait avec lui à chaque ouverture de
    ///   légende, alors qu'il habille l'écran.
    /// - **`chromeVisible` est le verdict d'`overlayLayer`**
    ///   (`MediaStageVeil.showsChrome(presentation:overlays:)`), pas une
    ///   constante et pas un second calcul : le voile n'existe QUE pour détacher
    ///   ces contrôles, donc il part et revient avec eux — en plein cadre comme
    ///   sous une ouverture. Deux verdicts se désynchroniseraient sur exactement
    ///   l'image où l'utilisateur regarde.
    /// - **Elle vaut pour les TROIS natures de page** — photo, vidéo, scène.
    ///   C'est pourquoi elle est un FRÈRE du pager dans le `ZStack` racine, et
    ///   non un enfant d'une page : le bloc de légende (`bottomOverlay` :
    ///   auteur, date, légende dépliable, ligne de format) est le même pour les
    ///   trois, et un voile par type de média ferait de la lisibilité une
    ///   propriété du MIME.
    ///
    /// Elle se monte SOUS `overlayLayer` : les contrôles restent au-dessus du
    /// voile — il les détache, il ne les assombrit pas.
    var stageScrimsLayer: some View {
        StoryReaderScrims(
            topInset: DeviceLayout.safeAreaTop,
            chromeVisible: MediaStageVeil.showsChrome(presentation: stagePresentation,
                                                      overlays: stageOverlays))
    }
}
