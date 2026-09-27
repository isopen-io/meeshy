import Foundation
import MeeshySDK

// MARK: - La pièce qu'ouvre la zone média d'une citation (#8283)

/// **Quelle pièce le plein écran ouvre depuis une citation — UNE règle, deux
/// hôtes.**
///
/// Le Fil (`MessageListViewController.openQuotedMedia`) la tenait seul. La
/// Rivière ouvre le MÊME plein écran depuis sa citation (#8283) : réécrire
/// l'élection et le verrou chez elle aurait fait deux règles, et la première
/// qui bouge ouvrirait un secret chez l'autre.
///
/// - la pièce est élue par `ReplyReference.citedAttachment(among:)` quand le
///   message cité est dans la fenêtre, et reconstruite depuis la citation
///   (`quotedAttachment`, jamais pour un secret) quand il n'y est pas ;
/// - une pièce à vue unique ou floutée, ou une citation qui DÉCLARE son média
///   protégé, n'ouvre rien : le média garde son propre geste de révélation
///   sur le message d'origine ;
/// - seuls l'image, la vidéo et l'audio ont un plein écran.
///
/// `nil` ⇒ l'hôte retombe sur le saut au message cité.
nonisolated enum QuotedMediaOpening {

    static func attachment(for reference: ReplyReference, quoted: MeeshyMessage?) -> MeeshyMessageAttachment? {
        let resolved = quoted.flatMap { reference.citedAttachment(among: $0.attachments) }
            ?? (quoted == nil ? reference.quotedAttachment : nil)
        guard let attachment = resolved,
              !(attachment.isViewOnce || attachment.isBlurred),
              !reference.quotedMediaIsProtected
        else { return nil }
        switch attachment.type {
        case .image, .video, .audio:
            return attachment
        case .file, .location:
            return nil
        }
    }
}
