import SwiftUI
import UIKit

/// **La vue qui JOUE une image animée** (#4925).
///
/// ## Pourquoi un `UIViewRepresentable` et pas `Image(uiImage:)`
///
/// `UIImage.animatedImage(with:duration:)` porte ses images dans `.images`, et
/// **SwiftUI n'en rend que la première** : `Image(uiImage:)` lit le `cgImage` de
/// base et ignore le tableau. Seul `UIImageView` sait animer cette forme, en
/// lisant `.images` et `.duration` de lui-même.
///
/// > C'est la raison pour laquelle un décodeur ne suffisait pas : on peut
/// > décoder parfaitement un GIF et l'afficher figé sans qu'aucune ligne ne soit
/// > fausse. Les deux moitiés sont nécessaires, et aucune ne signale l'absence
/// > de l'autre.
///
/// ## Le mouvement réduit fige, il ne masque pas
///
/// Sous `accessibilityReduceMotion` (ou la préférence Meeshy de #4288), la vue
/// rend la PREMIÈRE image — celle qu'un GIF non joué montre, donc celle que
/// l'auteur a choisie comme vignette. Retirer l'image entière priverait le
/// lecteur du contenu ; la figer lui rend le contenu sans le mouvement, ce qui
/// est exactement ce que la préférence demande.
public struct AnimatedImageView: UIViewRepresentable {

    private let decoded: AnimatedImageDecoder.Decoded
    private let contentMode: UIView.ContentMode

    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    public init(
        decoded: AnimatedImageDecoder.Decoded,
        contentMode: UIView.ContentMode = .scaleAspectFit
    ) {
        self.decoded = decoded
        self.contentMode = contentMode
    }

    private var reduceMotion: Bool { systemReduce || userForced }

    public func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = contentMode
        view.clipsToBounds = true
        // Sans ces deux priorités, `UIImageView` impose sa taille INTRINSÈQUE à
        // la mise en page SwiftUI : un sticker de 512 px réclamerait 512 pt et
        // déborderait sa bulle. Le conteneur décide, l'image suit.
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        view.isAccessibilityElement = false
        return view
    }

    public func updateUIView(_ view: UIImageView, context: Context) {
        view.contentMode = contentMode
        // L'affectation est CONDITIONNELLE : réassigner la même image animée à
        // chaque `updateUIView` redémarrerait le cycle à sa première image, et
        // SwiftUI rappelle cette méthode à chaque changement d'environnement.
        // L'animation repartirait de zéro au moindre défilement.
        let wanted = reduceMotion ? decoded.stillImage : decoded.animatedImage
        guard view.image !== wanted else { return }
        view.image = wanted
    }
}
