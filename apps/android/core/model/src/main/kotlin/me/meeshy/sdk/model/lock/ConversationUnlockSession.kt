package me.meeshy.sdk.model.lock

/**
 * Conversations verrouillees ouvertes pendant la session : un code accepte vaut pour la session
 * (memoire seulement, jamais persistee), efface a la deconnexion. Un instantane immuable, pour
 * rester pur ; le detenteur (sdk-core) le publie.
 */
public class ConversationUnlockSession private constructor(private val unlocked: Set<String>) {

    public constructor() : this(emptySet())

    /** Admise : non verrouillee, ou dont le code a ete accepte pendant cette session. */
    public fun admits(conversationId: String, isLocked: Boolean): Boolean =
        !isLocked || conversationId in unlocked

    public fun unlock(conversationId: String): ConversationUnlockSession =
        ConversationUnlockSession(unlocked + conversationId)

    /** Un verrou reposé (nouveau code) exige de nouveau son code. */
    public fun revoke(conversationId: String): ConversationUnlockSession =
        ConversationUnlockSession(unlocked - conversationId)

    public fun cleared(): ConversationUnlockSession = ConversationUnlockSession()

    public val unlockedIds: Set<String> get() = unlocked
}
