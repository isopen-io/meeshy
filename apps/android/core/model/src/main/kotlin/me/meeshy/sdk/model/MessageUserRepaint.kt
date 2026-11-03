package me.meeshy.sdk.model

/**
 * `user:updated` portée aux copies d'auteur qu'une LIGNE DE CACHE emporte : l'expéditeur du message, la
 * citation et la référence de transfert qui gravent son identifiant, l'auteur de la dernière ligne et les
 * participants d'une conversation. Miroir de `UserProfileRepaint+Quotes.swift` et de
 * `repainted(_ record: MessageRecord)` (iOS) ; chaque copie est appariée par l'id d'UTILISATEUR gravé,
 * jamais par le nom, et rend `null` quand rien ne change (l'appelant n'écrit pas une ligne intacte).
 * Le contour (décor de profil) voyage avec l'expéditeur : il n'est jamais effacé par une repeinture.
 */
fun UserUpdatedEvent.repainted(message: ApiMessage): ApiMessage? {
    val sender = message.sender?.let { repainted(it) }
    val quote = message.replyTo?.let { repainted(it) }
    val forward = message.forwardedFrom?.let { repainted(it) }
    if (sender == null && quote == null && forward == null) return null
    return message.copy(
        sender = sender ?: message.sender,
        replyTo = quote ?: message.replyTo,
        forwardedFrom = forward ?: message.forwardedFrom,
    )
}

private fun UserUpdatedEvent.repainted(quote: ApiMessageReplyPreview): ApiMessageReplyPreview? {
    if (quote.authorUserId != userId) return null
    val sender = quote.sender?.let { repainted(it) }
    val name = composedName
    val label = if (name != null && name != quote.senderDisplayName) name else quote.senderDisplayName
    if (sender == null && label == quote.senderDisplayName) return null
    return quote.copy(sender = sender ?: quote.sender, senderDisplayName = label)
}

private fun UserUpdatedEvent.repainted(forward: ApiForwardedFrom): ApiForwardedFrom? {
    val sender = forward.sender?.let { repainted(it) } ?: return null
    return forward.copy(sender = sender)
}

/** La ligne d'une conversation en cache : ses participants et l'auteur de sa dernière ligne (« Bob : … »). */
fun UserUpdatedEvent.repainted(conversation: ApiConversation): ApiConversation? {
    val participants = conversation.participants.repaintedElements { repainted(it) }
    val last = conversation.lastMessage?.let { repaintedAuthor(it) }
    if (participants == null && last == null) return null
    return conversation.copy(
        participants = participants ?: conversation.participants,
        lastMessage = last ?: conversation.lastMessage,
    )
}

private fun UserUpdatedEvent.repaintedAuthor(last: ApiConversationLastMessage): ApiConversationLastMessage? {
    if (last.senderId != userId) return null
    val name = composedName ?: return null
    if (last.senderName == null || last.senderName == name) return null
    return last.copy(senderName = name)
}
