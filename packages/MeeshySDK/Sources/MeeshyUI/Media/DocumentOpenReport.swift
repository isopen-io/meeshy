import Foundation

/// #7362 — décide ce qu'il faut remonter à l'OUVERTURE d'un document reçu.
///
/// `viewed`, pas `downloaded` : l'onglet « Ouvert » de « Vu par » lit
/// `viewedAt` comme date d'ouverture et `viewCount` comme nombre d'ouvertures
/// (`MessageViewsConsumption.reading(for:in: .opened)`), et la passerelle les
/// pose pour toute pièce (`MessageMediaConsumptionService.markImageAsViewed`,
/// aucun filtre de type). `downloaded` garde son sens : l'enregistrement
/// explicite (`DocumentFullSheet.saveDocument()`). Lire un document dans la
/// fiche n'est pas l'enregistrer — l'étiqueter « téléchargé » affichait à
/// l'expéditeur une action que le lecteur n'a pas faite, sans jamais compter
/// ses ouvertures.
public nonisolated enum DocumentOpenReport {

    /// `nil` pour son propre document : un expéditeur qui relit ce qu'il
    /// vient d'envoyer ne s'auto-déclare pas destinataire.
    public static func bodyForOpening(isMine: Bool) -> AttachmentStatusBody? {
        guard !isMine else { return nil }
        return AttachmentStatusBody(action: "viewed", playPositionMs: 0, durationMs: 0, complete: true)
    }
}
