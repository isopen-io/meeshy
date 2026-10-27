import UIKit

/// **Une photo encodée sans son orientation arrive COUCHÉE** (#4080, signalé
/// par le porteur le 2026-09-04 : « l'image prise est retournée quand elle est
/// mise sur la scène »).
///
/// ## Ce que `jpegData` ne fait pas, et qu'on croit qu'il fait
///
/// `UIImage.jpegData(compressionQuality:)` encode le TAMPON DE PIXELS tel
/// quel. Il n'applique pas `imageOrientation` et n'écrit aucune balise EXIF qui
/// la porterait. Or l'appareil photo rend systématiquement un tampon en
/// PAYSAGE, accompagné d'une orientation (`.right` pour un portrait tenu
/// normalement) : c'est cette orientation, et elle seule, qui redresse l'image
/// à l'affichage.
///
/// Tant que l'`UIImage` reste en mémoire, tout paraît juste — SwiftUI et UIKit
/// honorent `imageOrientation`. Le défaut naît à l'ÉCRITURE, et se voit une
/// étape plus loin, chez le consommateur du fichier. C'est ce qui le rend
/// invisible au moment où on l'écrit.
///
/// ## Redresser plutôt que baliser
///
/// Écrire l'EXIF marcherait aussi, mais laisserait le fichier dépendre d'un
/// lecteur qui l'honore — et le dépôt en compte trois, plus un renderer
/// d'export. Redessiner une fois, à l'entrée, rend un fichier dont les pixels
/// SONT ce qu'on voit : plus personne n'a à interpréter quoi que ce soit.
nonisolated enum ComposerCaptureOrientation {

    /// Rend une image dont le tampon est déjà redressé.
    ///
    /// Une image déjà `.up` est rendue TELLE QUELLE — la redessiner coûterait
    /// une passe de rendu et une génération de JPEG pour rien, sur le chemin le
    /// plus fréquent (la photothèque, dont les images sont normalisées).
    static func upright(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }
        let format = UIGraphicsImageRendererFormat()
        // L'échelle de la SOURCE, jamais celle de l'écran : un rendu à
        // `scale = 0` prendrait celle de l'appareil et redimensionnerait
        // silencieusement une photo de 12 Mpx.
        format.scale = image.scale
        format.opaque = false
        return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}

/// **Ce qu'on ÉCRIT d'une capture — les octets reçus, sinon un repli** (#4080).
///
/// > « la prise de la photo doit avoir les exif et metadata » — porteur,
/// > 2026-09-04
///
/// La règle tient en une phrase : **on ne reconstruit pas ce qu'on a reçu.**
/// `AVCapturePhoto.fileDataRepresentation()` rend un fichier complet — EXIF,
/// TIFF, marque et modèle, date de prise, temps de pose, focale, orientation,
/// et la position quand l'app y a droit. Ré-encoder depuis l'`UIImage` jette
/// tout cela, et c'est ce qui faisait aussi arriver la photo COUCHÉE : une
/// seule correction ferme les deux défauts.
///
/// Le repli existe parce que la source n'est pas toujours un objectif — un
/// écran de test, un chemin futur, un fournisseur qui ne rend qu'une image.
/// Il redresse alors le tampon, faute d'EXIF pour le faire.
nonisolated enum ComposerCapturePayload {

    /// Le format des octets reçus se LIT dans leurs premiers octets, jamais
    /// dans une extension qu'on aurait choisie : l'appareil rend du HEIC ou du
    /// JPEG selon les réglages, et les nommer tous `.jpg` ferait mentir le nom
    /// sur le contenu — ce qu'un `MimeTypeResolver` par extension propagerait.
    static func fileExtension(of data: Data) -> String {
        // JPEG : FF D8 FF · HEIC : la boîte `ftyp` en octets 4-7 · PNG : 89 50
        if data.count >= 3, data[0] == 0xFF, data[1] == 0xD8, data[2] == 0xFF { return "jpg" }
        if data.count >= 12,
           data[4] == 0x66, data[5] == 0x74, data[6] == 0x79, data[7] == 0x70 { return "heic" }
        if data.count >= 2, data[0] == 0x89, data[1] == 0x50 { return "png" }
        return "jpg"
    }

    static func mime(for suffixe: String) -> String {
        switch suffixe {
        case "heic": return "image/heic"
        case "png":  return "image/png"
        default:     return "image/jpeg"
        }
    }

    /// - Returns: les octets à écrire et leur extension. `nil` si même le repli
    ///   échoue — une image sans pixels encodables, cas où écrire un fichier
    ///   vide serait pire que ne rien poser.
    static func bytes(original: Data?, fallback: UIImage) -> (Data?, String) {
        if let original, !original.isEmpty {
            return (original, fileExtension(of: original))
        }
        return (ComposerCaptureOrientation.upright(fallback)
            .jpegData(compressionQuality: 0.9), "jpg")
    }
}
