import SwiftUI
import UIKit

/// Letterbox derrière la carte canvas. Historiquement NOIR (contraste carte
/// + « cinéma » pour un média) — mais un fond PAYSAGE réduit le canvas 16:9 à
/// une bande, laissant un grand vide noir perçu comme « canvas noir » (user
/// 2026-07-20, choix « garder la forme, tuer le noir »). On le remplit
/// désormais par un FLOU du média de fond — la carte nette flotte au-dessus de
/// sa propre version floutée (look intégré) — ou, à défaut d'image, par la
/// couleur de fond de la story.
///
/// S5 — il est TAPABLE, et route vers la MÊME closure que le fond du canvas
/// (`handleCanvasBackgroundTap`). Sur iPhone 16 Pro les bandes représentent
/// 874 − 714 = 160 pt, soit ~18 % de la hauteur, dont la bande basse — la
/// plus proche du pouce. Elles ont exactement l'apparence du canvas ; les
/// laisser inertes contredisait frontalement « toute la surface du canvas
/// est le bouton texte ». Le letterbox est SOUS `canvasComposerLayer` dans
/// le ZStack : le canvas garde la priorité sur son propre rectangle.
struct StoryCanvasLetterbox: View {
    let backgroundImage: UIImage?
    let backgroundColor: String
    let isCarded: Bool
    let acceptsTaps: Bool
    let onTap: () -> Void

    var body: some View {
        Group {
            if let bg = backgroundImage {
                Color.clear
                    .overlay(Image(uiImage: bg).resizable().scaledToFill())
                    .clipped()
                    .blur(radius: 34, opaque: true)
                    .overlay(Color.black.opacity(0.20))
                    .ignoresSafeArea()
            } else {
                // **Le plateau prend la couleur du slide, ASSOMBRIE** (directive
                // porteur 2026-08-28, #4124 : « un fond même couleur que
                // MeeshyComposer — sombre, prend la couleur de fond si aucun
                // média n'est mis en fond »).
                //
                // Le voile n'est pas une préférence de teinte : sans lui, le
                // plateau et la carte ont EXACTEMENT la même couleur, et la
                // carte disparaît. Mesuré à l'écran le jour où le liseré a cédé
                // la place à l'ombre — une ombre n'a rien à détacher quand les
                // deux surfaces sont identiques. C'est le même voile que la
                // branche MÉDIA juste au-dessus applique à son flou, pour la
                // même raison.
                Rectangle()
                    .fill(storyBackgroundStyle(
                        backgroundColor.replacingOccurrences(of: "#", with: "")))
                    .overlay(Color.black.opacity(0.28))
                    .ignoresSafeArea()
                    .animation(.easeInOut(duration: 0.25), value: isCarded)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onTap() }
        // Le tracé immersif possède l'écran entier : lui voler un touch par le
        // letterbox interromprait un trait en cours.
        .allowsHitTesting(acceptsTaps)
    }
}
