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
