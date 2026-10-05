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
    /// Le pont PERD l'EXIF, et c'est le CONTRAT du SDK qui l'impose :
    /// `StoryCameraCapture.photo` ne porte qu'une `UIImage`.
    ///
    /// La photo part SANS passer par la prise (#9295) : elle tombe dans une
    /// scène, où ses filtres et son cadrage s'éditent déjà.
    func storyCameraCaptureProvided() -> some View {
        environment(\.storyCameraCapture, StoryCameraCaptureProvider { onCapture in
            AnyView(ComposerViewfinder(reviewsPhoto: false) { result in
                switch result {
                case .photo(let image, _): onCapture(.photo(image))
                case .video(let url):      onCapture(.video(url))
                }
            })
        })
    }
}
