import UIKit
import MeeshySDK

// **Recadrer une image** (#9136) — la borne s'écrit sur l'objet
// (`StoryMediaObject.crop`, normalisée sur la source) et le bitmap affiché la
// suit, comme toute édition sur place du composer : `loadedImages[id]` porte ce
// qu'on voit, le FICHIER reste l'original d'où chaque nouveau cadre se recoupe.

public enum MediaCropBitmap {

    /// La part de l'image que la borne garde, en pixels pleins. L'image est
    /// dessinée dans son orientation d'affichage : la borne s'y lit.
    public static func cropped(_ image: UIImage, to crop: MediaCropRect) -> UIImage {
        let borne = MediaCropRule.clamped(crop)
        let taille = image.size
        let cadre = CGSize(width: (taille.width * borne.width).rounded(),
                           height: (taille.height * borne.height).rounded())
        guard cadre.width >= 1, cadre.height >= 1 else { return image }
        let format = UIGraphicsImageRendererFormat()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: cadre, format: format).image { _ in
            image.draw(at: CGPoint(x: -taille.width * borne.x, y: -taille.height * borne.y))
        }
    }
}

public extension StoryComposerViewModel {

    /// Écrit la borne — le cadre ENTIER s'écrit par son absence — et le bitmap
    /// montré la suit.
    func setMediaCrop(id: String, crop: MediaCropRect?) {
        var effets = currentEffects
        guard let index = effets.mediaObjects?.firstIndex(where: { $0.id == id }) else { return }
        effets.mediaObjects?[index].crop = crop.flatMap { $0.isFull ? nil : MediaCropRule.clamped($0) }
        currentEffects = effets
        refreshMediaCropPreview(id: id)
    }

    /// **Après un annuler / rétablir**, le bitmap d'une image dont la borne a
    /// changé ne la montre plus : ses proportions le disent, et lui seul se
    /// recoupe — aucun fichier relu pour une image que l'historique n'a pas
    /// touchée.
    func refreshStaleCropPreviews(in restored: [StorySlide]) {
        restored.flatMap { $0.effects.mediaObjects ?? [] }
            .filter { media in
                guard media.kind == .image, let ratio = media.measuredAspectRatio,
                      let montre = loadedImages[media.id], montre.size.height > 0 else { return false }
                let attendu = MediaCropRule.effectiveRatio(sourceRatio: ratio, crop: media.crop)
                return abs(montre.size.width / montre.size.height - attendu) > 0.01
            }
            .forEach { refreshMediaCropPreview(id: $0.id) }
    }

    /// Le bitmap montré d'une IMAGE suit sa borne — recoupé depuis le fichier
    /// d'origine, jamais depuis le bitmap déjà recadré.
    func refreshMediaCropPreview(id: String) {
        guard let media = currentEffects.mediaObjects?.first(where: { $0.id == id }),
              media.kind == .image,
              let adresse = media.mediaURL.flatMap(URL.init(string:)), adresse.isFileURL,
              let source = UIImage(contentsOfFile: adresse.path) else { return }
        registerLoadedImage(media.crop.map { MediaCropBitmap.cropped(source, to: $0) } ?? source, for: id)
    }
}
