import Foundation
import MeeshySDK

// MARK: - Les règles pures de l'envoi de pièces jointes de la conversation
//
// Extraites de `ConversationView+AttachmentHandlers.swift` (cohésion) : ce que
// ces fonctions décident ne dépend que de leurs entrées. Une règle a UNE
// adresse : le site d'envoi (`sendMessageWithAttachments`) et les témoins
// l'appellent ici, sans façade sur `ConversationView`.

nonisolated enum OutgoingAttachmentRules {

    /// Décision pure et testable du popup de consentement vocal à l'envoi
    /// (2026-07-08) : uniquement quand le send contient de l'audio, que le
    /// consentement vocal manque, et qu'on n'a pas déjà proposé cette session.
    static func shouldPromptVoiceConsent(
        hasAudio: Bool,
        consentMissing: Bool,
        alreadyPrompted: Bool
    ) -> Bool {
        hasAudio && consentMissing && !alreadyPrompted
    }

    /// Read a local attachment's bytes off the MainActor. `Data(contentsOf:)`
    /// is a synchronous read; a multi-attachment send (dozens of MB of video)
    /// previously read every file inline on the MainActor — either while
    /// building the optimistic-send plan or inside the upload loop's `Task`
    /// (which inherits MainActor isolation by default) — freezing the UI for
    /// the whole read duration. Hops to a detached background Task — the
    /// same technique previously implemented in `AttachmentSendService.swift`
    /// (removed as dead code, 0 call sites) but never applied to this, the
    /// actually-live send path.
    static func readAttachmentFileBytes(_ url: URL) async -> Data? {
        await Task.detached(priority: .utility) { try? Data(contentsOf: url) }.value
    }

    /// Motif d'échec d'un envoi de pièces jointes, complété d'un conseil
    /// actionnable quand plusieurs pièces sont en jeu : réduire le nombre de
    /// pièces et réessayer. Un échec sur un envoi de 150 photos n'a pas le
    /// même remède qu'un échec sur une pièce isolée, et sans le dire on laisse
    /// l'utilisateur rejouer à l'identique le même envoi trop lourd.
    ///
    /// Silencieux sur une pièce unique — « réduire » n'y veut rien dire.
    /// Miroir du `withReduceAttachmentsHint` du composer web.
    static func uploadFailureReason(error: Error, attachmentCount: Int) -> String {
        guard attachmentCount > 1 else { return error.localizedDescription }
        return "\(error.localizedDescription) Réduisez le nombre de pièces jointes (\(attachmentCount) en cours) et réessayez."
    }

    /// Type de la bulle OPTIMISTE d'un groupe média, lu sur TOUTES ses pièces.
    /// Un document partait typé `.image` (la liste disait « Photo » jusqu'à
    /// l'écho serveur) parce que seule la première pièce était regardée, et
    /// seulement pour distinguer vidéo de « tout le reste ».
    ///
    /// Miroir EXACT de `messageTypeForClientAttachments`
    /// (`packages/shared/utils/attachment-message-type.ts`), la source unique
    /// de cette règle : une seule catégorie présente ⇒ cette catégorie,
    /// plusieurs catégories mélangées ⇒ `.file`. Le groupe `.visual` du
    /// planificateur mêle images, vidéos ET documents, donc le cas hétérogène
    /// est le cas NOMINAL — et ce que le client DÉCLARE, le serveur ne le
    /// corrige pas (`deriveMessageTypeForAttachments` est additive). Une règle
    /// manuscrite qui divergerait ici ferait sauter l'aperçu de liste de
    /// « Vidéo » à « Document » à la réconciliation, sans que rien ne le dise.
    static func optimisticMessageType(isAudioGroup: Bool, mimeTypes: [String]) -> Message.MessageType {
        if isAudioGroup { return .audio }
        let buckets = mimeTypes.map { attachmentBucket(forMime: $0) }
        guard let first = buckets.first, buckets.allSatisfy({ $0 == first }) else { return .file }
        return first
    }

    /// La catégorie d'un MIME — jamais `.text` : un `.txt` joint est une PIÈCE
    /// JOINTE, pas un message texte (même repli que `bucketForMime` côté
    /// partagé, y compris pour un MIME vide ou inconnu).
    private static func attachmentBucket(forMime mimeType: String) -> Message.MessageType {
        let mime = mimeType.lowercased()
        if mime.hasPrefix("image/") { return .image }
        if mime.hasPrefix("audio/") { return .audio }
        if mime.hasPrefix("video/") { return .video }
        return .file
    }
}
