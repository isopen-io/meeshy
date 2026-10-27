import SwiftUI

// **Le socle FLOTTE au bas de la scène** (#8370, lot 2 de la maquette plein
// écran, `docs/product/composer-plein-ecran/iOS.dc.html`).
//
// Il était le frère de la surface dans une `VStack` : une bande qui coupait
// l'écran sous la scène. La maquette le pose en surimpression, sur fond verre,
// le fond de la scène passant dessous.
//
// `safeAreaInset` et non `overlay` : la surimpression seule recouvrirait la
// rangée d'outils du bas (`ComposerSceneSurface.lowToolRow`) et les réglages
// d'un outil ouvert. L'encart RÉSERVE sa hauteur — la surface se met en page
// au-dessus de lui — pendant que tout ce qui ignore la zone sûre (le fond du
// plateau, la scène) continue sous le verre. Une seule mécanique pour les trois
// surfaces (atelier, scène, document), sans qu'aucune ait à connaître le socle.
//
// Le socle reste DANS `composerStack`, donc dans ce que le viseur enveloppe :
// le plein écran de la caméra le couvre toujours.
extension View {
    func composerFloatingSocle<Socle: View>(@ViewBuilder _ socle: () -> Socle) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0, content: socle)
    }
}
