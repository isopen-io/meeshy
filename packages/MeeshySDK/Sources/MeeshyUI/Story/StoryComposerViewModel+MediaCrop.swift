import UIKit
import MeeshySDK

// **Recadrer une image** (#9136, #9499) — la borne s'écrit sur l'objet
// (`StoryMediaObject.crop`, normalisée sur la source). Ce que montre le bitmap
// (`loadedImages[id]`) dépend de QUI peint l'objet :
//
// | rôle | peint par | bitmap montré |
// |---|---|---|
// | fond | `StoryBackgroundLayer`, qui ignore la borne | la part gardée, recoupée du FICHIER |
// | posé | `StoryMediaLayer`, qui coupe par `contentsRect` | la source ENTIÈRE |
//
// Recouper le bitmap d'une image posée la recadrerait deux fois — et c'est ce
// bitmap qui part à la publication, sous une borne qui le recouperait encore
// chez chaque lecteur (planche `4c` : « aucun ne ré-encode »).

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

    /// Écrit la borne — le cadre ENTIER s'écrit par son absence. Le bitmap d'un
    /// FOND la suit ; celui d'une image posée reste entier, le calque la coupe.
    func setMediaCrop(id: String, crop: MediaCropRect?) {
        var effets = currentEffects
        guard let index = effets.mediaObjects?.firstIndex(where: { $0.id == id }) else { return }
        effets.mediaObjects?[index].crop = crop.flatMap { $0.isFull ? nil : MediaCropRule.clamped($0) }
        currentEffects = effets
        if effets.mediaObjects?[index].isBackground == true {
            refreshMediaCropPreview(id: id)
        } else {
            refreshStaleCropPreviews(of: (effets.mediaObjects ?? []).filter { $0.id == id })
        }
    }

    /// **Après un annuler / rétablir**, le bitmap d'une image dont la borne a
    /// changé ne la montre plus.
    func refreshStaleCropPreviews(in restored: [StorySlide]) {
        refreshStaleCropPreviews(of: restored.flatMap { $0.effects.mediaObjects ?? [] })
    }

    /// **Le bitmap d'une image ne montre plus ce que son rôle demande** — après
    /// un annuler / rétablir, un recadrage, ou un passage de fond à posé (et
    /// retour). Ses proportions le disent, et lui seul se relit : aucun fichier
    /// relu pour une image que rien n'a touchée, et une image posée retouchée
    /// par l'ancien éditeur garde son bitmap tant que ses proportions tiennent.
    func refreshStaleCropPreviews(of medias: [StoryMediaObject]) {
        medias
            .filter { media in
                guard media.kind == .image, let ratio = media.measuredAspectRatio,
                      let montre = loadedImages[media.id], montre.size.height > 0 else { return false }
                return abs(montre.size.width / montre.size.height - Self.shownRatio(of: media, source: ratio)) > 0.01
            }
            .forEach { refreshMediaCropPreview(id: $0.id) }
    }

    /// Le rapport que le bitmap montré doit avoir : recadré pour un fond, celui
    /// de la source pour une image posée.
    nonisolated static func shownRatio(of media: StoryMediaObject, source: Double) -> Double {
        media.isBackground ? MediaCropRule.effectiveRatio(sourceRatio: source, crop: media.crop) : source
    }

    /// Le bitmap montré d'une IMAGE suit son rôle — la part gardée d'un fond,
    /// la source entière d'une image posée — relu du fichier d'origine, jamais
    /// depuis un bitmap déjà recadré.
    ///
    /// **Décodé à la taille PUBLIÉE du cadre, jamais pleine taille** (#6922) :
    /// la source se lit juste assez grande pour que le cadre sorte à
    /// `workingMaxPixelSize` — ni un pixel de plus en mémoire, ni un de moins
    /// à l'envoi.
    func refreshMediaCropPreview(id: String) {
        guard let media = currentEffects.mediaObjects?.first(where: { $0.id == id }),
              media.kind == .image,
              let adresse = media.mediaURL.flatMap(URL.init(string:)), adresse.isFileURL else { return }
        let coupe = media.isBackground ? media.crop : nil
        guard let source = SceneImageDownsampling.image(
                fileAt: adresse, maxPixelSize: Self.cropDecodeMaxPixelSize(coupe, fileAt: adresse))
        else { return }
        let montre = coupe.map { MediaCropBitmap.cropped(source, to: $0) } ?? source
        registerLoadedImage(SceneImageDownsampling.downsampled(
            montre, maxPixelSize: SceneImageDownsampling.workingMaxPixelSize), for: id)
    }

    private static func cropDecodeMaxPixelSize(_ crop: MediaCropRect?, fileAt adresse: URL) -> CGFloat {
        let plafond = SceneImageDownsampling.workingMaxPixelSize
        guard let crop, let taille = SceneImageDownsampling.pixelSize(fileAt: adresse) else { return plafond }
        let borne = MediaCropRule.clamped(crop)
        return SceneImageDownsampling.decodeMaxPixelSize(
            forCrop: CGSize(width: borne.width, height: borne.height), sourcePixelSize: taille, cap: plafond)
    }
}
