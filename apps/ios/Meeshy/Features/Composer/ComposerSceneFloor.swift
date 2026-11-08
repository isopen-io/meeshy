import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le SOL de la scène : le thumbhash de son propre résultat** (directive
/// porteur : « la scène doit avoir un sol peint en thumbhash du
/// résultat de la scène »).
///
/// Une scène 9:16 est moins haute qu'un iPhone, et elle se cadre entre la
/// barre haute et le socle : ce qu'elle laisse du viewport n'est pas un
/// plateau, c'est son SOL — la loi du lecteur (`SceneBackdropView`,
/// `.thumbHash`), peinte du hachage du COMPOSITE de la slide, ce que la
/// publication emportera. Le composer et le lecteur posent ainsi la même
/// scène sur le même sol.
///
/// Tapable comme le fond du canvas, dont il prolonge l'apparence ; inerte
/// pendant un tracé, qui possède l'écran entier.
struct ComposerSceneFloor: View {
    let slide: StorySlide
    let images: [String: UIImage]
    let imagesVersion: UInt64
    let intakeBlocks: Bool
    let takesTaps: Bool
    let onTap: (() -> Void)?

    @State private var floorHash: String?

    var body: some View {
        // **Le sol est BORNÉ par un calque neutre** : en dessin, les
        // contrôleurs ne doivent pas « s'étirer et sortir » du viewport.
        // `SceneBackdropView` peint le thumbhash en `.scaledToFill()` et laisse
        // l'hôte clipper : une image en fill ANNONCE la taille de son
        // remplissage, plus large que l'écran dès que son rapport diffère —
        // et le calque de la surface s'élargissait d'autant, emportant la
        // croix, la carte et les pinceaux hors de l'écran. `Color.clear`
        // prend la taille proposée ; l'`overlay` ne peut plus la changer.
        Color.clear
            .overlay {
                if let teinte = ComposerSceneFloorRules.backdropColor(slide: slide) {
                    teinte
                } else {
                    SceneBackdropView(backdrop: .thumbHash, thumbHash: floorHash)
                }
            }
            .clipped()
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { onTap?() }
            .allowsHitTesting(takesTaps)
            .modifier(ComposerIntakeVeil(veiled: intakeBlocks, dims: false))
            .task(id: ComposerSceneFloorRules.key(slide: slide, imagesVersion: imagesVersion)) {
                // Anti-rebond : un geste de cadrage change la clé à chaque image,
                // et le sol n'a pas à suivre le doigt — il suit la COMPOSITION.
                try? await Task.sleep(for: .milliseconds(200))
                guard !Task.isCancelled else { return }
                floorHash = StorySlideRenderer.computeThumbHash(slide: slide,
                                                                bgImage: nil,
                                                                loadedImages: images)
            }
    }
}
