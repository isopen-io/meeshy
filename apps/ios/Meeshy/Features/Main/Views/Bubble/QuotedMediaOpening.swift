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

    /// **Ce que fait le toucher de la zone média — UNE décision, deux hôtes.**
    ///
    /// Depuis #8320 (directive porteur du 2026-09-27) un AUDIO cité se joue
    /// SUR PLACE et n'ouvre rien ; l'image et la vidéo s'ouvrent en plein
    /// écran ; le reste retombe sur le saut au message cité. Le Fil
    /// (`MessageListViewController.openQuotedMedia`) et la Rivière
    /// (`RiverConversationHost`) lisent ce geste ici : la Rivière avait gardé
    /// le plein écran audio de #8230 parce que la décision vivait chez le Fil.
    ///
    /// `.playInPlace` ne promet pas la lecture : le verrou du lecteur partagé
    /// (`ConversationViewModel.toggleQuotedAudio`) peut encore la refuser, et
    /// l'hôte retombe alors sur le saut.
    nonisolated enum Gesture {
        case playInPlace
        case open(MeeshyMessageAttachment)
        case followQuote
    }

    static func gesture(for reference: ReplyReference, quoted: MeeshyMessage?) -> Gesture {
        if reference.quotedMediaKind == .audio { return .playInPlace }
        guard let attachment = attachment(for: reference, quoted: quoted), attachment.type != .audio else {
            return .followQuote
        }
        return .open(attachment)
    }

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
