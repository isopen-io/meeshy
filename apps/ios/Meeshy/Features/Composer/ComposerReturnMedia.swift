import UIKit

// **Ce que la retouche rend au message** (#9124, #11133) : la retouche unique
// (`ConversationPieceRetouch`) et le viseur plein écran (#9295) versent leur
// prise au message par ce type.

/// Le média que « Terminé » rend au message : une image, ou une vidéo.
enum ComposerReturnedMedia {
    case image(UIImage)
    case video(URL)
}

extension ComposerReturnedMedia {
    /// **La prise du viseur plein écran, versée au message** (#9295) : la
    /// caméra de la barre ne passe plus par la scène, elle rend sa prise par
    /// le même chemin de pose qu'une scène terminée.
    init(capture: CameraResult) {
        switch capture {
        case .photo(let image, _): self = .image(image)
        case .video(let url): self = .video(url)
        }
    }
}
