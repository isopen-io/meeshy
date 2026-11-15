import UIKit
import MeeshySDK

// **Ce qu'un recadrage change à la PEINTURE d'un média posé** (#9499).
//
// La borne (`StoryMediaObject.crop`) ne touche jamais au fichier : le calque la
// lit par `contentsRect` (`StoryMediaLayer.applyCrop`). Deux questions restent
// pour quiconque peint l'objet SANS ce calque — le geste en cours, la vignette
// composite, la mini-scène — et chacune a une seule réponse, ici :
// quel CADRE (le rapport recadré), et quelle PART de l'image (celle gardée).

extension StoryMediaLayer {

    /// **Le cadre de base d'un média, à son rapport EFFECTIF** — celui du
    /// recadrage s'il y en a un. `renderedPose` le lit ; le geste et les
    /// vignettes aussi, pour que l'objet ne change pas de forme selon qui le
    /// peint (loi 6).
    static func baseMediaDesignSize(for media: StoryMediaObject) -> CGSize {
        baseMediaDesignSize(aspectRatio: MediaCropRule.effectiveRatio(sourceRatio: media.aspectRatio,
                                                                      crop: media.crop))
    }
}

public enum MediaCropPresentation {

    /// **La part gardée d'une image posée**, pour un peintre qui n'a pas de
    /// `contentsRect`. Sans recadrage, l'image elle-même — aucune copie.
    ///
    /// Une image à l'endroit se coupe sur son `CGImage`, qui partage ses pixels
    /// avec la source : une vignette repeinte à chaque rendu n'alloue rien. Une
    /// image tournée (EXIF) passe par `MediaCropBitmap`, qui la lit dans son
    /// orientation d'affichage — celle où la borne a été posée.
    public static func keptPart(_ image: UIImage, of media: StoryMediaObject) -> UIImage {
        guard let crop = media.crop, !crop.isFull else { return image }
        let borne = MediaCropRule.clamped(crop)
        guard image.imageOrientation == .up, let source = image.cgImage else {
            return MediaCropBitmap.cropped(image, to: borne)
        }
        let largeur = CGFloat(source.width)
        let hauteur = CGFloat(source.height)
        let part = CGRect(x: largeur * borne.x, y: hauteur * borne.y,
                          width: largeur * borne.width, height: hauteur * borne.height).integral
        guard let coupe = source.cropping(to: part) else { return MediaCropBitmap.cropped(image, to: borne) }
        return UIImage(cgImage: coupe, scale: image.scale, orientation: .up)
    }
}
