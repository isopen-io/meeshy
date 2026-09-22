import Foundation

/// #7362 — décide ce qu'il faut remonter à l'OUVERTURE d'un document reçu.
///
/// `AttachmentConsumptionResolver.primaryAction` (MeeshySDK) ne tient qu'UNE
/// action de consommation pour un fichier générique : `.downloaded` — il
/// n'existe aucune action « opened » dédiée côté passerelle
/// (`AttachmentStatusBodySchema`, `services/gateway/src/routes/messages-writes.ts`).
/// C'est ce même marqueur qui alimente l'onglet « Ouvert » de « Vu par »
/// (`AttachmentConsumptionResolver.Action.downloaded`) — pas un nom
/// malheureux à corriger, le contrat serveur réel.
///
/// `DocumentFullSheet.saveDocument()` le reportait déjà, mais seulement sur
/// le bouton Enregistrer explicite : lire le document dans la fiche sans
/// l'enregistrer dans Fichiers ne remontait rien. Cette règle est le MÊME
/// corps, posé à l'ouverture — `nonisolated` pour rester une décision pure,
/// appelable depuis un test synchrone, sur le modèle de
/// `VideoDismissWatchReport`.
public nonisolated enum DocumentOpenReport {

    /// `nil` pour son propre document : un expéditeur qui relit ce qu'il
    /// vient d'envoyer ne s'auto-déclare pas destinataire.
    public static func bodyForOpening(isMine: Bool) -> AttachmentStatusBody? {
        guard !isMine else { return nil }
        return AttachmentStatusBody(action: "downloaded", playPositionMs: 0, durationMs: 0, complete: true)
    }
}
