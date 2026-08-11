import UIKit

/// Artwork de la carte Now Playing (lock screen / Control Center) pour l'audio
/// de conversation. Règle produit :
/// avatar de l'AUTEUR > avatar de la CONVERSATION (groupe) > icône de l'app —
/// et quand un avatar existe, l'icône de l'app est apposée en badge bas-gauche
/// pour que la carte reste identifiable Meeshy.
nonisolated enum NowPlayingArtwork {

    /// Côté du canvas carré rendu pour `MPMediaItemArtwork`.
    static let canvasSide: CGFloat = 600
    /// Fraction du côté occupée par le badge icône app (bas-gauche).
    static let badgeFraction: CGFloat = 0.26
    /// Marge du badge depuis les bords, en fraction du côté.
    static let badgePaddingFraction: CGFloat = 0.04

    /// Première URL d'avatar exploitable : auteur puis conversation.
    /// `nil` quand aucune n'est renseignée — l'appelant retombe sur l'icône.
    static func preferredAvatarURL(
        senderAvatarURL: String?,
        conversationArtworkURL: String?
    ) -> String? {
        if let sender = senderAvatarURL, !sender.isEmpty { return sender }
        if let conversation = conversationArtworkURL, !conversation.isEmpty { return conversation }
        return nil
    }

    /// Icône de l'app depuis le bundle (dernier fichier de
    /// `CFBundlePrimaryIcon.CFBundleIconFiles` = la plus grande variante).
    /// L'asset catalog n'expose pas "AppIcon" par nom — seul l'Info.plist
    /// compilé référence les fichiers réellement embarqués.
    static func appIconImage(in bundle: Bundle = .main) -> UIImage? {
        guard let icons = bundle.infoDictionary?["CFBundleIcons"] as? [String: Any],
              let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
              let files = primary["CFBundleIconFiles"] as? [String],
              let name = files.last
        else { return nil }
        return UIImage(named: name, in: bundle, with: nil)
    }

    /// Compose l'artwork final : avatar plein cadre (aspect-fill) + badge
    /// icône app bas-gauche ; sans avatar, icône plein cadre ; rien -> `nil`.
    static func compose(avatar: UIImage?, appIcon: UIImage?) -> UIImage? {
        guard avatar != nil || appIcon != nil else { return nil }

        let side = canvasSide
        let canvas = CGRect(x: 0, y: 0, width: side, height: side)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1

        return UIGraphicsImageRenderer(size: canvas.size, format: format).image { context in
            guard let avatar else {
                appIcon?.draw(in: canvas)
                return
            }
            drawAspectFill(avatar, in: canvas, context: context)
            guard let appIcon else { return }

            let badgeSide = side * badgeFraction
            let padding = side * badgePaddingFraction
            let badgeRect = CGRect(
                x: padding,
                y: side - padding - badgeSide,
                width: badgeSide,
                height: badgeSide
            )
            context.cgContext.saveGState()
            UIBezierPath(roundedRect: badgeRect, cornerRadius: badgeSide * 0.22).addClip()
            appIcon.draw(in: badgeRect)
            context.cgContext.restoreGState()
        }
    }

    private static func drawAspectFill(
        _ image: UIImage, in rect: CGRect, context: UIGraphicsImageRendererContext
    ) {
        guard image.size.width > 0, image.size.height > 0 else { return }
        let scale = max(rect.width / image.size.width, rect.height / image.size.height)
        let scaled = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let origin = CGPoint(
            x: rect.midX - scaled.width / 2,
            y: rect.midY - scaled.height / 2
        )
        context.cgContext.saveGState()
        UIBezierPath(rect: rect).addClip()
        image.draw(in: CGRect(origin: origin, size: scaled))
        context.cgContext.restoreGState()
    }
}
