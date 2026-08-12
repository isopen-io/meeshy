import Foundation
import MeeshySDK

/// Éligibilité d'envoi d'un message de conversation — fonction PURE, partagée
/// par les deux gardes qui décidaient chacun dans leur coin :
/// - `ConversationView.sendMessageWithAttachments` (garde du composer) ;
/// - `ConversationViewModel.sendMessage` (garde du transport).
///
/// Avant le lot 2 (spec 2026-07-30, chaîne d'écriture du lieu), les deux
/// gardes exigeaient « texte ou pièce jointe » : un message « lieu seul »
/// était refusé net, deux fois. Centraliser la règle ici garantit que les
/// deux portes acceptent exactement les mêmes envois — et la rend testable
/// sans simulateur (une garde de source ne prouve que la présence d'un mot).
nonisolated enum SendEligibility {

    /// `true` dès qu'un contenu porteur existe : texte non vide (après trim),
    /// au moins une pièce jointe, ou un lieu partagé.
    static func canSend(text: String, attachmentIds: [String], location: SharedPlace?) -> Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !attachmentIds.isEmpty
            || location != nil
    }
}
