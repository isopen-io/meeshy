import UIKit

/// **`UIImage.cgImage` JETTE l'orientation — et le canvas la posait telle
/// quelle** (2026-09-05).
///
/// ## Le défaut, mesuré
///
/// Une photo prise à l'envers porte `EXIF Orientation = 3` (rotation 180°).
/// `UIImage` l'honore à l'affichage : partout où l'app passe par `AsyncImage`,
/// `Image(uiImage:)` ou `UIImageView`, la photo est droite.
///
/// `UIImage.cgImage`, lui, rend le bitmap BRUT — l'orientation est une
/// propriété de l'enveloppe `UIImage`, pas du `CGImage`. Et `CALayer.contents`
/// ne prend qu'un `CGImage`.
///
/// Résultat mesuré sur staging : la même photo, dans le même post, droite dans
/// la vue de détail (qui rend `post.media` par `AsyncImage`) et **à 180°** dans
/// la carte du fil (qui rend le CANVAS, dont les couches posent `.cgImage`).
///
/// > **Une conversion qui perd une propriété ne se signale nulle part.**
/// > `.cgImage` est correct, total, sans optionnel qui alerte — il rend juste
/// > une image sans son orientation. Le seul témoin possible est l'œil, sur
/// > une photo qui n'est pas droite : la moitié des photos de test le sont, et
/// > le défaut passe.
///
/// ## Pourquoi un helper et pas un correctif par site
///
/// Dix-huit `.cgImage` vivent dans les couches du canvas. Les corriger un à un
/// laisserait le dix-neuvième naître faux — et il naîtra, parce que
/// `CALayer.contents` ne sait rien prendre d'autre.
public enum CanvasImageOrientation {

    /// Le bitmap TEL QU'IL S'AFFICHE — orientation appliquée.
    ///
    /// `.up` court-circuite : la grande majorité des images (rendus internes,
    /// vignettes décodées, ThumbHash) n'a aucune rotation à appliquer, et un
    /// re-rendu par image coûterait une passe de dessin pour rien.
    public static func displayCGImage(_ image: UIImage?) -> CGImage? {
        guard let image else { return nil }
        guard image.imageOrientation != .up else { return image.cgImage }

        // `UIGraphicsImageRenderer` applique l'orientation en dessinant : c'est
        // la seule façon d'obtenir un `CGImage` qui corresponde à ce que l'œil
        // voit. Une transformation affine posée sur la couche ferait mentir
        // TOUT ce qui mesure ensuite la géométrie — le cadrage, le recadrage,
        // les positions normalisées des objets posés dessus.
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = image.scale
        format.opaque = false
        let redressee = UIGraphicsImageRenderer(size: image.size, format: format)
            .image { _ in image.draw(in: CGRect(origin: .zero, size: image.size)) }
        return redressee.cgImage ?? image.cgImage
    }
}
