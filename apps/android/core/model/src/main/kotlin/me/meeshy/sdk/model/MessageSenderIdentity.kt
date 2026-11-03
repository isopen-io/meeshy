package me.meeshy.sdk.model

/**
 * L'identité de l'expéditeur telle que la bulle la montre — miroir de la projection de
 * `APIMessage.toMessage` (iOS : `senderName`, `senderUsername`, `senderAvatarURL`,
 * `senderIsAnonymous`, `senderHasAccount`, `senderRing`).
 *
 * Le TYPE de l'auteur décide s'il a un compte ; un pseudo `ano_…` ne prouve rien.
 */
public data class MessageSenderIdentity(
    val name: String?,
    val username: String?,
    val avatarUrl: String?,
    val userId: String?,
    val isAnonymous: Boolean,
    val hasAccount: Boolean,
    val avatarRing: ServedProfileDecorItem?,
) {
    /** L'identité de la session qui remplace l'enveloppe absente de MON écho allégé. */
    public data class Session(val displayName: String?, val username: String?)

    public companion object {
        /**
         * @param sender l'enveloppe servie, absente d'un écho socket allégé.
         * @param session mon identité locale : repli STRICTEMENT borné à [isMe], jamais le nom d'un autre.
         */
        public fun resolve(
            sender: ApiMessageSender?,
            source: MessageSourceKind,
            isMe: Boolean,
            session: Session? = null,
        ): MessageSenderIdentity {
            val servedName = sender?.name?.takeIf { it.isNotBlank() }
            val servedUsername = (sender?.username ?: sender?.user?.username)?.takeIf { it.isNotBlank() }
            return MessageSenderIdentity(
                name = servedName ?: if (isMe) session?.displayName?.takeIf { it.isNotBlank() } else null,
                username = servedUsername ?: if (isMe) session?.username?.takeIf { it.isNotBlank() } else null,
                avatarUrl = sender?.resolvedAvatar,
                userId = sender?.resolvedUserId,
                isAnonymous = sender?.isAnonymous ?: false,
                hasAccount = sender?.hasAccount ?: (isMe || source.impliesAccount),
                avatarRing = sender?.profileDecor?.avatarRing,
            )
        }
    }
}
