import SwiftUI
import UIKit

/// L'image finale d'un moment : les deux formats, prêts à enregistrer, partager
/// ou garder. `story` et `square` sont les octets JPEG ; les `UIImage` servent
/// l'aperçu du résultat.
struct ComposedPhoto {
    let story: UIImage
    let square: UIImage
    let storyData: Data
    let squareData: Data
    let mode: PhotoMode

    var kept: KeptPhoto {
        KeptPhoto(story: storyData, square: squareData, mode: mode)
    }
}

/// LA COMPOSITION DE L'IMAGE (#9382) — conception, partie VI : « image finale par
/// `ImageRenderer` (iOS 16+) », en 9:16 pour la story et 1:1 pour le profil.
/// Elle rend `GamePhotoCanvasView`, la MÊME vue que l'aperçu en direct.
///
/// Aucune image ne quitte l'appareil : la composition est locale, sans réseau.
@MainActor
protocol GamePhotoComposing: AnyObject {
    func compose(moment: PhotoMoment, source: UIImage?, mode: PhotoMode, date: Date) -> ComposedPhoto?
}

@MainActor
final class GamePhotoComposer: GamePhotoComposing {
    nonisolated deinit {}

    static let jpegQuality: CGFloat = 0.9

    func compose(moment: PhotoMoment, source: UIImage?, mode: PhotoMode, date: Date) -> ComposedPhoto? {
        let background: GamePhotoCanvasView.Background
        if let source {
            // Un selfie est retourné, comme dans l'aperçu (le miroir qu'on attend d'une
            // caméra avant) ; une photo de la galerie ne l'est pas.
            background = .photo(source, mirrored: mode == .selfie)
        } else {
            background = .card
        }
        let label = Self.dateLabel(date)
        guard let story = render(moment: moment, label: label, format: .story, background: background),
              let square = render(moment: moment, label: label, format: .square, background: background),
              let storyData = story.jpegData(compressionQuality: Self.jpegQuality),
              let squareData = square.jpegData(compressionQuality: Self.jpegQuality) else { return nil }
        return ComposedPhoto(story: story, square: square, storyData: storyData, squareData: squareData, mode: mode)
    }

    private func render(moment: PhotoMoment, label: String, format: PhotoFormat,
                        background: GamePhotoCanvasView.Background) -> UIImage? {
        let renderer = ImageRenderer(
            content: GamePhotoCanvasView(moment: moment, dateLabel: label, format: format, background: background)
        )
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(width: format.size.width, height: format.size.height)
        return renderer.uiImage
    }

    /// « 5 oct. 2026 » — la date du moment, dans la langue de l'appareil.
    static func dateLabel(_ date: Date, locale: Locale = .current) -> String {
        date.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(locale))
    }
}
