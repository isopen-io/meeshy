package me.meeshy.app.chat

/**
 * Whether the end-to-end-encryption notice should sit at the top of the message
 * list — the faithful port of iOS `ConversationView.encryptionDisclaimer`'s guard
 * (`conv.encryptionMode != nil && !hasOlderMessages && !isLoadingInitial`).
 *
 * The notice appears once the reader has reached the very start of history
 * ([hasOlderMessages] false) on an encrypted conversation, and never while the
 * cold-start skeleton is up ([isLoadingInitial]).
 *
 * SOTA over iOS's `!= nil`: a blank mode (a serialization artifact, not a real
 * encryption posture) is treated as no mode and never surfaces the notice.
 */
object EncryptionDisclaimer {

    fun shouldShow(
        encryptionMode: String?,
        hasOlderMessages: Boolean,
        isLoadingInitial: Boolean,
    ): Boolean = !encryptionMode.isNullOrBlank() && !hasOlderMessages && !isLoadingInitial
}
