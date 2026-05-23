import CoreGraphics

public extension MeeshyMessageAttachment {

    /// Ratio width / height de la vidéo. `nil` si dimensions inconnues ou nulles.
    var videoAspectRatio: CGFloat? {
        guard let w = width, let h = height, w > 0, h > 0 else { return nil }
        return CGFloat(w) / CGFloat(h)
    }

    /// Hauteur cible pour une largeur donnée, plafonnée à `maxRatio × width`.
    /// Fallback `16:9` si dimensions inconnues.
    ///
    /// - Parameters:
    ///   - width: largeur disponible en pt.
    ///   - maxRatio: cap maximal du ratio height/width. `1.6` = portrait 5:8 max.
    /// - Returns: hauteur en pt, garantie `> 0`.
    func videoHeight(forWidth width: CGFloat, maxRatio: CGFloat = 1.6) -> CGFloat {
        let ratio = videoAspectRatio ?? (16.0 / 9.0)
        return min(width / ratio, width * maxRatio)
    }
}
