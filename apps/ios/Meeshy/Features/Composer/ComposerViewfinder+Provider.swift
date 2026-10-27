import SwiftUI
import MeeshyUI

extension View {
    /// Fournit à l'atelier de story (`StoryComposerView`, côté SDK) le viseur
    /// du composeur, servi seul en plein écran (#9125). Même doctrine que
    /// `storyLocationPickerProvided` : piloter une `AVCaptureSession`, ses
    /// permissions et son écran de refus est de l'orchestration produit, donc
    /// app-side (SDK purity). Sans cet appel, l'amorce « Caméra » de la page
    /// blanche n'est pas rendue — une amorce qui ouvre le vide est pire que pas
    /// d'amorce.
    ///
    /// La photo passe avec les OCTETS de la prise (#11847) : l'atelier en fait le
    /// fichier du média, sans seconde génération, carte de gain comprise.
    ///
    /// La photo part peinte par le peintre unique, sur le canevas 9:16 (#9347).
    func storyCameraCaptureProvided() -> some View {
        environment(\.storyCameraCapture, StoryCameraCaptureProvider { onCapture in
            AnyView(ComposerViewfinder { result in
                switch result {
                case .photo(let image, let data): onCapture(.photo(image, data: data))
                case .video(let url):      onCapture(.video(url))
                }
            })
        })
    }
}
