import Foundation

// MARK: - La zone LECTURE d'une citation audio (#8320)

public extension ReplyReference {

    /// Les pistes d'un audio cité, telles que la passerelle les sert sur
    /// `replyTo.attachments[].translations` : la langue d'ORIGINE du message
    /// cité et, par langue, l'adresse de sa piste TTS. De quoi élire, hors de
    /// la fenêtre chargée, la même piste que le vocal d'origine.
    struct QuotedAudioTracks: Codable, Equatable, Sendable {
        public let originalLanguage: String?
        public let urlsByLanguage: [String: String]

        public init(originalLanguage: String?, urlsByLanguage: [String: String]) {
            self.originalLanguage = originalLanguage
            self.urlsByLanguage = urlsByLanguage
        }

        /// Les pistes d'une pièce servie : seules celles qui portent une
        /// adresse comptent (le TTS a pu produire le texte sans la voix).
        public init(originalLanguage: String?, translations: [String: APIAttachmentTranslation]?) {
            let urls = (translations ?? [:]).reduce(into: [String: String]()) { acc, entry in
                guard let url = entry.value.url?.trimmingCharacters(in: .whitespaces), !url.isEmpty else { return }
                acc[entry.key.lowercased()] = url
            }
            self.init(originalLanguage: originalLanguage, urlsByLanguage: urls)
        }
    }

    /// ZONE LECTURE côté DONNÉE : cette citation désigne-t-elle un AUDIO que
    /// l'on a le droit de jouer sur place ?
    ///
    /// Non pour une story ou une humeur, un média PROTÉGÉ (vue unique,
    /// flouté, chiffré — au niveau du message ou de la pièce), un message
    /// cité SUPPRIMÉ, un éphémère EXPIRÉ, ou tout ce qui n'est pas un audio :
    /// la citation garde alors son placeholder et son saut. Le verrou de
    /// l'hôte relit en plus le message RÉEL quand il est en mémoire.
    func offersQuotedAudioPlayback(now: Date) -> Bool {
        guard !isStoryReply, !quotedMediaIsProtected, !isQuotedMessageDeleted else { return false }
        if let quotedExpiresAt, quotedExpiresAt <= now { return false }
        return quotedMediaKind == .audio
    }

    /// L'adresse de la piste à jouer HORS de la fenêtre chargée, pour la
    /// langue que le Prisme audio a élue (`nil` = l'original). Une langue
    /// élue sans piste retombe sur l'original — jamais sur une autre piste.
    func quotedAudioUrl(forLanguage language: String?) -> String? {
        guard let fileUrl = attachmentFileUrl, !fileUrl.isEmpty else { return nil }
        guard let language else { return fileUrl }
        return quotedAudioTracks?.urlsByLanguage[language.lowercased()] ?? fileUrl
    }
}
