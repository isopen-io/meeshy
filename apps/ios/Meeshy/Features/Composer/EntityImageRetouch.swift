import SwiftUI
import MeeshySDK
import MeeshyUI

// **Avatar et bannière se retouchent avec l'outil de la capture caméra**
// (#17251, directive porteur : « l'ancien outil doit être supprimé
// TOTALEMENT et remplacé par le nouvel outil d'édition d'image/vidéo »).
// « Montre-toi », le profil, les groupes et les communautés passent tous par
// ce point d'entrée ; il monte la retouche unique (`ConversationPieceRetouch`).

/// **La retouche d'une image d'identité** : la retouche de la caméra, ouverte
/// sur l'image choisie, la scène aux proportions du format (rond 1:1 ou 3:1).
/// « Terminé » rend l'image recadrée à ce format ; la croix et « Abandonner »
/// ne rendent RIEN — aucune image n'est posée, rien n'est envoyé.
struct EntityImageRetouch: View {
    let image: UIImage
    let format: EntityImageFormat
    let onDone: (UIImage) -> Void
    let onCancel: () -> Void

    var body: some View {
        ConversationPieceRetouch(source: .image(image), format: format, onDone: { media in
            guard let edited = Self.image(from: media, format: format) else { return onCancel() }
            onDone(edited)
        }, onRemove: onCancel, onCancel: onCancel)
    }

    /// L'image que la retouche rend, recadrée à son format ; une vidéo n'en est pas une.
    static func image(from media: ComposerReturnedMedia, format: EntityImageFormat) -> UIImage? {
        guard case .image(let image) = media else { return nil }
        return format.cropped(image)
    }

    /// L'éditeur que l'app remet au SDK (`EntityImagePickerFlow`) par l'environnement.
    static let editor: EntityImageEditing = { request in
        AnyView(EntityImageRetouch(image: request.image, format: request.format,
                                   onDone: request.onDone, onCancel: request.onCancel))
    }
}

/// **Le rond de l'avatar, posé sur la scène carrée** (#17251) : ce qui tombe
/// hors du cercle est voilé — on cadre son visage comme les autres le verront.
struct EntityImageRoundVeil: View {
    var body: some View {
        Rectangle()
            .fill(Color.black.opacity(0.55))
            .mask {
                Rectangle()
                    .overlay(Circle().blendMode(.destinationOut))
                    .compositingGroup()
            }
            .overlay(Circle().stroke(Color.white.opacity(0.85), lineWidth: 1.5))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
