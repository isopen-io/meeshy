import UIKit
import MediaPlayer

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

    /// Construit un `MPMediaItemArtwork` dont le `requestHandler` NE PORTE
    /// AUCUNE isolation d'acteur — crash réel (build 1746, 14/14 crash logs
    /// locaux identiques) : MediaPlayer.framework invoque ce handler de façon
    /// paresseuse et asynchrone, depuis SA PROPRE queue série privée (observée
    /// comme thread `*/accessQueue`, jamais le main thread, jamais via Swift
    /// Concurrency) — typiquement ~400-900ms après la publication de
    /// `MPNowPlayingInfoCenter.nowPlayingInfo`, quand il sérialise l'artwork en
    /// JPEG pour Control Center / lock screen / CarPlay / AirPlay.
    /// Un closure littéral écrit DIRECTEMENT dans `pushNowPlayingInfo()`
    /// (méthode d'une classe `@MainActor`, cible compilée avec
    /// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`) hérite de l'isolation
    /// `@MainActor` par inférence. Swift insère alors un contrôle d'executor
    /// au runtime (`swift_task_isCurrentExecutorImpl`) qui ÉCHOUE quand
    /// MediaPlayer l'invoque hors main, et trappe fatalement
    /// (`dispatch_assert_queue` → EXC_BREAKPOINT/SIGTRAP).
    /// Construire l'artwork ICI — dans ce `nonisolated enum` — retire toute
    /// isolation du closure littéral, quel que soit l'appelant : c'est le SEUL
    /// point de construction autorisé pour un `MPMediaItemArtwork` côté audio.
    static func makeArtwork(image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { _ in image }
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
