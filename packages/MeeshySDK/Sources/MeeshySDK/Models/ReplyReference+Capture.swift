import Foundation

// MARK: - Ce que la citation laisse capturer

public extension ReplyReference {

    /// **La capture d'écran de la CITATION** (#9574) — la citation d'un
    /// contenu qui disparaît se rend dans la couche sécurisée, même posée dans
    /// un message ordinaire : elle en montre le texte ou la vignette.
    ///
    /// - Le message cité RÉEL, quand l'appelant l'a en mémoire, fait foi.
    /// - Sinon : la nature déclarée par le fil, l'échéance du cité
    ///   (`quotedExpiresAt` — un éphémère) ou un média cité protégé suffisent à
    ///   la bloquer.
    ///
    /// Contrairement à `quotedContentMayLeave`, une nature NON déclarée ne
    /// bloque pas : la passerelle ne déclare `effectFlags` sur une citation que
    /// si elle est voilée, et la citation d'un éphémère porte son échéance. Une
    /// citation sans aucune de ces marques est celle d'un message ordinaire —
    /// la bloquer envelopperait presque chaque réponse du fil sans rien
    /// protéger de plus.
    func quotedCapture(quotedMessage: MeeshyMessage?) -> ContentExitLaw.CaptureVerdict {
        if let quotedMessage, quotedMessage.id == messageId {
            return quotedMessage.contentExitLaw.capture
        }
        if let quotedExitNature, quotedExitNature != .ordinary { return .blocked }
        if quotedExpiresAt != nil || quotedMediaIsProtected { return .blocked }
        return .free
    }
}
