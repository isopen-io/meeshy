import Foundation

// Extrait de `MessagePersistenceActor.swift` (2 328 lignes, hors budget
// 1000-1200 — un fichier hors budget est interdit d'ajout). Le lot #4945
// fait descendre le Prisme du lecteur jusqu'à la citation gravée par le
// chemin SOCKET : on extrait d'abord, on ajoute ensuite. Responsabilité tenue
// ici : dire QUEL prisme le puits d'ingestion bufferisée remet à
// `upsertFromAPIMessages(_:preferredLanguages:)` — et rien d'autre.

extension MessagePersistenceActor {
    /// Le prisme ORDONNÉ du lecteur, lu au moment où le puits d'ingestion
    /// bufferisée (`.upsertAPIMessages`, alimenté par
    /// `bufferIncomingAPIMessages`) écrit la ligne — donc au moment où la
    /// citation `replyToJson` est composée par `APIMessageReplyTo
    /// .toReplyReference(preferredLanguages:)`.
    ///
    /// C'est LE site qui manquait : `ConversationSyncEngine.apiMessagePersistor`
    /// (relais global de `message:new`, `ensureMessages` poussé par une
    /// notification, pagination) et le gestionnaire de socket de la
    /// conversation ouverte convergent tous deux ici sans transporter de
    /// prisme, et le défaut `[]` servait alors l'ORIGINAL — une citation en
    /// anglais sur le fil temps réel, en français au rechargement REST.
    /// Résoudre le prisme ICI, plutôt qu'à chaque producteur, ferme les deux
    /// chemins d'un coup et n'oblige aucun relais à recopier un champ de plus.
    ///
    /// Même autorité que `ConversationSyncEngine.currentPreferredLanguages`
    /// (aperçu de liste) : `MeeshyUser.preferredContentLanguages`, lue sur le
    /// MainActor où vit `AuthManager`. Vide sans session — un participant
    /// anonyme lit l'original, comme sur le chemin REST.
    ///
    /// `nonisolated` : elle ne lit rien de l'actor et s'appelle depuis la
    /// boucle d'écriture, où l'isolation de l'actor n'est pas acquise.
    nonisolated static func readerPrism() async -> [String] {
        await MainActor.run { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
    }
}
