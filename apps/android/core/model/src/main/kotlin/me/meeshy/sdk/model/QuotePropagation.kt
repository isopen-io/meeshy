package me.meeshy.sdk.model

/**
 * Les citations suivent leur message — miroir de `followQuotes` (iOS, `MessagePersistenceActor+EditDelete`).
 *
 * Une réponse grave l'aperçu de son parent dans `replyTo`. Quand le parent est modifié, le texte
 * cité devient le nouveau texte ; quand il est supprimé, la citation est SCELLÉE (plus rien de lui
 * ne se lit dans les réponses). Fonctions pures : l'écriture en base est l'affaire de l'appelant.
 */
object QuotePropagation {

    /** Cette réponse cite-t-elle l'un des identifiants du parent (id serveur OU local) ? */
    fun quotes(reply: ApiMessage, parentIds: Collection<String>): Boolean {
        val quoted = reply.replyTo?.id ?: reply.replyToId ?: return false
        return quoted in parentIds
    }

    /**
     * Le texte du parent est-il un secret que la citation ne doit pas reprendre ? Chiffré, vue
     * unique, flouté, ou déjà purgé en « vue unique ouverte » — même lecture que la passerelle.
     */
    fun holdsProtectedContent(parent: ApiMessage): Boolean =
        parent.isEncrypted == true || parent.isViewOnce == true || parent.isBlurred == true ||
            ((parent.effectFlags?.toLong() ?: 0L) and AttachmentProtection.MASKING_FLAGS) != 0L

    /**
     * La réponse [reply] après la modification de son parent ([parentIds]) en [newContent]. Rendue
     * telle quelle (même instance) quand elle ne cite pas le parent, quand le parent est protégé
     * ([parentProtected]), quand la citation est scellée (supprimée) ou protégée, ou quand le texte
     * cité est déjà le bon. Ce texte est l'ORIGINAL : ses traductions de citation sont retirées,
     * elles ne disent plus le nouveau texte.
     */
    fun followEdit(
        reply: ApiMessage,
        parentIds: Collection<String>,
        newContent: String,
        parentProtected: Boolean,
    ): ApiMessage {
        val quote = reply.replyTo ?: return reply
        if (parentProtected || !quotes(reply, parentIds)) return reply
        if (isSealed(quote) || quote.isProtected) return reply
        if (quote.content == newContent) return reply
        return reply.copy(replyTo = quote.copy(content = newContent, translations = null))
    }

    /**
     * La réponse [reply] après la suppression de son parent : la citation est scellée — texte,
     * traductions et pièces effacés, `deletedAt` posé. Déjà scellée ⇒ rendue telle quelle.
     */
    fun sealDeleted(reply: ApiMessage, parentIds: Collection<String>, deletedAtIso: String): ApiMessage {
        val quote = reply.replyTo ?: return reply
        if (!quotes(reply, parentIds) || isSealed(quote)) return reply
        return reply.copy(
            replyTo = quote.copy(
                content = "",
                translations = null,
                attachments = null,
                attachmentReplyTo = null,
                deletedAt = deletedAtIso,
            ),
        )
    }

    /** Une citation scellée : son message a été supprimé. */
    fun isSealed(quote: ApiMessageReplyPreview): Boolean = quote.deletedAt != null
}
