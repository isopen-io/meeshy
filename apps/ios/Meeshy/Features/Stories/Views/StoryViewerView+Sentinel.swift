import SwiftUI
import UIKit
import MeeshySDK

/// **La sentinelle du lecteur — vue `2j`** (#4088).
///
/// Ce fichier existe pour une raison de BUDGET autant que de sens :
/// `StoryViewerView+Canvas.swift` est hors budget (2 636 lignes, amnistié), et
/// la règle du dépôt interdit d'y ajouter — « on extrait d'abord, on ajoute
/// ensuite ». La bifurcation y coûte quatre lignes ; tout ce qu'elle décide vit
/// ici.
///
/// > **Le type étendu est `StoryCardView`, pas `StoryViewerView`.** Le fichier
/// > s'appelle `StoryViewerView+Canvas.swift` et la carte du lecteur y vit sous
/// > un AUTRE nom, à côté de quatre autres structs. Un nom de fichier ne dit
/// > pas à quel type son code appartient — le compilateur l'a rappelé en
/// > quatre erreurs.
extension StoryCardView {

    /// **La story courante porte-t-elle du contenu que ce build ne sait pas
    /// peindre ?**
    ///
    /// La question se pose au MODÈLE, jamais au rendu : `carriesUnpaintableContent`
    /// lit le mémo que la conversion v3 a posé en sautant les objets
    /// `.reserved`. Sans ce mémo, l'information était perdue avant d'arriver
    /// ici — le lecteur peignait la scène amputée sans pouvoir le savoir.
    var currentStoryIsUnpaintable: Bool {
        currentStory?.storyEffects?.carriesUnpaintableContent == true
    }

    /// La sentinelle, à la place EXACTE de la scène — mêmes dimensions, même
    /// cadrage, même rayon. « Aucun cadre vide, aucun fond par défaut » : elle
    /// occupe la carte, elle ne flotte pas dessus.
    ///
    /// **Elle n'hérite PAS de la chaîne d'accessibilité du canvas**, et c'est
    /// pourquoi la bifurcation vit au-dessus d'elle plutôt qu'à l'intérieur de
    /// `currentContentHost`. Le canvas est du `CALayer` : il porte
    /// `.accessibilityElement(children: .ignore)` et un label qui décrit la
    /// story. Appliquer ça à la sentinelle aplatirait ses deux boutons —
    /// **le seul geste utile deviendrait inatteignable à VoiceOver**, sur la
    /// vue même dont la doctrine dit qu'elle doit offrir « le seul geste
    /// utile ».
    @ViewBuilder
    var sentinelLayer: some View {
        StorySentinelView(
            // L'URL du magasin est celle de la porte de mise à jour
            // (`UpgradeGateView.defaultStoreURL`) — jamais une seconde
            // orthographe : deux URL de magasin divergent au premier
            // changement de bundle id.
            // `UIApplication.shared.open` plutôt qu'un `@Environment(\.openURL)` :
            // une propriété stockée ne s'ajoute pas depuis une extension, et
            // l'ajouter au fichier du canvas — hors budget — est ce que ce
            // découpage existe pour éviter.
            onUpdate: { UIApplication.shared.open(UpgradeGateView.defaultStoreURL) },
            // « Passer à la suivante » EST la navigation ordinaire du lecteur.
            // Lui écrire un chemin à part aurait fabriqué une seconde façon
            // d'avancer, à faire diverger de la première.
            onSkip: goToNext
        )
        .frame(width: canvasFitSize.width, height: canvasFitSize.height)
        .clipShape(RoundedRectangle(
            cornerRadius: readerCanvasFraming.scale > 0
                ? readerCanvasFraming.cornerRadius / readerCanvasFraming.scale
                : readerCanvasFraming.cornerRadius,
            style: .continuous))
        .scaleEffect(readerCanvasFraming.scale)
        .offset(y: readerCanvasFraming.offset.height)
        .shadow(color: .black.opacity(canvasIsExpanded ? 0 : 0.4), radius: 20, y: 8)
    }
}
