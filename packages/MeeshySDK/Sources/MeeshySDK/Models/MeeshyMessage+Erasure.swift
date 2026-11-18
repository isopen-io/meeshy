import Foundation

/// **Le cache de fil suit la même loi que la base** (#19305, `MessageEnrichmentLaw`) : un message dont le contenu est
/// parti — supprimé, échu, vue unique ouverte — ne garde dans `cache.messages` que son enveloppe. Avant, la pierre
/// tombale du cache ne vidait que `content` : les pièces (nom de fichier, légende, transcription, pistes traduites), le
/// lieu, l'autocollant et les liens suivis restaient lisibles sur disque, et une vue unique ouverte sur un autre
/// appareil, conversation fermée, gardait son contenu entier.
public extension MeeshyMessage {

    /// Vide ce que le message contenait. L'enveloppe — identifiant, auteur, heure, type, drapeaux, réactions — reste.
    mutating func eraseContent() {
        content = ""
        attachments = []
        sticker = nil
        location = nil
        trackedLinkMap = [:]
    }

    /// Scelle le message comme vue unique **déjà ouverte** par ce lecteur (jumelle de `MessageRecord.sealAsOpenedViewOnce`).
    /// Idempotent : l'instant d'ouverture déjà gravé n'est jamais déplacé.
    mutating func sealAsOpenedViewOnce(at date: Date) {
        viewOnceOpenedAt = viewOnceOpenedAt ?? date
        isViewOnce = true
        eraseContent()
    }
}
