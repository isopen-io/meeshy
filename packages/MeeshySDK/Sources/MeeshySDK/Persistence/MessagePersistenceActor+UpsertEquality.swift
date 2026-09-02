import Foundation

// Extrait de `MessagePersistenceActor.swift` (2 419 lignes, plus du double du
// budget 800-1100 de la directive 2026-08-28, qui interdit d'AJOUTER à un
// fichier hors budget). Le lot #4823 ajoute une colonne à l'upsert : on
// extrait d'abord, on ajoute ensuite. Responsabilité tenue ici : DIRE si un
// upsert a changé une ligne — et rien d'autre.
//
// Interne au module (plus `fileprivate`) parce que l'actor l'appelle depuis
// son propre fichier ; aucun autre site n'a de raison de s'en servir.

/// Field-level equality over exactly the columns the `upsertFromAPIMessages`
/// update branch mutates. CANNOT use `MessageRecord ==` here: that
/// conformance is intentionally O(1) (`localId` + `changeVersion` only, for
/// MessageStore's refresh skip) and the comparison runs BEFORE the
/// changeVersion bump — it would report every mutation as "unchanged" and
/// silently drop real content/reaction/state updates.
func upsertMutatedFieldsEqual(_ a: MessageRecord, _ b: MessageRecord) -> Bool {
    let contentAndState = a.content == b.content && a.serverId == b.serverId
        && a.state == b.state && a.isEdited == b.isEdited
        && a.editedAt == b.editedAt && a.deletedAt == b.deletedAt
        // `createdAt` is the immutable server send time, but a row first
        // written by the Notification Service Extension pre-persist carries a
        // PLACEHOLDER value (the push-receipt time). Comparing it here lets the
        // canonical reconcile detect — and persist — the correction.
        && a.createdAt == b.createdAt && a.cachedTimeString == b.cachedTimeString
    let attachmentsAndReactions = a.attachmentsJson == b.attachmentsJson
        && a.reactionsJson == b.reactionsJson && a.reactionCount == b.reactionCount
    let encryptionAndDelivery = a.isEncrypted == b.isEncrypted && a.encryptionMode == b.encryptionMode
        && a.deliveredCount == b.deliveredCount && a.readCount == b.readCount
        && a.deliveredToAllAt == b.deliveredToAllAt && a.readByAllAt == b.readByAllAt
    let sender = a.senderId == b.senderId && a.senderName == b.senderName
        && a.senderUsername == b.senderUsername && a.senderAvatarURL == b.senderAvatarURL
    let replyAndForward = a.replyToId == b.replyToId && a.storyReplyToId == b.storyReplyToId
        && a.replyToJson == b.replyToJson && a.forwardedFromId == b.forwardedFromId
        && a.forwardedFromConversationId == b.forwardedFromConversationId
        && a.forwardedFromJson == b.forwardedFromJson
    // **`messageSource` et `messageType` DOIVENT figurer ici** (régression
    // 2026-08-24). Ils décident du RENDU — un message `system` s'affiche en
    // avis dédié, un `user` en parole avec avatar et nom. Ils manquaient à
    // cette comparaison : une ligne née `"user"` (le chemin de réconciliation
    // depuis le cache l'écrivait en dur) recevait ensuite la charge canonique
    // portant `"system"`, l'upsert jugeait la ligne INCHANGÉE, et le mensonge
    // devenait définitif — plus aucune correction du serveur ne pouvait
    // l'atteindre. Symptôme : les avis d'arrivée rendus comme des paroles,
    // avec le texte de repli du gateway en guise de bulle.
    let kindAndSource = a.messageSource == b.messageSource && a.messageType == b.messageType
    let extras = a.mentionedUsersJson == b.mentionedUsersJson
        && a.callSummaryJson == b.callSummaryJson && a.joinNoticeJson == b.joinNoticeJson
        && a.effectFlags == b.effectFlags
        && a.locationJson == b.locationJson
        && a.stickerJson == b.stickerJson
    return contentAndState && attachmentsAndReactions && encryptionAndDelivery
        && sender && replyAndForward && extras && kindAndSource
}
