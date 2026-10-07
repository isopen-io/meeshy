import Foundation

// MARK: - Ce que la citation laisse capturer

public extension ReplyReference {

    /// **La capture d'écran de la CITATION** (#9574, #9617) — la citation
    /// d'un contenu qui disparaît suit la loi de son cité, même posée dans un
    /// message ordinaire : elle en montre le texte ou la vignette.
    ///
    /// - Le message cité RÉEL, quand l'appelant l'a en mémoire, fait foi.
    /// - Sinon : la nature déclarée par le fil — vue unique ⇒ `blocked`
    ///   (noire), flamme ⇒ `announced` ; l'échéance du cité
    ///   (`quotedExpiresAt` — un éphémère) ⇒ `announced`.
    /// - Un média cité protégé (vue unique OU flou, que la citation ne
    ///   distingue pas) ⇒ `blocked` : fermé par défaut — sa citation ne montre
    ///   qu'un libellé, la noircir ne coûte rien.
    ///
    /// Contrairement à `quotedContentMayLeave`, une nature NON déclarée ne
    /// protège pas : la passerelle ne déclare `effectFlags` sur une citation que
    /// si elle est voilée, et la citation d'un éphémère porte son échéance. Une
    /// citation sans aucune de ces marques est celle d'un message ordinaire.
    func quotedCapture(quotedMessage: MeeshyMessage?) -> ContentExitLaw.CaptureVerdict {
        if let quotedMessage, quotedMessage.id == messageId {
            return quotedMessage.contentExitLaw.capture
        }
        if quotedExitNature == .viewOnce || quotedMediaIsProtected { return .blocked }
        if let quotedExitNature, quotedExitNature != .ordinary { return .announced }
        if quotedExpiresAt != nil { return .announced }
        return .free
    }
}
