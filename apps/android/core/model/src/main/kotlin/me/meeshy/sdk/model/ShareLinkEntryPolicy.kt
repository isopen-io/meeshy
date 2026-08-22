package me.meeshy.sdk.model

/**
 * The five facts that suffice to decide how a person enters a conversation by a
 * share link. Deliberately VALUES, not services: the rule looks nothing up
 * itself. The caller resolves the link ([me.meeshy.sdk.model.ShareLinkInfo] via
 * the anonymous preview endpoint), consults its guest-session store and its
 * conversation list, then asks the question.
 *
 * Faithful port of iOS `ShareLinkEntryFacts`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkEntryPolicy.swift`).
 */
data class ShareLinkEntryFacts(
    /** Conversation the link resolves to. */
    val conversationId: String,
    /** An account is available on this device. */
    val isAuthenticated: Boolean,
    /** That account is already a member of the target conversation. */
    val isAlreadyMember: Boolean,
    /** The link refuses account-less visitors (`requireAccount`). */
    val linkRequiresAccount: Boolean,
    /** A guest session already exists for this link (`AnonymousSessionStore`). */
    val hasStoredGuestSession: Boolean,
)

/**
 * What the app must do with a conversation link — an intention, not a
 * navigation: the presentation (choice sheets, routing) stays app-side.
 *
 * Faithful port of iOS `ShareLinkEntryIntent`.
 */
sealed interface ShareLinkEntryIntent {
    /** Open the conversation — there is nothing to join. */
    data class OpenConversation(val conversationId: String) : ShareLinkEntryIntent

    /** Join silently with the account already present, no question asked. */
    data class JoinWithAccount(val conversationId: String) : ShareLinkEntryIntent

    /** Open the anonymous join form. */
    data object JoinAnonymously : ShareLinkEntryIntent

    /** Resume the guest session already stored for this link. */
    data object ResumeGuestSession : ShareLinkEntryIntent

    /** Ask: this account, or anonymous? */
    data class ChooseIdentity(val conversationId: String) : ShareLinkEntryIntent

    /** The link demands an account and the device has none. */
    data object RequiresAccount : ShareLinkEntryIntent
}

/**
 * How does one enter by a conversation link?
 *
 * The app used to answer by its authentication state alone: no account → guest
 * flow, an account → SILENT join with that account. The person never had the
 * choice, at the exact moment it is theirs — a public link opens under one's
 * real name or a pseudonym, and a join is not undone by a gesture. A link
 * received in an unknown group committed the real account — name, photo,
 * history — without asking.
 *
 * The rule is PURE: five facts in, one intent out, no I/O, no state. Choice
 * sheets and navigation stay app-side. Faithful port of iOS
 * `ShareLinkEntryPolicy.intent(for:)`.
 */
object ShareLinkEntryPolicy {

    fun intent(facts: ShareLinkEntryFacts): ShareLinkEntryIntent {
        if (!facts.isAuthenticated) {
            // Without an account the order matters: a guest session already open
            // on THIS link is an identity acquired in this conversation — the
            // only one the person has here. Re-asking would erase it.
            if (facts.hasStoredGuestSession) return ShareLinkEntryIntent.ResumeGuestSession
            return if (facts.linkRequiresAccount) {
                ShareLinkEntryIntent.RequiresAccount
            } else {
                ShareLinkEntryIntent.JoinAnonymously
            }
        }

        // Already a member: nothing to decide, and asking would suggest a second
        // identity is possible where one is already named.
        if (facts.isAlreadyMember) {
            return ShareLinkEntryIntent.OpenConversation(conversationId = facts.conversationId)
        }

        // Offering anonymity on a link that demands an account would offer a door
        // the server refuses (403 REQUIRES_ACCOUNT).
        if (facts.linkRequiresAccount) {
            return ShareLinkEntryIntent.JoinWithAccount(conversationId = facts.conversationId)
        }

        // A dormant guest session does not remove the choice from someone who now
        // has an account: it becomes one of the two branches, the one the
        // presentation labels "resume anonymously".
        return ShareLinkEntryIntent.ChooseIdentity(conversationId = facts.conversationId)
    }
}
